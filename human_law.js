// --- human_law.js (球員共通規則與基礎類別) ---
(function() {
    class HumanLaw {
        constructor() {
            this.maxStamina = 10000.0;
            this.stamina = 10000.0;
            this.runSpeed = 7.0;           // 全力奔跑速度 (m/s)
            this.drainRate = 100.0 / 14.0; // 基礎跑完耗時參考（每秒扣%）
            this.recoveryRate = 100.0 / 5.0;// 喘息恢復率（每秒加%）
            this.restDuration = 5.0;       // 強制喘息時間 (秒)

            // --- 物理與動能換算參數 ---
            this.weight = 75.0;            // 預設球員體重 (kg)，子類別可覆寫
            this.gravity = 9.8;            // 重力加速度 (m/s^2)
            this.muKinetic = 0.05;         // 地面動摩擦係數 (配合球場草皮阻尼調整，可依需求微調)
            this.joulesPerStamina = 500.0; // 能量換算比例：每消耗 1% 體力所對應的機械功 (焦耳 J)
        }

        // 1. 180度視野內事物判定 (Dot Product >= 0)
        checkFOV(playerObj, bPos, distToBallXZ) {
            const forwardX = Math.sin(playerObj.rotation.y);
            const forwardZ = Math.cos(playerObj.rotation.y);
            let dotBall = 0;
            if (distToBallXZ > 0.001) {
                dotBall = (forwardX * ((bPos.x - playerObj.position.x) / distToBallXZ)) + 
                          (forwardZ * ((bPos.z - playerObj.position.z) / distToBallXZ));
            }
            return dotBall >= 0;
        }

        // 轉身輔助函式
        turnTowards(playerObj, targetAngle, turnSpeed, dt) {
            let angleDiff = targetAngle - playerObj.rotation.y;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            playerObj.rotation.y += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), turnSpeed * dt);
        }

        // 2. & 3. 基於物理作功 (W = F * ds) 的體力消耗公式與恢復公式
        updateStaminaAndRest(playerObj, dt, isRunning) {
            if (playerObj.restTimer === undefined) playerObj.restTimer = 0;
            if (playerObj.stamina === undefined) playerObj.stamina = this.stamina;

            // 初始化上一幀位置與速度，用於自動追蹤每瞬間的位移 ds 與加速度 a
            if (playerObj._prevPos === undefined) {
                playerObj._prevPos = { x: playerObj.position.x, z: playerObj.position.z };
                playerObj._prevVel = { x: 0, z: 0 };
            }

            // 計算本幀位移向量與距離 ds (m)
            const dx = playerObj.position.x - playerObj._prevPos.x;
            const dz = playerObj.position.z - playerObj._prevPos.z;
            const ds = Math.sqrt(dx * dx + dz * dz);

            // 計算當下速度向量 (m/s)
            const vx = (dt > 0.0001) ? (dx / dt) : 0;
            const vz = (dt > 0.0001) ? (dz / dt) : 0;

            // 計算瞬間加速度大小 a (m/s^2)
            // 僅計算正向加速（煞車減速由地面摩擦力輔助，不額外計入正向推進作功，或取正向推進分量）
            const ax = (dt > 0.0001) ? ((vx - playerObj._prevVel.x) / dt) : 0;
            const az = (dt > 0.0001) ? ((vz - playerObj._prevVel.z) / dt) : 0;
            
            // 計算沿著移動方向的正向加速度分量
            let forwardAccel = 0;
            if (ds > 0.0001) {
                const dirX = dx / ds;
                const dirZ = dz / ds;
                forwardAccel = Math.max(0, ax * dirX + az * dirZ);
            }

            // 更新歷史紀錄供下一幀計算
            playerObj._prevPos.x = playerObj.position.x;
            playerObj._prevPos.z = playerObj.position.z;
            playerObj._prevVel.x = vx;
            playerObj._prevVel.z = vz;

            // 血條歸零且尚未在喘息 -> 進入強制喘息
            if (playerObj.stamina <= 0.01 && playerObj.restTimer <= 0) {
                playerObj.restTimer = this.restDuration;
            }

            if (playerObj.restTimer > 0) {
                // 喘息中：扣減喘息倒數，並執行恢復公式（加血）
                playerObj.restTimer -= dt;
                playerObj.stamina = Math.min(this.maxStamina, playerObj.stamina + this.recoveryRate * dt);
                if (playerObj.restTimer <= 0) playerObj.stamina = this.maxStamina;
                return true; // 狀態：正在喘息
            } else if (isRunning || ds > 0.001) {
                // --- 物理力學耗能計算 ---
                const mass = this.weight || 75.0; // 1. 球員體重 (質量 kg)
                
                // 2. 地面動摩擦力 f_k = mu_k * m * g (N)
                const kineticFriction = this.muKinetic * mass * this.gravity;
                
                // 3. 跑動推力 F = m * a + f_k (N)
                const propulsionForce = (mass * forwardAccel) + kineticFriction;
                
                // 4. 機械作功 W = F * ds (焦耳 J)
                const workDone = propulsionForce * ds;
                
                // 換算為體力消耗百分比 (%)
                const staminaCost = workDone / this.joulesPerStamina;

                // 若球員處於 isRunning 狀態但尚未移動（例如剛啟動的同一幀），保留極小基礎消耗或依實際位移扣血
                playerObj.stamina = Math.max(0, playerObj.stamina - staminaCost);
            }
            return false; // 狀態：正常
        }

        // 4. 判斷球是否在球員可控制的距離範圍內
        checkControlRange(playerObj, ball, controlRange) {
            const pPos = playerObj.position;
            const bPos = ball.position;
            const ballRadius = ball.geometry.parameters.radius || 0.15;
            const playerFootPos = new THREE.Vector3(pPos.x, pPos.y + 0.4, pPos.z);
            const distToFoot3D = bPos.distanceTo(playerFootPos);
            const heightDiff = Math.abs(bPos.y - pPos.y);

            // 必須同時滿足距離範圍內且高度差小於 1 公尺
            return distToFoot3D <= (controlRange + ballRadius) && heightDiff < 1.0;
        }
    }

    // 註冊至全域
    window.HumanLaw = HumanLaw;
})();

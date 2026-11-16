// --- human_law.js (球員共通規則與基礎類別) ---
(function() {
    class HumanLaw {
        constructor() {
            this.maxStamina = 100.0;
            this.stamina = 100.0;
            this.runSpeed = 7.0;           // 全力奔跑速度 (m/s)
            this.drainRate = 100.0 / 14.0; // 跑完耗時（每秒扣%）
            this.recoveryRate = 100.0 / 5.0;// 喘息恢復率（每秒加%）
            this.restDuration = 5.0;       // 強制喘息時間 (秒)
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

        // 2. & 3. 體力消耗公式與恢復公式、血條為零喘息機制
        updateStaminaAndRest(playerObj, dt, isRunning) {
            if (playerObj.restTimer === undefined) playerObj.restTimer = 0;
            if (playerObj.stamina === undefined) playerObj.stamina = this.stamina;

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
            } else if (isRunning) {
                // 跑步中：執行消耗公式（扣血）
                playerObj.stamina = Math.max(0, playerObj.stamina - this.drainRate * dt);
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
// --- player0.js (最笨球員特質與行為邏輯) ---
(function() {
    class CustomPlayer extends window.HumanLaw {
        constructor() {
            super();
            this.team = 'blue'; 
            this.name = '最笨藍隊AI';

            // --- 球員身體素質 ---
            this.height = 180;          // 身高 (cm)
            this.weight = 80;           // 體重 (kg)
            this.controlRange = 0.6;    // 可控球的距離範圍 (m)
            this.accuracy = 0.5;        // 出球準確度
        }

        update(dt, playerObj, ball, playersList, goals) {
            if (playerObj.kickCooldown === undefined) playerObj.kickCooldown = 0;
            if (playerObj.kickCooldown > 0) playerObj.kickCooldown -= dt;

            const pPos = playerObj.position;
            const bPos = ball.position;

            // 目標敵方球門
            const targetGoal = (this.team === 'red') ? goals.rightGoal : goals.leftGoal;
            const gPos = targetGoal.position;

            const toBallX = bPos.x - pPos.x;
            const toBallZ = bPos.z - pPos.z;
            const distToBallXZ = Math.sqrt(toBallX * toBallX + toBallZ * toBallZ);

            // 透過共用規則判斷視野
            const isBallInFOV = this.checkFOV(playerObj, bPos, distToBallXZ);

            let statusText = "";
            let statusColor = "#4caf50";
            let isRunning = false;

            // 檢查是否在喘息中
            let isResting = this.updateStaminaAndRest(playerObj, dt, false);

            if (isResting) {
                statusText = `🥵 體能耗盡喘息中 (${playerObj.restTimer.toFixed(1)}s)`;
                statusColor = "#f44336";
            } else {
                if (isBallInFOV) {
                    // 3. 追球時全力衝刺（持續消耗體力，直到體力耗盡原地喘息）
                    statusText = "👁️ 全力衝刺追球中";
                    statusColor = "#4caf50";
                    isRunning = true;

                    // 觸發扣血機制
                    this.updateStaminaAndRest(playerObj, dt, true);

                    const targetAngleToBall = Math.atan2(toBallX, toBallZ);
                    playerObj.rotation.y = targetAngleToBall;

                    if (distToBallXZ > 0.3) {
                        const moveStep = this.runSpeed * dt;
                        playerObj.position.x += (toBallX / distToBallXZ) * Math.min(moveStep, distToBallXZ);
                        playerObj.position.z += (toBallZ / distToBallXZ) * Math.min(moveStep, distToBallXZ);
                    }
                } else {
                    // 1. 視野中沒看到球，就會向右轉頭來尋找球
                    statusText = "🔄 視野未見球，向右轉頭尋找";
                    statusColor = "#ff9800";
                    const turnSpeed = 3.5;
                    playerObj.rotation.y -= turnSpeed * dt; // 向右轉頭

                    // 原地緩慢恢復體力
                    playerObj.stamina = Math.min(this.maxStamina, playerObj.stamina + 2.0 * dt);
                }
            }

            // 檢查是否可控制球並射門
            let didKick = false;
            let kickForce = 0;
            let kickAngleY = 0;

            const canControl = this.checkControlRange(playerObj, ball, this.controlRange);

            if (canControl && isBallInFOV && playerObj.restTimer <= 0 && playerObj.kickCooldown <= 0) {
                // 2. 一拿到球就只會射向敵方球門
                const toGoalX = gPos.x - pPos.x;
                const toGoalZ = gPos.z - pPos.z;
                const shootAngle = Math.atan2(toGoalX, toGoalZ);

                playerObj.rotation.y = shootAngle; // 朝球門射門

                kickForce = 22.0 * this.accuracy; // 結合準確度
                kickAngleY = 3.5;
                didKick = true;
                playerObj.kickCooldown = 0.6;
                playerObj.stamina = Math.max(0, playerObj.stamina - 5.0);
            }

            return {
                stamina: playerObj.stamina,
                maxStamina: this.maxStamina,
                statusText: statusText,
                statusColor: statusColor,
                currentSpeed: isRunning ? this.runSpeed : 0,
                didKick: didKick,
                kickForce: kickForce,
                kickAngleY: kickAngleY
            };
        }
    }

    // 註冊至全域球員庫
    window.PlayerAI = CustomPlayer;
})();
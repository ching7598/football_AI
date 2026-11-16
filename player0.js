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

            // --- 上場時分配位置 (預設自己隊球門 Zone14 附近防守半場) ---
            this.assignedPosition = (this.team === 'red') ? { x: -30, z: 0 } : { x: 30, z: 0 };
        }

        // 輔助函式：移動回分配位置
        moveToAssignedPosition(playerObj, dt) {
            // 依據目前 team 動態確認分配位置 (防範動態換隊)
            const targetX = (this.team === 'red') ? -30 : 30;
            const targetZ = 0;

            const dx = targetX - playerObj.position.x;
            const dz = targetZ - playerObj.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist > 1.0) {
                const targetAngle = Math.atan2(dx, dz);
                this.turnTowards(playerObj, targetAngle, 4.0, dt);
                const moveStep = this.runSpeed * 0.7 * dt;
                playerObj.position.x += (dx / dist) * Math.min(moveStep, dist);
                playerObj.position.z += (dz / dist) * Math.min(moveStep, dist);
            }
            // 回防時緩慢恢復體力
            playerObj.stamina = Math.min(this.maxStamina, playerObj.stamina + 2.0 * dt);
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

            // 取得全域比賽狀態
            const matchState = window.matchState || { canKick: true, restarted: true, possession: 'blue' };

            if (isResting) {
                statusText = `🥵 體能耗盡喘息中 (${playerObj.restTimer.toFixed(1)}s)`;
                statusColor = "#f44336";
            } else {
                // --- 開球與球權邏輯判斷 ---
                if (matchState.restarted) {
                    // 1. 已重新開球 = true 則正常爭球
                    if (isBallInFOV) {
                        statusText = "👁️ 全力衝刺追球中";
                        statusColor = "#4caf50";
                        isRunning = true;
                        this.updateStaminaAndRest(playerObj, dt, true);

                        const targetAngleToBall = Math.atan2(toBallX, toBallZ);
                        playerObj.rotation.y = targetAngleToBall;

                        if (distToBallXZ > 0.3) {
                            const moveStep = this.runSpeed * dt;
                            playerObj.position.x += (toBallX / distToBallXZ) * Math.min(moveStep, distToBallXZ);
                            playerObj.position.z += (toBallZ / distToBallXZ) * Math.min(moveStep, distToBallXZ);
                        }
                    } else {
                        statusText = "🔄 視野未見球，向右轉頭尋找";
                        statusColor = "#ff9800";
                        const turnSpeed = 3.5;
                        playerObj.rotation.y -= turnSpeed * dt;
                        playerObj.stamina = Math.min(this.maxStamina, playerObj.stamina + 2.0 * dt);
                    }
                } else {
                    // 2. 已重新開球 = false
                    const isMyTeamPossession = (this.team === matchState.possession);

                    if (!isMyTeamPossession) {
                        // 球權不是自己隊 -> 往自己「上場時分配位置」移動
                        statusText = "🛡️ 等待對手開球，回防中";
                        statusColor = "#9c27b0";
                        this.moveToAssignedPosition(playerObj, dt);
                    } else {
                        // 球權是自己隊
                        if (matchState.canKick) {
                            // 可以開球 = true -> 開始正常追球
                            if (isBallInFOV) {
                                statusText = "⚽ 開球衝刺追球中";
                                statusColor = "#4caf50";
                                isRunning = true;
                                this.updateStaminaAndRest(playerObj, dt, true);

                                const targetAngleToBall = Math.atan2(toBallX, toBallZ);
                                playerObj.rotation.y = targetAngleToBall;

                                if (distToBallXZ > 0.3) {
                                    const moveStep = this.runSpeed * dt;
                                    playerObj.position.x += (toBallX / distToBallXZ) * Math.min(moveStep, distToBallXZ);
                                    playerObj.position.z += (toBallZ / distToBallXZ) * Math.min(moveStep, distToBallXZ);
                                }
                            } else {
                                statusText = "🔄 開球尋找球中";
                                statusColor = "#ff9800";
                                const turnSpeed = 3.5;
                                playerObj.rotation.y -= turnSpeed * dt;
                                playerObj.stamina = Math.min(this.maxStamina, playerObj.stamina + 2.0 * dt);
                            }
                        } else {
                            // 可以開球 = false -> 往自己「上場時分配位置」移動
                            statusText = "📍 就位等待全員回半場";
                            statusColor = "#3f51b5";
                            this.moveToAssignedPosition(playerObj, dt);
                        }
                    }
                }
            }

            // 檢查是否可控制球並射門
            let didKick = false;
            let kickForce = 0;
            let kickAngleY = 0;

            const canControl = this.checkControlRange(playerObj, ball, this.controlRange);

            // 必須在已開球或自己擁有開球權且可以開球的情況下才能踢球
            const canActionKick = matchState.restarted || (matchState.possession === this.team && matchState.canKick);

            if (canControl && isBallInFOV && playerObj.restTimer <= 0 && playerObj.kickCooldown <= 0 && canActionKick) {
                const toGoalX = gPos.x - pPos.x;
                const toGoalZ = gPos.z - pPos.z;
                const shootAngle = Math.atan2(toGoalX, toGoalZ);

                playerObj.rotation.y = shootAngle;

                kickForce = 22.0 * this.accuracy;
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
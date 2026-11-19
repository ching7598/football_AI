
/*
BRAIN_PROFILE_START
{
  "name": "基礎AI"
}
BRAIN_PROFILE_END
*/

/* Brain runs inside a dedicated Web Worker.
   No DOM/Three.js/player mesh access. */
(function () {
  'use strict';

  let memory = { ball: null, time: 0 };

  // 喘氣狀態：
  // 體力低於 1% 開始喘氣，
  // 恢復至 100% 才結束喘氣。
  let isRecovering = false;

  // Zone14 預設位置：靠近己方球門的中央區域；
  // 載入時由 HTML 指派位置覆蓋。
  const defaultAssignedPosition = team => ({
    x: team === 'blue' ? 45 : -45,
    z: 0
  });

  const norm = (x, z) => {
    const d = Math.hypot(x, z) || 1;
    return { x: x / d, z: z / d };
  };

  function decide(obs, dt) {
    memory.time += dt;

    const self = obs.self;

    // 遲滯控制：
    // 避免體力在 8% 附近反覆切換「追球／喘氣」。
    // 強制休息 self.resting 仍由 human_law.js 控制。
    if (self.stamina < self.maxStamina * 0.01) {
      isRecovering = true;
    } else if (self.stamina >= self.maxStamina * 0.99) {
      isRecovering = false;
    }

    const mustRest = isRecovering || self.resting;

    const assignedPosition =
      obs.assignedPosition ||
      defaultAssignedPosition(self.team);

    const match = obs.matchState || {
      canKickoff: false,
      restarted: true,
      possession: 'blue'
    };

    // 尚未重新開球：
    // 只有持球隊且全員已回到己方半場時，才能追球。
    const mayChaseBall =
      match.restarted ||
      (
        match.possession === self.team &&
        match.canKickoff
      );

    if (!mayChaseBall) {
      const dx =
        assignedPosition.x - self.position.x;

      const dz =
        assignedPosition.z - self.position.z;

      const dist = Math.hypot(dx, dz);

      let turn = 0;

      if (dist > 0.2) {
        const desired = Math.atan2(dx, dz);

        turn = Math.atan2(
          Math.sin(desired - self.facing),
          Math.cos(desired - self.facing)
        );
      }

      const rest = mustRest;

      return {
        turn,

        move: dist > 0.3 && !rest
          ? norm(dx, dz)
          : { x: 0, z: 0 },

        kick: { x: 0, y: 0, z: 0 },

        rest,

        status: rest
          ? '回防途中喘氣'
          : dist > 0.3
            ? '返回上場分配位置'
            : '等待重新開球'
      };
    }

    const seenBall = obs.visibleObjects.find(
      o => o.type === 'ball'
    );

    if (seenBall) {
      memory.ball = {
        ...seenBall,
        seenAt: memory.time
      };
    }

    const remembered = memory.ball;

    let turn = 0;
    let move = { x: 0, z: 0 };
    let kick = { x: 0, y: 0, z: 0 };

    let status = '尋找足球';

    if (remembered) {
      const age = memory.time - remembered.seenAt;

      // 最多記憶 3 秒鐘；
      // 超過時間則丟棄舊的足球位置。
      if (age > 3) {
        memory.ball = null;
      } else {
        const bx =
          remembered.position.x +
          remembered.velocity.x * Math.min(age, 1);

        const bz =
          remembered.position.z +
          remembered.velocity.z * Math.min(age, 1);

        const dx = bx - self.position.x;
        const dz = bz - self.position.z;

        const dist = Math.hypot(dx, dz);

        const desired = Math.atan2(dx, dz);

        let diff = desired - self.facing;

        diff = Math.atan2(
          Math.sin(diff),
          Math.cos(diff)
        );

        turn = diff;

        if (dist > 0.48 && !self.resting) {
          move = norm(dx, dz);

          status = seenBall
            ? '追逐視野內足球'
            : '追逐記憶中的足球';
        }

        if (
          seenBall &&
          dist < 0.9 &&
          !self.resting
        ) {
          const goal = obs.visibleObjects.find(
            o =>
              o.type === 'goal' &&
              o.team !== self.team
          );

          // 只根據視野內資訊判斷球門；
          // 看不到球門時，朝預設進攻方向射門。
          const gx = goal
            ? goal.position.x - bx
            : self.team === 'blue'
              ? -1
              : 1;

          const gz = goal
            ? goal.position.z - bz
            : 0;

          const direction = norm(gx, gz);

          kick = {
            x: direction.x * 75,
            y: 12,
            z: direction.z * 75
          };

          status = '射門';
        }
      }
    } else {
      turn = -0.07;
    }

    // 統一使用遲滯控制的喘氣狀態。
    if (mustRest) {
      move = { x: 0, z: 0 };
      kick = { x: 0, y: 0, z: 0 };

      status = '停下喘氣';

      return {
        turn,
        move,
        kick,
        rest: true,
        status
      };
    }

    if (!remembered && obs.defensePosition) {
      // 找不到足球時，回到防守位置附近。
      const dx =
        obs.defensePosition.x - self.position.x;

      const dz =
        obs.defensePosition.z - self.position.z;

      if (Math.hypot(dx, dz) > 3) {
        move = norm(dx, dz);
      }
    }

    return {
      turn,
      move,
      kick,
      rest: false,
      status
    };
  }

  self.onmessage = (event) => {
    const msg = event.data;

    if (msg.type === 'reset') {
      memory = { ball: null, time: 0 };
      isRecovering = false;
      return;
    }

    if (msg.type !== 'decide') return;

    try {
      self.postMessage({
        id: msg.id,
        wish: decide(msg.observation, msg.dt)
      });
    } catch (err) {
      self.postMessage({
        id: msg.id,
        error: String(err)
      });
    }
  };
})();

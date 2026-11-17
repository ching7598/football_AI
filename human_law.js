/* Trusted match rules. Load this script before the match engine. */
(function () {
  'use strict';

  const LIMITS = Object.freeze({
    height: [150, 210],
    weight: [45, 120],
    maxRunSpeed: [3, 9],
    maxKickForce: [30, 200],
    maxStamina: [3000, 15000],
    staminaRecovery: [20, 1000],
    bodyRadius: [0.25, 0.5]
  });

  const SETTINGS = Object.freeze({
    maxTurnRate: 4.5,
    kickRange: 0.85,
    kickHeight: 1.05,
    kickCooldown: 0.55,
    restDuration: 4,
    groundFriction: 3.0,
    collisionRestitution: 1.0,
    fovRadians: Math.PI,
    runDrainPerSecond: 600,
    idleRecoveryFactor: 0.22,
    kickStaminaCost: 35,
    kickImpulseSeconds: 0.15
  });

  function clamp(n, lo, hi, fallback = lo) {
    n = Number(n);
    return Number.isFinite(n)
      ? Math.max(lo, Math.min(hi, n))
      : fallback;
  }

  function physical(raw) {
    const defaults = {
      height: 180,
      weight: 80,
      maxRunSpeed: 7,
      maxKickForce: 120,
      maxStamina: 10000,
      staminaRecovery: 1000,
      bodyRadius: 0.35
    };

    const out = {};

    for (const [key, range] of Object.entries(LIMITS))
      out[key] = clamp(
        raw && raw[key],
        range[0],
        range[1],
        defaults[key]
      );

    return Object.freeze(out);
  }

  function action(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};

    const mv = raw.move || {};
    const kick = raw.kick || {};

    let x = clamp(mv.x, -1, 1, 0);
    let z = clamp(mv.z, -1, 1, 0);

    const length = Math.hypot(x, z);

    if (length > 1) {
      x /= length;
      z /= length;
    }

    return {
      turn: clamp(
        raw.turn,
        -Math.PI * 2,
        Math.PI * 2,
        0
      ),

      move: { x, z },

      kick: {
        x: clamp(kick.x, -100000, 100000, 0),
        y: clamp(kick.y, -100000, 100000, 0),
        z: clamp(kick.z, -100000, 100000, 0)
      },

      rest: raw.rest === true
    };
  }

  function advance(
    player,
    wish,
    dt,
    ball,
    ballVelocity,
    ballMass,
    field
  ) {
    const p = player.physical;
    const state = player.state;
    const a = action(wish);

    dt = clamp(dt, 0, 0.05, 0);

    state.kickCooldown = Math.max(
      0,
      state.kickCooldown - dt
    );

    state.restTimer = Math.max(
      0,
      state.restTimer - dt
    );

    state.facing += clamp(
      a.turn,
      -SETTINGS.maxTurnRate * dt,
      SETTINGS.maxTurnRate * dt,
      0
    );

    const running =
      !a.rest &&
      state.restTimer <= 0 &&
      state.stamina > 0 &&
      Math.hypot(a.move.x, a.move.z) > 0.001;

    const targetVX = running
      ? a.move.x * p.maxRunSpeed
      : 0;

    const targetVZ = running
      ? a.move.z * p.maxRunSpeed
      : 0;

    // Accelerate/brake with finite traction;
    // collisions modify the same velocity.
    const traction = Math.min(
      1,
      SETTINGS.groundFriction * dt
    );

    state.velocity.x +=
      (targetVX - state.velocity.x) * traction;

    state.velocity.z +=
      (targetVZ - state.velocity.z) * traction;

    // Keep speed within legal bounds even after collisions.
    const speed = Math.hypot(
      state.velocity.x,
      state.velocity.z
    );

    if (speed > p.maxRunSpeed) {
      state.velocity.x *= p.maxRunSpeed / speed;
      state.velocity.z *= p.maxRunSpeed / speed;
    }

    state.position.x = clamp(
      state.position.x + state.velocity.x * dt,
      -field.width / 2 + p.bodyRadius,
      field.width / 2 - p.bodyRadius,
      state.position.x
    );

    state.position.z = clamp(
      state.position.z + state.velocity.z * dt,
      -field.depth / 2 + p.bodyRadius,
      field.depth / 2 - p.bodyRadius,
      state.position.z
    );

    // Running expenditure depends on actual
    // horizontal speed and body mass.
    // Baseline: 80 kg at 7 m/s consumes
    // 600 stamina units per second.
    // Use speed AFTER acceleration and legal clamping.
    if (running) {
      const actualSpeed = Math.hypot(
        state.velocity.x,
        state.velocity.z
      );

      const speedFactor = actualSpeed / 7;
      const weightFactor = p.weight / 80;

      const staminaDrain =
        SETTINGS.runDrainPerSecond *
        speedFactor *
        weightFactor *
        dt;

      state.stamina = Math.max(
        0,
        state.stamina - staminaDrain
      );
    }
    else {
      state.stamina = Math.min(
        p.maxStamina,
        state.stamina +
          p.staminaRecovery *
          dt *
          (
            a.rest || state.restTimer > 0
              ? 1
              : SETTINGS.idleRecoveryFactor
          )
      );
    }

    if (
      state.stamina <= 0 &&
      state.restTimer <= 0
    ) {
      state.restTimer = SETTINGS.restDuration;
    }

    let kicked = false;

    const force = Math.hypot(
      a.kick.x,
      a.kick.y,
      a.kick.z
    );

    const dist = Math.hypot(
      ball.x - state.position.x,
      ball.z - state.position.z
    );

    if (
      force > 0 &&
      state.restTimer <= 0 &&
      state.kickCooldown <= 0 &&
      state.stamina >= SETTINGS.kickStaminaCost &&
      dist <= SETTINGS.kickRange + field.ballRadius &&
      ball.y - field.ballRadius < SETTINGS.kickHeight
    ) {
      const allowed = Math.min(
        force,
        p.maxKickForce
      );

      const impulse =
        allowed /
        Math.max(ballMass, 0.1) *
        SETTINGS.kickImpulseSeconds;

      ballVelocity.x +=
        a.kick.x / force * impulse;

      ballVelocity.y +=
        a.kick.y / force * impulse;

      ballVelocity.z +=
        a.kick.z / force * impulse;

      state.kickCooldown = SETTINGS.kickCooldown;
      state.stamina -= SETTINGS.kickStaminaCost;

      kicked = true;
    }

    return {
      running,
      kicked,
      resting: state.restTimer > 0
    };
  }

  function collide(a, b) {
    const A = a.state;
    const B = b.state;

    let dx = B.position.x - A.position.x;
    let dz = B.position.z - A.position.z;

    let d = Math.hypot(dx, dz);

    const minD =
      a.physical.bodyRadius +
      b.physical.bodyRadius;

    if (d >= minD) return;

    if (d < 1e-8) {
      dx = 1;
      dz = 0;
      d = 1;
    }

    const nx = dx / d;
    const nz = dz / d;

    const imA = 1 / a.physical.weight;
    const imB = 1 / b.physical.weight;

    const penetration = minD - d;

    A.position.x -=
      nx * penetration * imA / (imA + imB);

    A.position.z -=
      nz * penetration * imA / (imA + imB);

    B.position.x +=
      nx * penetration * imB / (imA + imB);

    B.position.z +=
      nz * penetration * imB / (imA + imB);

    const rel =
      (B.velocity.x - A.velocity.x) * nx +
      (B.velocity.z - A.velocity.z) * nz;

    if (rel >= 0) return;

    const j =
      -(1 + SETTINGS.collisionRestitution) *
      rel /
      (imA + imB);

    A.velocity.x -= j * imA * nx;
    A.velocity.z -= j * imA * nz;

    B.velocity.x += j * imB * nx;
    B.velocity.z += j * imB * nz;
  }

  // Engine owns the only trusted reference.
  // Brain workers receive serializable snapshots only.
  Object.defineProperty(window, 'HumanLaw', {
    value: Object.freeze({
      LIMITS,
      SETTINGS,
      physical,
      action,
      advance,
      collide
    }),
    writable: false,
    configurable: false
  });
})();
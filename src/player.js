import * as THREE from 'three';
import { CFG } from './config.js';
import { G } from './globals.js';
import { getTerrainHeight, getNearbyTrees } from './world.js';

// Working vectors
const FWD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const NEXT = new THREE.Vector3();
const PREV = new THREE.Vector3();

// Helpers implementing Quake/Source-like movement in XZ plane
function applyFriction(vel, friction, stopSpeed, dt) {
  const vx = vel.x, vz = vel.z;
  const speed = Math.hypot(vx, vz);
  if (speed <= 0.0001) return;
  const control = Math.max(speed, stopSpeed);
  const drop = control * friction * dt;
  const newSpeed = Math.max(0, speed - drop);
  if (newSpeed !== speed) {
    const k = newSpeed / speed;
    vel.x *= k;
    vel.z *= k;
  }
}

function accelerate(vel, wishDir, wishSpeed, accel, dt) {
  const current = vel.x * wishDir.x + vel.z * wishDir.z;
  let add = wishSpeed - current;
  if (add <= 0) return;
  const push = Math.min(accel * wishSpeed * dt, add);
  vel.x += wishDir.x * push;
  vel.z += wishDir.z * push;
}

function airAccelerate(vel, wishDir, wishSpeedCap, airAccel, dt) {
  const current = vel.x * wishDir.x + vel.z * wishDir.z;
  const wishSpeed = Math.min(wishSpeedCap, Math.hypot(wishDir.x, wishDir.z) > 0 ? wishSpeedCap : 0);
  let add = wishSpeed - current;
  if (add <= 0) return;
  const push = Math.min(airAccel * wishSpeed * dt, add);
  vel.x += wishDir.x * push;
  vel.z += wishDir.z * push;
}

export function updatePlayer(delta) {
  if (!G.player.alive) return;

  const P = G.player;
  const M = CFG.player.move;

  // Handle timed movement buff
  if (G.movementBuffTimer > 0) {
    G.movementBuffTimer -= delta;
    if (G.movementBuffTimer <= 0) {
      G.movementBuffTimer = 0;
      G.movementMult = 1;
    }
  }

  // Forward/right in the horizontal plane
  G.camera.getWorldDirection(FWD);
  FWD.y = 0; FWD.normalize();
  RIGHT.crossVectors(FWD, G.camera.up).normalize();

  // Build wish direction from inputs
  let wishX = 0, wishZ = 0;
  if (G.input.w) { wishX += FWD.x; wishZ += FWD.z; }
  if (G.input.s) { wishX -= FWD.x; wishZ -= FWD.z; }
  if (G.input.d) { wishX += RIGHT.x; wishZ += RIGHT.z; }
  if (G.input.a) { wishX -= RIGHT.x; wishZ -= RIGHT.z; }
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 0.0001) { wishX /= wishLen; wishZ /= wishLen; }

  // Desired speeds
  let baseSpeed = P.speed * (G.movementMult || 1) * (G.input.sprint ? CFG.player.sprintMult : 1);

  // Adrenaline upgrade: speed scales with low health
  const adrenalineStacks = G.upgrades?.adrenaline || 0;
  if (adrenalineStacks > 0) {
    const hpPct = P.health / CFG.player.health;
    // At 10% HP: +60% speed per stack. At full: +0%
    const boost = (1 - hpPct) * 0.60 * adrenalineStacks;
    baseSpeed *= (1 + boost);
  }

  const crouchMult = (CFG.player.crouchMult || 1);
  // If not sliding, crouch reduces speed
  if (G.input.crouch && !P.sliding) baseSpeed *= crouchMult;

  // Timers: jump buffer and coyote time
  // Buffer jump on key press (edge), not hold
  if (G.input.jump && !P.jumpHeld) {
    P.jumpBuffer = M.jumpBuffer;
  } else {
    P.jumpBuffer = Math.max(0, P.jumpBuffer - delta);
  }
  P.jumpHeld = !!G.input.jump;

  if (P.grounded) P.coyoteTimer = M.coyoteTime; else P.coyoteTimer = Math.max(0, P.coyoteTimer - delta);
  P.wallContactTimer = Math.max(0, P.wallContactTimer - delta);

  // Sliding enter/exit
  const horizSpeed = Math.hypot(P.vel.x, P.vel.z);
  if (P.grounded && G.input.crouch && (horizSpeed >= M.slideMinSpeed)) {
    P.sliding = true;
  } else if (!G.input.crouch || !P.grounded) {
    P.sliding = false;
  }

  // Jump handling (ground, coyote, or wall bounce)
  let skippedFriction = false;
  if (P.jumpBuffer > 0) {
    if (P.coyoteTimer > 0) {
      // Ground/coyote jump
      P.yVel = M.jumpSpeed;
      // Slide-jump: preserve momentum and add small boost
      if (P.sliding) {
        const sp = Math.hypot(P.vel.x, P.vel.z);
        if (sp > 0.0001) {
          const nx = P.vel.x / sp, nz = P.vel.z / sp;
          P.vel.x += nx * M.slideJumpBoost;
          P.vel.z += nz * M.slideJumpBoost;
        }
        skippedFriction = true;
      }
      P.grounded = false;
      P.jumpBuffer = 0; // consume
      P.coyoteTimer = 0;
    } else if (!P.grounded && P.wallContactTimer > 0) {
      // Wall bounce: reflect into-wall component and add outward pop
      const n = P.lastWallNormal;
      const dot = P.vel.x * n.x + P.vel.z * n.z;
      // Remove into-wall component
      P.vel.x -= n.x * dot;
      P.vel.z -= n.z * dot;
      // Add outward impulse
      P.vel.x += n.x * M.wallBounceImpulse;
      P.vel.z += n.z * M.wallBounceImpulse;
      // Give a small jump
      P.yVel = M.jumpSpeed;
      P.jumpBuffer = 0;
      P.wallContactTimer = 0;
    }
  }

  // State-based friction and acceleration
  if (P.grounded) {
    // Friction (skip on slide-jump frame)
    if (!skippedFriction) {
      const fric = P.sliding ? M.slideFriction : M.friction;
      applyFriction(P.vel, fric, M.stopSpeed, delta);
    }
    // Accelerate toward wishdir
    accelerate(P.vel, { x: wishX, z: wishZ }, baseSpeed, P.sliding ? M.slideAccel : M.groundAccel, delta);
  } else {
    // Air movement
    airAccelerate(P.vel, { x: wishX, z: wishZ }, M.airSpeedCap, M.airAccel, delta);
  }

  // Gravity (vertical only)
  P.yVel -= M.gravity * delta;

  // Integrate position
  NEXT.copy(P.pos);
  NEXT.x += P.vel.x * delta;
  NEXT.z += P.vel.z * delta;
  NEXT.y += P.yVel * delta;

  // Collide with tree trunks (cylinders in XZ), push out
  const nearTrees = getNearbyTrees(NEXT.x, NEXT.z, 3.5);
  for (let i = 0; i < nearTrees.length; i++) {
    const tree = nearTrees[i];
    const dx = NEXT.x - tree.x;
    const dz = NEXT.z - tree.z;
    const dist = Math.hypot(dx, dz);
    const minDist = P.radius + tree.radius;
    if (dist < minDist && dist > 0) {
      const nx = dx / dist;
      const nz = dz / dist;
      const push = (minDist - dist);
      NEXT.x += nx * push;
      NEXT.z += nz * push;
      // Record wall contact for potential wall-bounce when airborne
      if (!P.grounded) {
        P.lastWallNormal.set(nx, 0, nz);
        P.wallContactTimer = Math.max(P.wallContactTimer, CFG.player.move.wallBounceWindow);
      }
    }
  }

  // Bounds clamp
  const halfSize = CFG.forestSize / 2 - P.radius;
  NEXT.x = Math.max(-halfSize, Math.min(halfSize, NEXT.x));
  NEXT.z = Math.max(-halfSize, Math.min(halfSize, NEXT.z));

  // Ground resolve against terrain (using eye height)
  const eye = G.input.crouch ? (CFG.player.crouchEyeHeight || 1.8) : (CFG.player.eyeHeight || 1.8);
  const groundEye = getTerrainHeight(NEXT.x, NEXT.z) + eye;
  if (NEXT.y <= groundEye) {
    NEXT.y = groundEye;
    P.yVel = 0;
    P.grounded = true;
  } else {
    P.grounded = false;
  }

  // Commit position and keep camera in sync
  PREV.copy(P.pos);
  P.pos.copy(NEXT);
  G.camera.position.copy(P.pos);
}

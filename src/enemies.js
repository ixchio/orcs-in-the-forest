import * as THREE from 'three';
import { CFG } from './config.js';
import { G } from './globals.js';
import { getTerrainHeight, getNearbyTrees, hasLineOfSight } from './world.js';
import { spawnMuzzleFlashAt, spawnDustAt, spawnPortalAt } from './fx.js';
import { spawnEnemyArrow, spawnEnemyFireball, spawnEnemyRock } from './projectiles.js';
import { launchCharacterRedrawAgent } from './redrawAgents.js';

// Reusable temps
const TMPv1 = new THREE.Vector3();
const TMPv2 = new THREE.Vector3();
const TMPv3 = new THREE.Vector3();
const ORIGIN = new THREE.Vector3();
const TO_PLAYER = new THREE.Vector3();
const START = new THREE.Vector3();
const TARGET = new THREE.Vector3();

// Shared materials for enemies
const MAT = {
  skin: new THREE.MeshStandardMaterial({ color: 0x5a8f3a, roughness: 0.9 }),
  tunic: new THREE.MeshStandardMaterial({ color: 0x3b2f1c, roughness: 0.85 }),
  pants: new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.9 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.35, roughness: 0.4 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x6a3e1b, roughness: 0.8 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xcfd3d6, metalness: 0.95, roughness: 0.25 })
};

// Also share per-enemy odds-and-ends that were previously recreated
const RIVET_MAT = new THREE.MeshStandardMaterial({ color: 0xb0b4b8, metalness: 0.8, roughness: 0.3 });
const STRING_MAT = new THREE.LineBasicMaterial({ color: 0xffffff });

// Invisible low-poly hit proxies to reduce raycast CPU on shots
const PROXY_MAT = new THREE.MeshBasicMaterial({ visible: false });
const PROXY_HEAD = new THREE.SphereGeometry(0.32, 10, 8);
const PROXY_BODY = new THREE.CapsuleGeometry(0.45, 0.6, 6, 8);

function ballisticVelocity(start, target, speed, gravity, preferHigh = false) {
  const disp = TMPv1.subVectors(target, start);
  const dxz = Math.hypot(disp.x, disp.z);
  if (dxz < 0.0001) return null;
  const v2 = speed * speed;
  const g = gravity;
  const y = disp.y;
  const under = v2 * v2 - g * (g * dxz * dxz + 2 * y * v2);
  if (under < 0) return null; // no ballistic solution at this speed
  const root = Math.sqrt(under);
  const tan1 = (v2 + (preferHigh ? +root : -root)) / (g * dxz);
  const cos = 1 / Math.sqrt(1 + tan1 * tan1);
  const sin = tan1 * cos;
  const vxz = speed * cos;
  const vy = speed * sin;
  const hdir = TMPv2.set(disp.x, 0, disp.z).normalize();
  return hdir.multiplyScalar(vxz).add(TMPv3.set(0, vy, 0));
}

// --- Per-type behavior updaters (refactor) ---
// These functions encapsulate attack logic and animations per enemy type.
// They are invoked from the main update loop based on enemy.type.

function updateOrc(enemy, delta, dist, onPlayerDeath) {
  // Ranged archer logic + contact damage
  enemy.shootCooldown -= delta;

  const rangedRange = CFG.enemy.range;
  if (dist < rangedRange && enemy.alive) {
    // Throttled line-of-sight
    enemy.losTimer -= delta;
    if (enemy.losTimer <= 0) {
      ORIGIN.set(enemy.pos.x, 1.6, enemy.pos.z);
      enemy.hasLOS = hasLineOfSight(ORIGIN, G.player.pos);
      enemy.losTimer = 0.28 + G.random() * 0.18;
    }

    if (enemy.hasLOS && enemy.shootCooldown <= 0) {
      // Ballistic arrow with slight bloom
      const spread = CFG.enemy.bloom;
      enemy.mesh.updateMatrixWorld(true);
      if (enemy.projectileSpawn) enemy.projectileSpawn.getWorldPosition(START); else START.copy(ORIGIN);

      TARGET.set(G.player.pos.x, G.player.pos.y - 0.2, G.player.pos.z);
      TARGET.x += (G.random() - 0.5) * spread * 20;
      TARGET.y += (G.random() - 0.5) * spread * 8;
      TARGET.z += (G.random() - 0.5) * spread * 20;

      const dxz = Math.hypot(TARGET.x - START.x, TARGET.z - START.z);
      const maxRangeFlat = (CFG.enemy.arrowSpeed * CFG.enemy.arrowSpeed) / CFG.enemy.arrowGravity;
      if (dxz <= maxRangeFlat * 0.98) {
        const vel = ballisticVelocity(START, TARGET, CFG.enemy.arrowSpeed, CFG.enemy.arrowGravity, false);
        if (vel) {
          enemy.shootCooldown = 1 / CFG.enemy.rof;
          spawnEnemyArrow(START, vel, true);
          spawnMuzzleFlashAt(START, 0xffc080);
        }
      }
    }
  }

  // Contact DPS when very close
  if (dist < G.player.radius + enemy.radius) {
    const dmg = enemy.damagePerSecond * delta * 0.5;
    console.log("DAMAGE FROM ENEMY CONTACT. enemy type: " + enemy.type + ", dist: " + dist); G.player.health -= dmg;
    G.damageFlash = Math.min(1, G.damageFlash + dmg * CFG.hud.damagePulsePerHP);
    if (G.player.health <= 0) {
      G.player.health = 0;
      G.player.alive = false;
      if (onPlayerDeath) onPlayerDeath();
    }
  }
}

function updateShaman(enemy, delta, dist, onPlayerDeath) {
  // Fireball caster + periodic teleport + contact DPS fallback
  enemy.shootCooldown -= delta;

  const rangedRange = CFG.enemy.range;
  if (dist < rangedRange && enemy.alive) {
    enemy.losTimer -= delta;
    if (enemy.losTimer <= 0) {
      ORIGIN.set(enemy.pos.x, 1.6, enemy.pos.z);
      enemy.hasLOS = hasLineOfSight(ORIGIN, G.player.pos);
      enemy.losTimer = 0.28 + G.random() * 0.18;
    }
    if (enemy.hasLOS && enemy.shootCooldown <= 0) {
      enemy.mesh.updateMatrixWorld(true);
      if (enemy.projectileSpawn) enemy.projectileSpawn.getWorldPosition(START); else START.copy(ORIGIN);
      TARGET.copy(G.camera.position);
      const dir = TMPv2.subVectors(TARGET, START).normalize();
      enemy.shootCooldown = 1 / CFG.enemy.rof;
      spawnEnemyFireball(START, dir, false);
      spawnMuzzleFlashAt(START, 0xff5a22);
    }
  }

  // Teleport ability (periodic)
  enemy.teleTimer -= delta;
  if (enemy.teleTimer <= 0) {
    enemy.teleTimer = CFG.shaman.teleportCooldown * (0.85 + G.random() * 0.3);
    const dirTo = TO_PLAYER.copy(G.player.pos).sub(enemy.pos);
    dirTo.y = 0;
    const dlen = dirTo.length();
    if (dlen > 1) {
      dirTo.normalize();
      let tdist = CFG.shaman.teleportDistance;
      if (dlen - tdist < (G.player.radius + enemy.radius + 2)) {
        tdist = Math.max(0, dlen - (G.player.radius + enemy.radius + 2));
      }
      const nx = enemy.pos.x + dirTo.x * tdist;
      const nz = enemy.pos.z + dirTo.z * tdist;
      const trees = getNearbyTrees(nx, nz, 3);
      let blocked = false;
      for (let ti = 0; ti < trees.length; ti++) {
        const tr = trees[ti];
        const dx = nx - tr.x; const dz = nz - tr.z;
        const rr = tr.radius + enemy.radius * 0.8;
        if (dx * dx + dz * dz < rr * rr) { blocked = true; break; }
      }
      if (!blocked) {
        spawnPortalAt(enemy.pos, 0xff5522, 1.0, 0.32);
        spawnDustAt(enemy.pos, 0x9c3322, 0.7, 0.18);
        enemy.pos.set(nx, getTerrainHeight(nx, nz), nz);
        spawnPortalAt(enemy.pos, 0xff5522, 1.1, 0.36);
        spawnDustAt(enemy.pos, 0xcc4422, 0.9, 0.22);
      }
    }
  }

  // Contact DPS when very close
  if (dist < G.player.radius + enemy.radius) {
    const dmg = enemy.damagePerSecond * delta * 0.5;
    console.log("DAMAGE FROM ENEMY CONTACT. enemy type: " + enemy.type + ", dist: " + dist); G.player.health -= dmg;
    G.damageFlash = Math.min(1, G.damageFlash + dmg * CFG.hud.damagePulsePerHP);
    if (G.player.health <= 0) {
      G.player.health = 0;
      G.player.alive = false;
      if (onPlayerDeath) onPlayerDeath();
    }
  }
}

function updateWolf(enemy, delta, dist, onPlayerDeath) {
  // Bite-based melee and animations
  enemy.biteCooldown = Math.max(0, (enemy.biteCooldown || 0) - delta);

  const biteRange = CFG.wolf.biteRange;
  const biteWindup = CFG.wolf.biteWindup;
  const biteInterval = CFG.wolf.biteInterval;
  const biteDuration = Math.max(0.42, biteWindup + 0.18);

  if (dist < biteRange && enemy.biteCooldown <= 0 && !enemy.biting && G.player.alive) {
    enemy.biting = true;
    enemy.biteTimer = 0;
    enemy.biteApplied = false;
    enemy.biteCooldown = biteInterval;
  }

  if (enemy.biting) {
    enemy.biteTimer += delta;
    if (!enemy.biteApplied && enemy.biteTimer >= biteWindup && dist < biteRange + 0.2) {
      const dmg = CFG.wolf.biteDamage;
      console.log("DAMAGE FROM ENEMY CONTACT. enemy type: " + enemy.type + ", dist: " + dist); G.player.health -= dmg;
      G.damageFlash = Math.min(1, G.damageFlash + (CFG.hud.damagePulsePerHit || 0.5) + dmg * (CFG.hud.damagePulsePerHP || 0.01));
      enemy.biteApplied = true;
      if (G.player.health <= 0) {
        G.player.health = 0;
        G.player.alive = false;
        if (onPlayerDeath) onPlayerDeath();
      }
    }
    if (enemy.biteTimer >= biteDuration) {
      enemy.biting = false;
      enemy.biteTimer = 0;
    }
  }

  // Animations
  enemy.animT += delta * Math.max(1.0, enemy.baseSpeed * 0.9);
  const t = enemy.animT;
  const runAmp = 0.6;
  const cycle = Math.sin(t * 6.0);
  const oc = Math.sin(t * 6.0 + Math.PI);
  if (enemy.legs) {
    if (enemy.legs.FL) enemy.legs.FL.rotation.x = cycle * runAmp;
    if (enemy.legs.RR) enemy.legs.RR.rotation.x = cycle * runAmp * 0.9;
    if (enemy.legs.FR) enemy.legs.FR.rotation.x = oc * runAmp;
    if (enemy.legs.RL) enemy.legs.RL.rotation.x = oc * runAmp * 0.9;
  }
  if (enemy.tailPivot) enemy.tailPivot.rotation.x = Math.PI * 0.30 + Math.sin(t * 8.0) * 0.2;
  if (enemy.headPivot) {
    enemy.headPivot.rotation.y = Math.sin(t * 1.5) * 0.12;
    enemy.headPivot.rotation.x = Math.sin(t * 1.3) * 0.06;
  }
  if (enemy.biting && enemy.muzzlePivot && enemy.headPivot) {
    const u = Math.min(1, enemy.biteTimer / Math.max(0.01, CFG.wolf.biteWindup));
    const fwd = u < 1 ? (u * (2 - u)) : 1;
    enemy.muzzlePivot.position.z = (enemy.muzzleBase || 1.5) + fwd * 0.35;
    enemy.headPivot.rotation.x = -0.25 - fwd * 0.25;
  } else if (enemy.muzzlePivot) {
    enemy.muzzlePivot.position.z = enemy.muzzleBase || 1.5;
  }
}

function updateGolem(enemy, delta, dist, onPlayerDeath) {
  // Throw rocks with windup, heavy gait, contact DPS fallback
  enemy.shootCooldown -= delta;

  const rangedRange = (CFG.golem?.range ?? CFG.enemy.range);
  if (dist < rangedRange && enemy.alive) {
    enemy.losTimer -= delta;
    if (enemy.losTimer <= 0) {
      ORIGIN.set(enemy.pos.x, 1.6, enemy.pos.z);
      enemy.hasLOS = hasLineOfSight(ORIGIN, G.player.pos);
      enemy.losTimer = 0.28 + G.random() * 0.18;
    }
    if (enemy.hasLOS && enemy.shootCooldown <= 0) {
      // Begin throw sequence; actual spawn handled below
      enemy.throwing = true;
      enemy.throwTimer = 0;
      enemy.throwSpawned = false;
      enemy.shootCooldown = (CFG.golem?.throwInterval ?? 1.6);
    }
  }

  // Animations and throw
  enemy.animT += delta * Math.max(0.6, enemy.baseSpeed * 0.6);
  const t = enemy.animT;
  const swing = Math.sin(t * 1.2) * 0.32;
  const counter = Math.sin(t * 1.2 + Math.PI) * 0.32;
  if (!enemy.throwing) {
    if (enemy.armL) enemy.armL.rotation.x = swing * 0.9;
    if (enemy.armR) enemy.armR.rotation.x = counter * 0.9;
  }
  if (enemy.legL) enemy.legL.rotation.x = counter * 0.5;
  if (enemy.legR) enemy.legR.rotation.x = swing * 0.5;
  if (enemy.headPivot) enemy.headPivot.rotation.x = Math.sin(t * 2.0) * 0.05;

  if (enemy.throwing && enemy.armR) {
    const wind = CFG.golem?.throwWindup ?? 0.4;
    enemy.throwTimer += delta;
    const u = Math.min(1, enemy.throwTimer / Math.max(0.001, wind));
    const back = -1.3;
    const fwd = 0.6;
    if (enemy.throwTimer < wind) {
      const e = u * (2 - u);
      enemy.armR.rotation.x = back * e;
    } else {
      const k = Math.min(1, (enemy.throwTimer - wind) / 0.18);
      enemy.armR.rotation.x = back + (fwd - back) * (k * (2 - k));
    }

    if (!enemy.throwSpawned && enemy.throwTimer >= wind) {
      const spread = (CFG.golem?.bloom ?? 0.01);
      enemy.mesh.updateMatrixWorld(true);
      if (enemy.projectileSpawn) enemy.projectileSpawn.getWorldPosition(START); else START.set(enemy.pos.x, enemy.pos.y + 2.2, enemy.pos.z);
      TARGET.set(G.player.pos.x, G.player.pos.y + 0.2, G.player.pos.z);
      TARGET.x += (G.random() - 0.5) * spread * 20;
      TARGET.y += (G.random() - 0.5) * spread * 8;
      TARGET.z += (G.random() - 0.5) * spread * 20;
      const speed = CFG.golem?.rockSpeed ?? CFG.enemy.arrowSpeed;
      const grav = CFG.golem?.rockGravity ?? CFG.enemy.arrowGravity;
      const vel = ballisticVelocity(START, TARGET, speed, grav, false);
      if (vel) {
        spawnEnemyRock(START, vel, true);
        spawnMuzzleFlashAt(START, 0xb0b0b0);
      }
      enemy.throwSpawned = true;
    }
    if (enemy.throwTimer >= wind + 0.32) {
      enemy.throwing = false;
      enemy.throwTimer = 0;
      enemy.throwSpawned = false;
    }
  }

  // Contact DPS when very close
  if (dist < G.player.radius + enemy.radius) {
    const dmg = enemy.damagePerSecond * delta * 0.5;
    console.log("DAMAGE FROM ENEMY CONTACT. enemy type: " + enemy.type + ", dist: " + dist); G.player.health -= dmg;
    G.damageFlash = Math.min(1, G.damageFlash + dmg * CFG.hud.damagePulsePerHP);
    if (G.player.health <= 0) {
      G.player.health = 0;
      G.player.alive = false;
      if (onPlayerDeath) onPlayerDeath();
    }
  }
}

function updateMegaBoss(enemy, delta, dist, onPlayerDeath) {
  // Heavy golem boss: ground-pound AoE + rock throws
  enemy.shootCooldown -= delta;
  enemy.groundPoundCooldown = (enemy.groundPoundCooldown || 0) - delta;

  // Ground-pound when player is close
  if (dist < (CFG.megaBoss.groundPoundRadius || 12) && enemy.groundPoundCooldown <= 0 && !enemy.pounding && enemy.alive) {
    enemy.pounding = true;
    enemy.poundTimer = 0;
  }

  if (enemy.pounding) {
    enemy.poundTimer += delta;
    // Windup for 0.6s, then slam
    if (enemy.poundTimer < 0.6) {
      // Raise arms up
      if (enemy.armL) enemy.armL.rotation.x = -enemy.poundTimer * 3;
      if (enemy.armR) enemy.armR.rotation.x = -enemy.poundTimer * 3;
    } else if (enemy.poundTimer < 0.8) {
      // Slam down
      if (enemy.armL) enemy.armL.rotation.x = (enemy.poundTimer - 0.6) * 10;
      if (enemy.armR) enemy.armR.rotation.x = (enemy.poundTimer - 0.6) * 10;
    } else if (enemy.poundTimer < 0.85 && !enemy.poundApplied) {
      // Apply AoE damage
      enemy.poundApplied = true;
      const radius = CFG.megaBoss.groundPoundRadius || 12;
      const dmg = CFG.megaBoss.groundPoundDamage || 40;
      const pd = dist;
      if (pd <= radius) {
        const falloff = Math.max(0, 1 - pd / radius);
        const actualDmg = dmg * (0.4 + 0.6 * falloff);
        G.player.health -= actualDmg;
        G.damageFlash = Math.min(1, G.damageFlash + actualDmg * CFG.hud.damagePulsePerHP);
        if (G.player.health <= 0) {
          G.player.health = 0;
          G.player.alive = false;
          if (onPlayerDeath) onPlayerDeath();
        }
      }
      // Screen shake / FX
      import('./fx.js').then(fx => fx.spawnExplosionAt(enemy.pos.clone(), radius * 0.6));
      import('./audio.js').then(a => a.playExplosion());
    } else if (enemy.poundTimer >= 1.2) {
      enemy.pounding = false;
      enemy.poundTimer = 0;
      enemy.poundApplied = false;
      enemy.groundPoundCooldown = CFG.megaBoss.groundPoundCooldown || 6;
    }
  }

  // Ranged rock throw (same as golem but with boss config)
  const rangedRange = CFG.enemy.range * 1.5;
  if (dist < rangedRange && enemy.alive && !enemy.pounding) {
    enemy.losTimer -= delta;
    if (enemy.losTimer <= 0) {
      ORIGIN.set(enemy.pos.x, 3.5, enemy.pos.z);
      enemy.hasLOS = hasLineOfSight(ORIGIN, G.player.pos);
      enemy.losTimer = 0.28 + G.random() * 0.18;
    }
    if (enemy.hasLOS && enemy.shootCooldown <= 0) {
      enemy.throwing = true;
      enemy.throwTimer = 0;
      enemy.throwSpawned = false;
      enemy.shootCooldown = CFG.megaBoss.throwInterval || 2.0;
    }
  }

  // Animations
  enemy.animT += delta * Math.max(0.4, enemy.baseSpeed * 0.4);
  const t = enemy.animT;
  const swing = Math.sin(t * 1.0) * 0.25;
  const counter = Math.sin(t * 1.0 + Math.PI) * 0.25;
  if (!enemy.throwing && !enemy.pounding) {
    if (enemy.armL) enemy.armL.rotation.x = swing * 0.7;
    if (enemy.armR) enemy.armR.rotation.x = counter * 0.7;
  }
  if (enemy.legL) enemy.legL.rotation.x = counter * 0.4;
  if (enemy.legR) enemy.legR.rotation.x = swing * 0.4;
  if (enemy.headPivot) enemy.headPivot.rotation.x = Math.sin(t * 1.5) * 0.04;

  // Throw animation (same as golem)
  if (enemy.throwing && enemy.armR) {
    const wind = 0.5;
    enemy.throwTimer += delta;
    const back = -1.3;
    const fwd = 0.6;
    if (enemy.throwTimer < wind) {
      const u = Math.min(1, enemy.throwTimer / wind);
      enemy.armR.rotation.x = back * (u * (2 - u));
    } else {
      const k = Math.min(1, (enemy.throwTimer - wind) / 0.2);
      enemy.armR.rotation.x = back + (fwd - back) * (k * (2 - k));
    }
    if (!enemy.throwSpawned && enemy.throwTimer >= wind) {
      enemy.mesh.updateMatrixWorld(true);
      if (enemy.projectileSpawn) enemy.projectileSpawn.getWorldPosition(START); else START.set(enemy.pos.x, enemy.pos.y + 4, enemy.pos.z);
      TARGET.copy(G.player.pos);
      TARGET.x += (G.random() - 0.5) * 3;
      TARGET.z += (G.random() - 0.5) * 3;
      const speed = CFG.megaBoss.rockSpeed || 22;
      const grav = CFG.megaBoss.rockGravity || 12;
      const vel = ballisticVelocity(START, TARGET, speed, grav, false);
      if (vel) {
        spawnEnemyRock(START, vel, true);
        spawnMuzzleFlashAt(START, 0xff6622);
      }
      enemy.throwSpawned = true;
    }
    if (enemy.throwTimer >= wind + 0.35) {
      enemy.throwing = false;
      enemy.throwTimer = 0;
      enemy.throwSpawned = false;
    }
  }

  // Pulse weak-spot crystals
  if (enemy.crystals) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);
    for (const c of enemy.crystals) {
      if (c.material) c.material.emissiveIntensity = 0.5 + pulse * 1.5;
    }
  }

  // Contact DPS
  if (dist < G.player.radius + enemy.radius) {
    const dmg = enemy.damagePerSecond * delta * 0.5;
    console.log("DAMAGE FROM ENEMY CONTACT. enemy type: " + enemy.type + ", dist: " + dist); G.player.health -= dmg;
    G.damageFlash = Math.min(1, G.damageFlash + dmg * CFG.hud.damagePulsePerHP);
    if (G.player.health <= 0) {
      G.player.health = 0;
      G.player.alive = false;
      if (onPlayerDeath) onPlayerDeath();
    }
  }
}

const ENEMY_UPDATERS = {
  orc: updateOrc,
  shaman: updateShaman,
  wolf: updateWolf,
  golem: updateGolem,
  megaBoss: updateMegaBoss,
};

export function spawnEnemy(type = 'orc') {
  // Spawn near a single wave anchor, not around center
  const halfSize = CFG.forestSize / 2;
  const anchor = G.waves.spawnAnchor || new THREE.Vector3(
    (G.random() - 0.5) * (CFG.forestSize - 40), 0, (G.random() - 0.5) * (CFG.forestSize - 40)
  );
  // jitter around anchor (avoid exact center of map)
  let x = 0, z = 0;
  {
    let tries = 0;
    while (tries++ < 6) {
      const r = 8 + G.random() * 14;
      const t = G.random() * Math.PI * 2;
      x = anchor.x + Math.cos(t) * r;
      z = anchor.z + Math.sin(t) * r;
      if (Math.abs(x) <= halfSize && Math.abs(z) <= halfSize) break;
    }
    if (Math.abs(x) > halfSize || Math.abs(z) > halfSize) return;
  }

  if (type === 'shaman') {
    // Create shaman: red with a cape, fires fireballs and teleports
    const enemyGroup = new THREE.Group();

    const skin = MAT.skin;
    const robe = new THREE.MeshStandardMaterial({ color: 0x6f0c0c, roughness: 0.9 });
    const capeMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.95 });

    // Torso and head
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.15, 0.45), robe);
    torso.position.set(0, 1.3, 0);
    torso.castShadow = false; torso.receiveShadow = true;
    enemyGroup.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), skin);
    head.position.set(0, 1.95, 0);
    head.castShadow = false; head.receiveShadow = true;
    enemyGroup.add(head);

    // Hood (larger dome over head, dark red)
    const hoodMat = new THREE.MeshStandardMaterial({ color: 0x4d0909, roughness: 0.95 });
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), hoodMat);
    hood.scale.y = 0.7; hood.position.set(0, 2.03, 0);
    hood.castShadow = false; hood.receiveShadow = true;
    enemyGroup.add(hood);

    // Glowing eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2200, emissiveIntensity: 1.2 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeMat);
    eyeL.position.set(-0.1, 1.98, -0.25);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeMat);
    eyeR.position.set(0.1, 1.98, -0.25);
    enemyGroup.add(eyeL); enemyGroup.add(eyeR);

    // Simple arms
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), robe);
    armL.position.set(-0.5, 1.35, 0);
    armL.castShadow = false; enemyGroup.add(armL);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), robe);
    armR.position.set(0.5, 1.35, 0);
    armR.castShadow = false; enemyGroup.add(armR);

    // Legs
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.24), robe);
    legL.position.set(-0.22, 0.5, 0);
    legL.castShadow = false; enemyGroup.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.24), robe);
    legR.position.set(0.22, 0.5, 0);
    legR.castShadow = false; enemyGroup.add(legR);

    // Cape (thin panel on back)
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.04), capeMat);
    cape.position.set(0, 1.18, 0.30);
    cape.castShadow = false; cape.receiveShadow = true;
    enemyGroup.add(cape);

    // Staff held forward in right hand with glowing tip
    const staffGroup = new THREE.Group();
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0x3b2b1b, roughness: 0.9 }));
    staff.position.set(0, 0.8, 0);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: 0xff4a1d, emissive: 0xff2200, emissiveIntensity: 1.5 }));
    orb.position.set(0, 1.6 * 0.5 + 0.16, 0);
    staffGroup.add(staff);
    staffGroup.add(orb);
    staffGroup.position.set(0.42, 1.2, -0.25);
    staffGroup.rotation.x = -0.3; staffGroup.rotation.y = 0.1;
    enemyGroup.add(staffGroup);

    // Fireball spawn point at the orb tip
    const projectileSpawn = new THREE.Object3D();
    projectileSpawn.position.set(0, 1.6 * 0.5 + 0.16, 0);
    staffGroup.add(projectileSpawn);

    launchCharacterRedrawAgent('shaman', {
      enemyGroup,
      torso,
      armL,
      armR,
      staffGroup
    });

    enemyGroup.position.set(x, getTerrainHeight(x, z), z);
    G.scene.add(enemyGroup);

    // Invisible hit proxies
    const proxyHead = new THREE.Mesh(PROXY_HEAD, PROXY_MAT);
    proxyHead.position.set(0, 1.95, 0);
    proxyHead.userData = { enemy: null, hitZone: 'head' };
    enemyGroup.add(proxyHead);
    const proxyBody = new THREE.Mesh(PROXY_BODY, PROXY_MAT);
    proxyBody.position.set(0, 1.3, 0);
    proxyBody.userData = { enemy: null, hitZone: 'body' };
    enemyGroup.add(proxyBody);

    // Tag (only proxies are raycasted)
    torso.userData = { enemy: null, hitZone: 'body' };
    head.userData = { enemy: null, hitZone: 'head' };
    armL.userData = { enemy: null, hitZone: 'limb' };
    armR.userData = { enemy: null, hitZone: 'limb' };
    legL.userData = { enemy: null, hitZone: 'limb' };
    legR.userData = { enemy: null, hitZone: 'limb' };

    const enemy = {
      type: 'shaman',
      mesh: enemyGroup,
      body: torso,
      pos: enemyGroup.position,
      radius: CFG.enemy.radius,
      hp: CFG.enemy.hp,
      baseSpeed: CFG.enemy.baseSpeed + CFG.enemy.speedPerWave * (G.waves.current - 1),
      damagePerSecond: CFG.enemy.dps,
      alive: true,
      deathTimer: 0,
      projectileSpawn,
      shootCooldown: 0,
      helmet: null,
      helmetAttached: false,
      // LOS throttling
      losTimer: 0,
      hasLOS: true,
      hitProxies: [],
      // Teleport ability
      teleTimer: CFG.shaman.teleportCooldown * (0.6 + G.random() * 0.8)
    };

    enemyGroup.userData = { enemy };
    torso.userData.enemy = enemy;
    head.userData.enemy = enemy;
    armL.userData.enemy = enemy;
    armR.userData.enemy = enemy;
    legL.userData.enemy = enemy;
    legR.userData.enemy = enemy;
    proxyHead.userData.enemy = enemy;
    proxyBody.userData.enemy = enemy;
    enemy.hitProxies.push(proxyBody, proxyHead);

    G.enemies.push(enemy);
    G.waves.aliveCount++;
    return;
  }

  if (type === 'wolf') {
    // Create a Minecraft-style wolf from boxes (lightweight), scaled to player height
    const wolfGroup = new THREE.Group();

    // Simple palette
    const palette = {
      furLight: 0xdddddd,
      fur: 0xbdbdbd,
      furDark: 0x8e8e8e,
      muzzle: 0xd6c3a1,
      nose: 0x222222,
      eyes: 0x101010,
      collar: 0xc43b3b
    };

    const makeMat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true });
    function makeBox(w, h, d, color) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), makeMat(color));
      mesh.castShadow = false; mesh.receiveShadow = true;
      return mesh;
    }

    // Dimensions
    const LEG_H = 2.0, LEG_W = 1.0, LEG_D = 1.0;
    const BODY_W = 4.0, BODY_H = 2.5, BODY_D = 7.0;
    const HEAD_W = 3.0, HEAD_H = 2.6, HEAD_D = 3.0;
    const MUZZ_W = 1.6, MUZZ_H = 1.4, MUZZ_D = 2.0;
    const EAR_W = 0.6, EAR_H = 0.7, EAR_D = 0.4;
    const TAIL_W = 1.0, TAIL_H = 1.0, TAIL_D = 4.0;

    const bodyCenterY = LEG_H + BODY_H / 2;

    // Body
    const body = makeBox(BODY_W, BODY_H, BODY_D, palette.fur);
    body.position.set(0, bodyCenterY, 0);
    wolfGroup.add(body);
    const bodyTop = makeBox(BODY_W - 0.2, 0.4, BODY_D - 0.2, palette.furLight);
    bodyTop.position.set(0, bodyCenterY + BODY_H / 2 - 0.2, 0);
    wolfGroup.add(bodyTop);

    // Head + muzzle pivots
    const headPivot = new THREE.Group();
    headPivot.position.set(0, bodyCenterY + 0.1, BODY_D / 2 + HEAD_D / 2 - 0.1);
    wolfGroup.add(headPivot);
    const head = makeBox(HEAD_W, HEAD_H, HEAD_D, palette.furLight);
    headPivot.add(head);
    const muzzlePivot = new THREE.Group();
    muzzlePivot.position.set(0, -0.2, HEAD_D / 2);
    headPivot.add(muzzlePivot);
    const muzzle = makeBox(MUZZ_W, MUZZ_H, MUZZ_D, palette.muzzle);
    muzzle.position.set(0, 0, MUZZ_D / 2);
    muzzlePivot.add(muzzle);
    const nose = makeBox(0.6, 0.4, 0.6, palette.nose);
    nose.position.set(0, MUZZ_H / 2 - 0.2, MUZZ_D + 0.3);
    muzzlePivot.add(nose);
    const eyeL = makeBox(0.2, 0.4, 0.2, palette.eyes);
    const eyeR = eyeL.clone();
    eyeL.position.set(-HEAD_W / 2 + 0.35, 0.3, HEAD_D / 2 - 0.2);
    eyeR.position.set(HEAD_W / 2 - 0.35, 0.3, HEAD_D / 2 - 0.2);
    headPivot.add(eyeL, eyeR);
    const earL = makeBox(EAR_W, EAR_H, EAR_D, palette.furDark);
    const earR = earL.clone();
    const earY = HEAD_H / 2 + EAR_H / 2 - 0.02;
    const earX = HEAD_W / 2 - EAR_W / 2 - 0.02;
    earL.position.set(-earX, earY, -0.2);
    earR.position.set(earX, earY, -0.2);
    headPivot.add(earL, earR);
    const collar = makeBox(HEAD_W + 0.2, 0.4, 1.0, palette.collar);
    collar.position.set(0, -HEAD_H / 2 + 0.45, -HEAD_D / 2 + 0.3);
    headPivot.add(collar);

    // Tail
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, bodyCenterY, -BODY_D / 2 + 0.05);
    wolfGroup.add(tailPivot);
    const tail = makeBox(TAIL_W, TAIL_H, TAIL_D, palette.furDark);
    tail.position.set(0, 0, -TAIL_D / 2);
    tailPivot.add(tail);
    tailPivot.rotation.x = Math.PI * 0.30;

    // Leg pivots (for simple run animation)
    function makeLeg(x, z) {
      const pivot = new THREE.Group();
      pivot.position.set(x, LEG_H, z);
      const upper = makeBox(LEG_W, LEG_H * 0.65, LEG_D, palette.furDark);
      upper.position.set(0, -LEG_H * 0.325, 0);
      const paw = makeBox(LEG_W, LEG_H * 0.35, LEG_D, palette.furLight);
      paw.position.set(0, -LEG_H * 0.775, 0);
      pivot.add(upper);
      pivot.add(paw);
      wolfGroup.add(pivot);
      return pivot;
    }
    const legPos = [
      [-(BODY_W / 2 - LEG_W / 2), (BODY_D / 2 - LEG_D / 2)],
      [(BODY_W / 2 - LEG_W / 2), (BODY_D / 2 - LEG_D / 2)],
      [-(BODY_W / 2 - LEG_W / 2), -(BODY_D / 2 - LEG_D / 2)],
      [(BODY_W / 2 - LEG_W / 2), -(BODY_D / 2 - LEG_D / 2)]
    ];
    const legFL = makeLeg(legPos[0][0], legPos[0][1]);
    const legFR = makeLeg(legPos[1][0], legPos[1][1]);
    const legRL = makeLeg(legPos[2][0], legPos[2][1]);
    const legRR = makeLeg(legPos[3][0], legPos[3][1]);

    launchCharacterRedrawAgent('wolf', {
      body,
      tailPivot,
      legs: { FL: legFL, FR: legFR, RL: legRL, RR: legRR }
    });

    // Scale down to match game scale (halve again per feedback)
    wolfGroup.scale.setScalar(0.25);

    // Initial placement
    wolfGroup.position.set(x, getTerrainHeight(x, z), z);
    G.scene.add(wolfGroup);

    // Invisible hit proxies (head + body) for hitscan
    const proxyHead = new THREE.Mesh(PROXY_HEAD, PROXY_MAT);
    proxyHead.userData = { enemy: null, hitZone: 'head' };
    // Attach to head pivot so it tracks bite/head motion and height
    headPivot.add(proxyHead);
    proxyHead.position.set(0, 0, 0);
    const proxyBody = new THREE.Mesh(PROXY_BODY, PROXY_MAT);
    proxyBody.userData = { enemy: null, hitZone: 'body' };
    // Attach to torso/body for reliable center-of-mass hits
    body.add(proxyBody);
    proxyBody.position.set(0, 0, 0);
    // Counteract group scale so proxies remain reasonably hittable
    const inv = 1 / wolfGroup.scale.x;
    const proxyScale = inv * 1.0; // keep proxies around human size in world space
    proxyHead.scale.setScalar(proxyScale);
    proxyBody.scale.setScalar(proxyScale);

    const enemy = {
      type: 'wolf',
      mesh: wolfGroup,
      body: body,
      pos: wolfGroup.position,
      radius: CFG.wolf.radius,
      hp: CFG.enemy.hp,
      baseSpeed: (CFG.enemy.baseSpeed + CFG.enemy.speedPerWave * (G.waves.current - 1)) * CFG.wolf.speedMult,
      damagePerSecond: 0, // not used for wolves; they bite instead
      alive: true,
      deathTimer: 0,
      shootCooldown: 0,
      helmet: null,
      helmetAttached: false,
      // Wolf-specific anim and attack state
      animT: 0,
      runPhase: 0,
      biteTimer: 0,
      biteCooldown: 0,
      biting: false,
      biteApplied: false,
      // Pivots for anims
      headPivot,
      muzzlePivot,
      muzzleBase: HEAD_D / 2,
      tailPivot,
      legs: { FL: legFL, FR: legFR, RL: legRL, RR: legRR },
      hitProxies: []
    };

    wolfGroup.userData = { enemy };
    body.userData = { enemy, hitZone: 'body' };
    head.userData = { enemy, hitZone: 'head' };
    muzzle.userData = { enemy, hitZone: 'head' };
    proxyHead.userData.enemy = enemy;
    proxyBody.userData.enemy = enemy;
    enemy.hitProxies.push(proxyBody, proxyHead);

    G.enemies.push(enemy);
    G.waves.aliveCount++;
    return;
  }

  if (type === 'golem') {
    // Blocky golem from simple boxes, with arm/leg pivots and a throw anchor
    const golem = new THREE.Group();

    // Materials inspired by the provided model
    const iron = new THREE.MeshStandardMaterial({ color: 0xE0E0E0, roughness: 0.95, metalness: 0.05, flatShading: true });
    const ironDark = new THREE.MeshStandardMaterial({ color: 0xCFCFCF, roughness: 0.95, metalness: 0.05, flatShading: true });
    const woodish = new THREE.MeshStandardMaterial({ color: 0x8A6B58, roughness: 1.0, metalness: 0.0, flatShading: true });
    const vine = new THREE.MeshStandardMaterial({ color: 0x2f8f38, roughness: 0.9, metalness: 0.0, flatShading: true });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x661c1c, emissive: 0x5b0a0a, emissiveIntensity: 0.9, roughness: 1.0, flatShading: true });

    // Dimensions (scaled down later to match world scale)
    const bodyW = 4.0, bodyH = 4.6, bodyD = 2.2;
    const headW = 2.2, headH = 2.2, headD = 2.0;
    const armW = 1.3, armD = 1.3, armL = 5.0;
    const handW = 1.5, handH = 0.9, handD = 1.5;
    const legW = 1.2, legD = 1.2, legH = 3.2;
    const footW = 1.6, footD = 1.8, footH = 0.8;
    const legGap = 0.6;
    const legX = (legW + legGap) * 0.5;
    const hipsY = footH + legH;

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), iron);
    torso.position.y = hipsY + bodyH * 0.5;
    torso.castShadow = false; torso.receiveShadow = true;
    golem.add(torso);

    // Head pivot
    const headPivot = new THREE.Group();
    headPivot.position.set(0, hipsY + bodyH, 0);
    golem.add(headPivot);

    const head = new THREE.Mesh(new THREE.BoxGeometry(headW, headH, headD), ironDark);
    head.position.y = headH * 0.5;
    head.castShadow = false; head.receiveShadow = true;
    headPivot.add(head);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 1.0), woodish);
    nose.position.set(0, 0.2, headD * 0.5 + 0.5);
    head.add(nose);

    const eyeGeom = new THREE.BoxGeometry(0.35, 0.35, 0.12);
    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
    leftEye.position.set(-0.45, 0.55, headD * 0.5 + 0.07);
    rightEye.position.set(0.45, 0.55, headD * 0.5 + 0.07);
    head.add(leftEye, rightEye);

    // Shoulders
    const shoulderY = hipsY + bodyH - 0.2;
    const shoulderX = bodyW * 0.5 + armW * 0.5 - 0.1;

    function buildArm(sign = 1) {
      const pivot = new THREE.Group();
      pivot.position.set(sign * shoulderX, shoulderY, 0);
      golem.add(pivot);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(armW, armL, armD), iron);
      arm.position.y = -armL * 0.5;
      arm.castShadow = false; arm.receiveShadow = true;
      pivot.add(arm);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(handW, handH, handD), ironDark);
      hand.position.y = -armL * 0.5 - handH * 0.5;
      arm.add(hand);
      const creeper1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.10), vine);
      creeper1.position.set(sign * 0.35, -0.8, armD * 0.5 + 0.06);
      arm.add(creeper1);
      // Return pivots plus a handle to hand for projectile spawn anchor
      return { pivot, arm, hand };
    }

    const leftArm = buildArm(-1);
    const rightArm = buildArm(1);

    // Rock spawn anchor at right hand
    const projectileSpawn = new THREE.Object3D();
    projectileSpawn.position.set(0, -armL * 0.5 - handH, 0);
    rightArm.arm.add(projectileSpawn);

    function buildLeg(sign = 1) {
      const pivot = new THREE.Group();
      pivot.position.set(sign * legX, hipsY, 0);
      golem.add(pivot);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(legW, legH, legD), iron);
      leg.position.y = -legH * 0.5;
      leg.castShadow = false; leg.receiveShadow = true;
      pivot.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(footW, footH, footD), ironDark);
      foot.position.y = -legH * 0.5 - footH * 0.5;
      leg.add(foot);
      return { pivot, leg };
    }

    const leftLeg = buildLeg(-1);
    const rightLeg = buildLeg(1);

    // A few vines on torso & leg
    function addVine(target, x, y, z, h) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.12), vine);
      strip.position.set(x, y, z);
      strip.castShadow = false; strip.receiveShadow = true;
      target.add(strip);
    }
    addVine(torso, 0.9, 0.3, bodyD * 0.5 + 0.07, 2.2);
    addVine(torso, -0.2, -0.7, bodyD * 0.5 + 0.07, 1.6);
    addVine(leftLeg.leg, -0.3, -0.2, legD * 0.5 + 0.07, 1.8);

    launchCharacterRedrawAgent('golem', {
      torso,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg
    });

    // Scale to world; triple the previous size
    const scale = 0.66; // 3x bigger than before
    golem.scale.setScalar(scale);

    // Place in world
    golem.position.set(x, getTerrainHeight(x, z), z);
    G.scene.add(golem);

    // Hit proxies: scale-compensated so they remain hittable in world units
    const proxyHead = new THREE.Mesh(PROXY_HEAD, PROXY_MAT);
    const proxyBody = new THREE.Mesh(PROXY_BODY, PROXY_MAT);
    headPivot.add(proxyHead);
    torso.add(proxyBody);
    const inv = 1 / scale;
    // Scale proxies up so hits match the larger body
    const proxyScale = inv * 3.0;
    proxyHead.scale.setScalar(proxyScale);
    proxyBody.scale.setScalar(proxyScale);
    proxyHead.userData = { enemy: null, hitZone: 'head' };
    proxyBody.userData = { enemy: null, hitZone: 'body' };

    const enemy = {
      type: 'golem',
      mesh: golem,
      body: torso,
      pos: golem.position,
      radius: CFG.golem?.radius ?? 1.2,
      hp: (CFG.golem?.hp ?? 260),
      baseSpeed: (CFG.golem?.baseSpeed ?? 1.7) + (CFG.golem?.speedPerWave ?? 0.12) * (G.waves.current - 1),
      damagePerSecond: CFG.golem?.dps ?? CFG.enemy.dps,
      alive: true,
      deathTimer: 0,
      projectileSpawn,
      shootCooldown: 0,
      helmet: null,
      helmetAttached: false,
      // LOS throttling
      losTimer: 0,
      hasLOS: true,
      hitProxies: [],
      // Anim state
      animT: 0,
      headPivot,
      armL: leftArm?.pivot,
      armR: rightArm?.pivot,
      legL: leftLeg?.pivot,
      legR: rightLeg?.pivot,
      // Throw state
      throwing: false,
      throwTimer: 0,
      throwSpawned: false
    };

    golem.userData = { enemy };
    torso.userData = { enemy, hitZone: 'body' };
    head.userData = { enemy, hitZone: 'head' };
    proxyHead.userData.enemy = enemy;
    proxyBody.userData.enemy = enemy;
    enemy.hitProxies.push(proxyBody, proxyHead);

    G.enemies.push(enemy);
    G.waves.aliveCount++;
    return;
  }

  if (type === 'megaBoss') {
    // Scaled-up golem with glowing weak-spots and massive HP
    // Reuse golem construction but at megaBoss scale
    const bossGroup = new THREE.Group();
    const iron = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9, metalness: 0.15, flatShading: true });
    const ironDark = new THREE.MeshStandardMaterial({ color: 0x0f0f1f, roughness: 0.9, metalness: 0.2, flatShading: true });
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 1.5, roughness: 0.3, metalness: 0.4 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2.0, roughness: 0.5 });

    const bodyW = 4.0, bodyH = 4.6, bodyD = 2.2;
    const headW = 2.2, headH = 2.2, headD = 2.0;
    const armW = 1.3, armD = 1.3, armLen = 5.0;
    const handW = 1.5, handH = 0.9, handD = 1.5;
    const legW = 1.2, legD = 1.2, legH = 3.2;
    const footW = 1.6, footD = 1.8, footH = 0.8;
    const legGap = 0.6;
    const legX = (legW + legGap) * 0.5;
    const hipsY = footH + legH;

    const torso = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), iron);
    torso.position.y = hipsY + bodyH * 0.5;
    bossGroup.add(torso);

    const headPivot = new THREE.Group();
    headPivot.position.set(0, hipsY + bodyH, 0);
    bossGroup.add(headPivot);
    const head = new THREE.Mesh(new THREE.BoxGeometry(headW, headH, headD), ironDark);
    head.position.y = headH * 0.5;
    headPivot.add(head);

    // Glowing eyes
    const eyeGeom = new THREE.BoxGeometry(0.45, 0.45, 0.14);
    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
    leftEye.position.set(-0.45, 0.55, headD * 0.5 + 0.08);
    rightEye.position.set(0.45, 0.55, headD * 0.5 + 0.08);
    head.add(leftEye, rightEye);

    const shoulderY = hipsY + bodyH - 0.2;
    const shoulderX = bodyW * 0.5 + armW * 0.5 - 0.1;

    function buildBossArm(sign) {
      const pivot = new THREE.Group();
      pivot.position.set(sign * shoulderX, shoulderY, 0);
      bossGroup.add(pivot);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(armW, armLen, armD), iron);
      arm.position.y = -armLen * 0.5;
      pivot.add(arm);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(handW, handH, handD), ironDark);
      hand.position.y = -armLen * 0.5 - handH * 0.5;
      arm.add(hand);
      return { pivot, arm, hand };
    }
    const leftArm = buildBossArm(-1);
    const rightArm = buildBossArm(1);

    const projectileSpawn = new THREE.Object3D();
    projectileSpawn.position.set(0, -armLen * 0.5 - handH, 0);
    rightArm.arm.add(projectileSpawn);

    function buildBossLeg(sign) {
      const pivot = new THREE.Group();
      pivot.position.set(sign * legX, hipsY, 0);
      bossGroup.add(pivot);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(legW, legH, legD), iron);
      leg.position.y = -legH * 0.5;
      pivot.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(footW, footH, footD), ironDark);
      foot.position.y = -legH * 0.5 - footH * 0.5;
      leg.add(foot);
      return { pivot, leg };
    }
    const leftLeg = buildBossLeg(-1);
    const rightLeg = buildBossLeg(1);

    // Glowing crystal weak-spots on shoulders and back
    const crystals = [];
    const crystalGeo = new THREE.OctahedronGeometry(0.5, 0);
    for (const pos of [
      [shoulderX * 0.8, shoulderY + 1.0, 0],
      [-shoulderX * 0.8, shoulderY + 1.0, 0],
      [0, hipsY + bodyH * 0.3, bodyD * 0.5 + 0.4]
    ]) {
      const c = new THREE.Mesh(crystalGeo, crystalMat.clone());
      c.position.set(pos[0], pos[1], pos[2]);
      c.rotation.set(Math.random(), Math.random(), Math.random());
      bossGroup.add(c);
      crystals.push(c);
    }

    // Scale to megaBoss size
    const scale = (CFG.megaBoss.scale || 3.5) * 0.35;
    bossGroup.scale.setScalar(scale);
    bossGroup.position.set(x, getTerrainHeight(x, z), z);
    G.scene.add(bossGroup);

    // Hit proxies
    const proxyHead = new THREE.Mesh(PROXY_HEAD, PROXY_MAT);
    const proxyBody = new THREE.Mesh(PROXY_BODY, PROXY_MAT);
    headPivot.add(proxyHead);
    torso.add(proxyBody);
    const inv = 1 / scale;
    proxyHead.scale.setScalar(inv * 4);
    proxyBody.scale.setScalar(inv * 5);
    proxyHead.userData = { enemy: null, hitZone: 'head' };
    proxyBody.userData = { enemy: null, hitZone: 'body' };

    const bossHp = CFG.megaBoss.hp || 5000;
    const enemy = {
      type: 'megaBoss',
      mesh: bossGroup,
      body: torso,
      pos: bossGroup.position,
      radius: 2.5,
      hp: bossHp,
      maxHp: bossHp,
      baseSpeed: CFG.megaBoss.speed || 1.8,
      damagePerSecond: 20,
      alive: true,
      deathTimer: 0,
      projectileSpawn,
      shootCooldown: 0,
      helmet: null,
      helmetAttached: false,
      losTimer: 0,
      hasLOS: true,
      hitProxies: [],
      animT: 0,
      headPivot,
      armL: leftArm.pivot,
      armR: rightArm.pivot,
      legL: leftLeg.pivot,
      legR: rightLeg.pivot,
      throwing: false,
      throwTimer: 0,
      throwSpawned: false,
      pounding: false,
      poundTimer: 0,
      poundApplied: false,
      groundPoundCooldown: 3,
      crystals
    };

    bossGroup.userData = { enemy };
    torso.userData = { enemy, hitZone: 'body' };
    head.userData = { enemy, hitZone: 'head' };
    proxyHead.userData.enemy = enemy;
    proxyBody.userData.enemy = enemy;
    enemy.hitProxies.push(proxyBody, proxyHead);

    G.enemies.push(enemy);
    G.waves.aliveCount++;
    G.activeBoss = enemy;
    return;
  }

  // Create enemy mesh (orc with cute helmet + bow)
  const enemyGroup = new THREE.Group();

  const skin = MAT.skin;
  const tunic = MAT.tunic;
  const pants = MAT.pants;
  const metal = MAT.metal;
  const leather = MAT.leather;
  const silver = MAT.silver;

  // Torso (bulky base under armor)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.4), tunic);
  torso.position.set(0, 1.3, 0);
  torso.castShadow = false; torso.receiveShadow = true;
  enemyGroup.add(torso);

  // Silver armor: keep back plate + pauldrons; remove front plate for subtler look
  const armorPieces = [];
  {
    const backPlate = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.58, 0.10), metal);
    backPlate.position.set(0, 1.34, 0.26);
    backPlate.castShadow = false; backPlate.receiveShadow = true;
    backPlate.userData = { enemy: null, hitZone: 'body' };
    enemyGroup.add(backPlate); armorPieces.push(backPlate);

    // Shoulder pauldrons (simple domes)
    const pauldronGeo = new THREE.SphereGeometry(0.27, 12, 10);
    const pL = new THREE.Mesh(pauldronGeo, silver);
    pL.scale.y = 0.6; pL.position.set(-0.52, 1.62, -0.02);
    pL.castShadow = false; pL.receiveShadow = true; pL.userData = { enemy: null, hitZone: 'body' };
    enemyGroup.add(pL); armorPieces.push(pL);
    const pR = new THREE.Mesh(pauldronGeo, silver);
    pR.scale.y = 0.6; pR.position.set(0.52, 1.62, -0.02);
    pR.castShadow = false; pR.receiveShadow = true; pR.userData = { enemy: null, hitZone: 'body' };
    enemyGroup.add(pR); armorPieces.push(pR);

    // Leather belt with a simple metal buckle
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 8, 20), leather);
    belt.rotation.x = Math.PI / 2; belt.position.set(0, 1.0, 0);
    belt.castShadow = false; belt.receiveShadow = true; belt.userData = { enemy: null, hitZone: 'body' };
    enemyGroup.add(belt); armorPieces.push(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.03), metal);
    buckle.position.set(0, 1.0, -0.34);
    buckle.castShadow = false; buckle.receiveShadow = true; buckle.userData = { enemy: null, hitZone: 'body' };
    enemyGroup.add(buckle); armorPieces.push(buckle);

    // Small rivets on back plate corners only
    const rivetGeo = new THREE.SphereGeometry(0.04, 8, 6);
    const rivets = [
      new THREE.Vector3(-0.34, 1.64, 0.26), new THREE.Vector3(0.34, 1.64, 0.26),
      new THREE.Vector3(-0.34, 1.06, 0.26), new THREE.Vector3(0.34, 1.06, 0.26)
    ];
    for (const pos of rivets) {
      const r = new THREE.Mesh(rivetGeo, RIVET_MAT);
      r.position.copy(pos);
      r.castShadow = false; r.receiveShadow = true; r.userData = { enemy: null, hitZone: 'body' };
      enemyGroup.add(r); armorPieces.push(r);
    }
  }

  // Head (slightly larger) + cute helmet (small dome)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), skin);
  head.position.set(0, 1.95, 0);
  head.castShadow = false; head.receiveShadow = true;
  enemyGroup.add(head);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 10), metal);
  helmet.scale.y = 0.7;
  helmet.position.set(0, 2.07, 0);
  helmet.castShadow = false; helmet.receiveShadow = true;
  // Tag helmet as a head hit zone so headshots register even when helmet is hit
  helmet.userData = { enemy: null, hitZone: 'head', isHelmet: true };
  enemyGroup.add(helmet);

  // Arms
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), tunic);
  armL.position.set(-0.5, 1.35, 0);
  armL.castShadow = false; enemyGroup.add(armL);

  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), tunic);
  armR.position.set(0.5, 1.35, 0);
  armR.castShadow = false; enemyGroup.add(armR);

  // Legs
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.24), pants);
  legL.position.set(-0.22, 0.5, 0);
  legL.castShadow = false; enemyGroup.add(legL);

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.24), pants);
  legR.position.set(0.22, 0.5, 0);
  legR.castShadow = false; enemyGroup.add(legR);

  // Bow (curved torus segment + string) held slightly forward on left side
  const bowGroup = new THREE.Group();
  const bow = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.03, 8, 24, Math.PI * 0.9),
    leather
  );
  bow.rotation.z = Math.PI / 2; // orient curve
  bowGroup.add(bow);

  const stringGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -0.42, 0), new THREE.Vector3(0, 0.42, 0)
  ]);
  const string = new THREE.Line(stringGeo, STRING_MAT);
  bowGroup.add(string);

  bowGroup.position.set(-0.32, 1.35, -0.35);
  enemyGroup.add(bowGroup);

  // Arrow spawn point near top-tip of bow, facing forwards
  const projectileSpawn = new THREE.Object3D();
  projectileSpawn.position.set(-0.32, 1.35, -0.55);
  enemyGroup.add(projectileSpawn);

  launchCharacterRedrawAgent('orc', {
    enemyGroup,
    head,
    armL,
    armR,
    legL,
    legR,
    bowGroup
  });

  enemyGroup.position.set(x, getTerrainHeight(x, z), z);
  G.scene.add(enemyGroup);

  // Add invisible hit proxies (head + body) for fast ray hits
  const proxyHead = new THREE.Mesh(PROXY_HEAD, PROXY_MAT);
  proxyHead.position.set(0, 1.95, 0);
  proxyHead.userData = { enemy: null, hitZone: 'head' };
  enemyGroup.add(proxyHead);
  const proxyBody = new THREE.Mesh(PROXY_BODY, PROXY_MAT);
  proxyBody.position.set(0, 1.3, 0);
  proxyBody.userData = { enemy: null, hitZone: 'body' };
  enemyGroup.add(proxyBody);

  // Tag hit zones for headshot logic
  torso.userData = { enemy: null, hitZone: 'body' };
  head.userData = { enemy: null, hitZone: 'head' };
  armL.userData = { enemy: null, hitZone: 'limb' };
  armR.userData = { enemy: null, hitZone: 'limb' };
  legL.userData = { enemy: null, hitZone: 'limb' };
  legR.userData = { enemy: null, hitZone: 'limb' };
  bow.userData = { enemy: null, hitZone: 'gear' };
  proxyHead.userData.enemy = null; // will assign below
  proxyBody.userData.enemy = null;

  const enemy = {
    type: 'orc',
    mesh: enemyGroup,
    body: torso,
    pos: enemyGroup.position,
    radius: CFG.enemy.radius,
    hp: CFG.enemy.hp,
    baseSpeed: CFG.enemy.baseSpeed + CFG.enemy.speedPerWave * (G.waves.current - 1),
    damagePerSecond: CFG.enemy.dps,
    alive: true,
    deathTimer: 0,
    projectileSpawn,
    shootCooldown: 0,
    helmet,
    helmetAttached: true,
    // LOS throttling to avoid per-frame raycasting
    losTimer: 0,
    hasLOS: true,
    hitProxies: []
  };

  enemyGroup.userData = { enemy };
  torso.userData.enemy = enemy;
  head.userData.enemy = enemy;
  armL.userData.enemy = enemy;
  armR.userData.enemy = enemy;
  legL.userData.enemy = enemy;
  legR.userData.enemy = enemy;
  bow.userData.enemy = enemy;
  helmet.userData.enemy = enemy;
  proxyHead.userData.enemy = enemy;
  proxyBody.userData.enemy = enemy;
  enemy.hitProxies.push(proxyBody, proxyHead);
  // Assign enemy to armor pieces so they count as body hits
  for (const part of armorPieces) {
    if (part && part.userData) part.userData.enemy = enemy;
  }

  G.enemies.push(enemy);
  G.waves.aliveCount++;
}

export function updateEnemies(delta, onPlayerDeath) {
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const enemy = G.enemies[i];

    if (!enemy.alive) {
      // Death handling and cleanup
      spawnDustAt(enemy.pos);
      enemy.mesh.traverse((obj) => {
        if (obj.isMesh && obj.geometry) {
          G.disposeQueue.push(obj.geometry);
          obj.geometry = null;
        }
      });
      G.scene.remove(enemy.mesh);
      G.enemies.splice(i, 1);
      continue;
    }

    // Move towards player with simple avoidance
    const dir = G.tmpV1.copy(G.player.pos).sub(enemy.pos);
    dir.y = 0;
    const dist = dir.length();
    if (dist > 0) {
      dir.normalize();
      const moveSpeed = enemy.baseSpeed * delta;
      enemy.pos.add(dir.multiplyScalar(moveSpeed));

      const nearby = getNearbyTrees(enemy.pos.x, enemy.pos.z, 4);
      for (let ti = 0; ti < nearby.length; ti++) {
        const tree = nearby[ti];
        const dx = enemy.pos.x - tree.x;
        const dz = enemy.pos.z - tree.z;
        const treeDist = Math.sqrt(dx * dx + dz * dz);
        const minDist = enemy.radius + tree.radius;
        if (treeDist < minDist && treeDist > 0) {
          const pushX = (dx / treeDist) * (minDist - treeDist);
          const pushZ = (dz / treeDist) * (minDist - treeDist);
          enemy.pos.x += pushX;
          enemy.pos.z += pushZ;
        }
      }
    }

    // Clamp to terrain and face player
    enemy.pos.y = getTerrainHeight(enemy.pos.x, enemy.pos.z);
    enemy.mesh.lookAt(G.player.pos.x, enemy.pos.y + 1.4, G.player.pos.z);

    // Dispatch to type-specific behavior
    const updater = ENEMY_UPDATERS[enemy.type];
    if (updater) updater(enemy, delta, dist, onPlayerDeath);
  }
}

import * as THREE from 'three';
import { CFG } from './config.js';
import { G } from './globals.js';
import { getTerrainHeight, getNearbyTrees } from './world.js';
import { spawnImpact, spawnMuzzleFlashAt } from './fx.js';

// Shared arrow geometry/material to avoid per-shot allocations
const ARROW = (() => {
  const shaftGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6);
  const headGeo = new THREE.ConeGeometry(0.08, 0.2, 8);
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.8 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, metalness: 0.2, roughness: 0.5 });
  return { shaftGeo, headGeo, shaftMat, headMat };
})();

// Shared fireball geometry/material (core + outer glow)
const FIREBALL = (() => {
  const coreGeo = new THREE.SphereGeometry(0.22, 16, 12);
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xff3b1d, emissive: 0xff2200, emissiveIntensity: 1.6, roughness: 0.55 });
  const glowGeo = new THREE.SphereGeometry(0.36, 14, 12);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const ringGeo = new THREE.TorusGeometry(0.28, 0.04, 10, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffaa55, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  return { coreGeo, coreMat, glowGeo, glowMat, ringGeo, ringMat };
})();

const UP = new THREE.Vector3(0, 1, 0);
const TMPv = new THREE.Vector3();
const TMPq = new THREE.Quaternion();
// Shared jagged rock geometry/material
const ROCK = (() => {
  const geo = new THREE.DodecahedronGeometry(0.6, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 1.0, metalness: 0.0 });
  return { geo, mat };
})();

// Spawns a visible enemy arrow projectile
export function spawnEnemyArrow(start, dirOrVel, asVelocity = false) {
  const speed = CFG.enemy.arrowSpeed;
  // Arrow visual: shaft + head as a small cone (shared geos/materials)
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(ARROW.shaftGeo, ARROW.shaftMat);
  shaft.position.y = 0; // centered
  shaft.castShadow = true; shaft.receiveShadow = true;
  group.add(shaft);

  const head = new THREE.Mesh(ARROW.headGeo, ARROW.headMat);
  head.position.y = 0.55;
  head.castShadow = true; head.receiveShadow = true;
  group.add(head);

  // Orient to direction (geometry points +Y by default)
  const dir = TMPv.copy(dirOrVel).normalize();
  TMPq.setFromUnitVectors(UP, dir);
  group.quaternion.copy(TMPq);

  group.position.copy(start);
  G.scene.add(group);

  const vel = asVelocity
    ? dirOrVel.clone()
    : TMPv.copy(dirOrVel).normalize().multiplyScalar(speed);

  const projectile = {
    kind: 'arrow',
    mesh: group,
    pos: group.position,
    vel,
    life: CFG.enemy.arrowLife
  };

  G.enemyProjectiles.push(projectile);
}

// Spawns a straight-traveling shaman fireball
export function spawnEnemyFireball(start, dirOrVel, asVelocity = false) {
  const speed = CFG.shaman.fireballSpeed;
  // Visual group: core + additive glow + fiery ring + light
  const group = new THREE.Group();
  const core = new THREE.Mesh(FIREBALL.coreGeo, FIREBALL.coreMat);
  const glow = new THREE.Mesh(FIREBALL.glowGeo, FIREBALL.glowMat);
  const ring = new THREE.Mesh(FIREBALL.ringGeo, FIREBALL.ringMat);
  ring.rotation.x = Math.PI / 2;
  core.castShadow = true; core.receiveShadow = false;
  glow.castShadow = false; glow.receiveShadow = false;
  group.add(core);
  group.add(glow);
  group.add(ring);
  // Avoid dynamic lights to keep shaders stable; rely on glow meshes

  group.position.copy(start);
  G.scene.add(group);

  // Compute velocity without aliasing TMP vectors
  const velocity = asVelocity ? dirOrVel.clone() : dirOrVel.clone().normalize().multiplyScalar(speed);
  // Safety: if somehow pointing away from camera, flip (prevents “opposite” shots)
  const toCam = new THREE.Vector3().subVectors(G.camera.position, group.position).normalize();
  if (velocity.clone().normalize().dot(toCam) < 0) velocity.multiplyScalar(-1);

  // Orient to direction for consistency
  const nd = velocity.clone().normalize();
  TMPq.setFromUnitVectors(UP, nd);
  group.quaternion.copy(TMPq);

  const projectile = {
    kind: 'fireball',
    mesh: group,
    pos: group.position,
    vel: velocity,
    life: CFG.shaman.fireballLife,
    core,
    glow,
    ring,
    light: null,
    osc: Math.random() * Math.PI * 2
  };

  G.enemyProjectiles.push(projectile);
}

// Spawns a heavy arcing rock projectile
export function spawnEnemyRock(start, dirOrVel, asVelocity = false) {
  const speed = CFG.golem?.rockSpeed ?? 30;
  const group = new THREE.Group();
  const rock = new THREE.Mesh(ROCK.geo, ROCK.mat);
  rock.castShadow = true; rock.receiveShadow = true;
  group.add(rock);

  // Orientation based on throw direction
  const nd = dirOrVel.clone();
  if (!asVelocity) nd.normalize();
  TMPq.setFromUnitVectors(UP, nd.clone().normalize());
  group.quaternion.copy(TMPq);

  group.position.copy(start);
  G.scene.add(group);

  const vel = asVelocity
    ? dirOrVel.clone()
    : nd.normalize().multiplyScalar(speed);

  const projectile = {
    kind: 'rock',
    mesh: group,
    pos: group.position,
    vel,
    life: CFG.golem?.rockLife ?? 6
  };
  G.enemyProjectiles.push(projectile);
}

export function updateEnemyProjectiles(delta, onPlayerDeath) {
  const gravity = CFG.enemy.arrowGravity;

  for (let i = G.enemyProjectiles.length - 1; i >= 0; i--) {
    const p = G.enemyProjectiles[i];

    // Integrate gravity by projectile kind
    if (p.kind === 'arrow') p.vel.y -= gravity * delta;
    else if (p.kind === 'rock') p.vel.y -= (CFG.golem?.rockGravity ?? gravity) * delta;
    p.pos.addScaledVector(p.vel, delta);

    // Re-orient to velocity
    const vdir = TMPv.copy(p.vel).normalize();
    TMPq.setFromUnitVectors(UP, vdir);
    p.mesh.quaternion.copy(TMPq);

    // Fireball visual flicker
    if (p.kind === 'fireball') {
      p.osc += delta * 14;
      const pulse = 1 + Math.sin(p.osc) * 0.18 + (Math.random() - 0.5) * 0.06;
      p.mesh.scale.setScalar(pulse);
      if (p.ring) p.ring.rotation.z += delta * 3;
      if (p.glow) p.glow.material.opacity = 0.6 + Math.abs(Math.sin(p.osc * 1.3)) * 0.5;
      // no dynamic light
    }
    p.life -= delta;

    // Ground hit against terrain (fireballs usually won't arc down)
    const gy = getTerrainHeight(p.pos.x, p.pos.z);
    if (p.pos.y <= gy) {
      TMPv.set(p.pos.x, gy + 0.02, p.pos.z);
      spawnImpact(TMPv, UP);
      if (p.kind === 'fireball') spawnMuzzleFlashAt(TMPv, 0xff5522);
      if (p.kind === 'rock') spawnMuzzleFlashAt(TMPv, 0xb0b0b0);
      G.scene.remove(p.mesh);
      G.enemyProjectiles.splice(i, 1);
      continue;
    }

    // Tree collision (2D cylinder test using spatial grid)
    const nearTrees = getNearbyTrees(p.pos.x, p.pos.z, 3.5);
    for (let ti = 0; ti < nearTrees.length; ti++) {
      const tree = nearTrees[ti];
      const dx = p.pos.x - tree.x;
      const dz = p.pos.z - tree.z;
      const dist2 = dx * dx + dz * dz;
      const pad = p.kind === 'rock' ? 0.6 : 0.2; // rocks are bulkier
      const r = tree.radius + pad;
      if (dist2 < r * r && p.pos.y < 8) { // below canopy-ish
        spawnImpact(p.pos, UP);
        if (p.kind === 'fireball') spawnMuzzleFlashAt(p.pos, 0xff5522);
        if (p.kind === 'rock') spawnMuzzleFlashAt(p.pos, 0xb0b0b0);
        G.scene.remove(p.mesh);
        G.enemyProjectiles.splice(i, 1);
        continue;
      }
    }

    // Player collision (sphere)
    const hitR = (
      p.kind === 'arrow' ? CFG.enemy.arrowHitRadius :
      p.kind === 'fireball' ? CFG.shaman.fireballHitRadius :
      CFG.golem?.rockHitRadius ?? 0.9
    );
    const pr = hitR + G.player.radius * 0.6; // slightly generous
    if (p.pos.distanceTo(G.player.pos) < pr) {
      const dmg = (
        p.kind === 'arrow' ? CFG.enemy.arrowDamage :
        p.kind === 'fireball' ? CFG.shaman.fireballDamage :
        CFG.golem?.rockDamage ?? 40
      );
      console.log("DAMAGE FROM PROJECTILE. kind: " + p.kind + ", dist: " + p.pos.distanceTo(G.player.pos)); G.player.health -= dmg;
      G.damageFlash = Math.min(1, G.damageFlash + CFG.hud.damagePulsePerHit + dmg * CFG.hud.damagePulsePerHP);
      if (G.player.health <= 0 && G.player.alive) {
        G.player.health = 0;
        G.player.alive = false;
        if (onPlayerDeath) onPlayerDeath();
      }
      spawnImpact(p.pos, UP);
      if (p.kind === 'fireball') spawnMuzzleFlashAt(p.pos, 0xff5522);
      if (p.kind === 'rock') spawnMuzzleFlashAt(p.pos, 0xb0b0b0);
      G.scene.remove(p.mesh);
      G.enemyProjectiles.splice(i, 1);
      continue;
    }

    // Timeout
    if (p.life <= 0) {
      G.scene.remove(p.mesh);
      G.enemyProjectiles.splice(i, 1);
      continue;
    }
  }
}

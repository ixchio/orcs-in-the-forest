import * as THREE from 'three';
import { G } from './globals.js';
import { getTerrainHeight } from './world.js';

// Pop the enemy's helmet off and add simple physics so it drops to ground
export function popHelmet(enemy, impulseDir = new THREE.Vector3(0, 1, 0), hitPoint = null) {
  if (!enemy || !enemy.helmet || !enemy.helmetAttached) return;

  const h = enemy.helmet;

  // Get world transform before detaching
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  h.updateMatrixWorld();
  h.getWorldPosition(worldPos);
  h.getWorldQuaternion(worldQuat);
  h.getWorldScale(worldScale);

  // Detach from enemy and add to scene root
  if (h.parent) h.parent.remove(h);
  h.position.copy(worldPos);
  h.quaternion.copy(worldQuat);
  h.scale.copy(worldScale);
  G.scene.add(h);

  // It should no longer count as enemy geometry for ray hits
  if (h.userData) {
    h.userData.enemy = null;
    h.userData.hitZone = null;
    h.userData.isHelmet = true;
  }

  // Initial velocity: away from shot direction with a fun hop up
  const dir = impulseDir.clone().normalize();
  const upBoost = 3 + G.random() * 1.5;
  const sideJitter = new THREE.Vector3((G.random() - 0.5) * 1.5, 0, (G.random() - 0.5) * 1.5);
  const vel = dir.multiplyScalar(2.2).add(new THREE.Vector3(0, upBoost, 0)).add(sideJitter);

  // Angular velocity for comedic spin
  const angVel = new THREE.Vector3(
    (G.random() - 0.5) * 6,
    (G.random() - 0.5) * 8,
    (G.random() - 0.5) * 6
  );

  G.helmets.push({
    mesh: h,
    pos: h.position,
    vel,
    angVel,
    life: 12, // fade after a while
    grounded: false
  });

  enemy.helmetAttached = false;
}

export function updateHelmets(delta) {
  const gravity = 14; // stronger than arrows for punchy drop
  const bounce = 0.35;

  for (let i = G.helmets.length - 1; i >= 0; i--) {
    const h = G.helmets[i];

    // Integrate
    h.vel.y -= gravity * delta;
    h.pos.addScaledVector(h.vel, delta);

    // Simple rotation integration
    if (h.angVel) {
      h.mesh.rotateX(h.angVel.x * delta);
      h.mesh.rotateY(h.angVel.y * delta);
      h.mesh.rotateZ(h.angVel.z * delta);
    }

    // Ground collision and bounce against terrain
    const groundY = getTerrainHeight(h.pos.x, h.pos.z);
    if (h.pos.y <= groundY) {
      if (!h.grounded) {
        // First impact gets a stronger bounce
        h.grounded = true;
      }
      h.pos.y = groundY;
      if (Math.abs(h.vel.y) > 0.4) {
        h.vel.y = -h.vel.y * bounce;
      } else {
        h.vel.y = 0;
      }
      // Friction on ground
      h.vel.x *= 0.7;
      h.vel.z *= 0.7;
      // Damp spin as it settles
      if (h.angVel) h.angVel.multiplyScalar(0.8);
      if (Math.hypot(h.vel.x, h.vel.z) < 0.2 && Math.abs(h.vel.y) < 0.2) {
        h.vel.set(0, 0, 0);
        if (h.angVel) h.angVel.set(0, 0, 0);
      }
    }

    // Lifetime fade/cleanup
    h.life -= delta;
    if (h.life <= 2) {
      const m = h.mesh.material;
      if (m && m.opacity !== undefined) {
        m.transparent = true;
        m.opacity = Math.max(0, h.life / 2);
      }
    }
    if (h.life <= 0) {
      // Dispose per-helmet geometries
      h.mesh.traverse((obj) => { if (obj.isMesh && obj.geometry?.dispose) obj.geometry.dispose(); });
      G.scene.remove(h.mesh);
      G.helmets.splice(i, 1);
    }
  }
}

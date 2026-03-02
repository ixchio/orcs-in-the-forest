import * as THREE from 'three';
import { G } from './globals.js';

// Shared casing geometry/materials to avoid per-shot allocations
const CASING = (() => {
  const bodyGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.12, 10);
  const capGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.01, 10);
  const brass = new THREE.MeshStandardMaterial({ color: 0xb48a3a, metalness: 0.7, roughness: 0.35 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.2, roughness: 0.7 });
  return { bodyGeo, capGeo, brass, capMat };
})();

const MAX_CASINGS = 40;

// Spawn a brass shell casing at the weapon's ejector anchor
export function spawnShellCasing() {
  if (!G.weapon || !G.weapon.ejector) return;

  const anchor = G.weapon.ejector;
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  anchor.getWorldPosition(pos);
  anchor.getWorldQuaternion(q);

  // Visual: small brass cylinder + dark cap
  const group = new THREE.Group();

  // Cylinder aligned along X: use rotation
  const body = new THREE.Mesh(CASING.bodyGeo, CASING.brass);
  body.rotation.z = Math.PI / 2;
  body.castShadow = false; body.receiveShadow = false;
  group.add(body);

  const cap = new THREE.Mesh(CASING.capGeo, CASING.capMat);
  cap.position.x = 0.06;
  cap.rotation.z = Math.PI / 2;
  cap.castShadow = false; cap.receiveShadow = false;
  group.add(cap);

  group.position.copy(pos);
  G.scene.add(group);

  // Orientation basis from weapon
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();

  // Ejection velocity: mostly right, a bit up, slightly backward
  const baseRight = 2.0 + G.random() * 1.2;
  const baseUp = 1.6 + G.random() * 0.8;
  const back = 0.6 + G.random() * 0.6;
  const jitter = new THREE.Vector3((G.random() - 0.5) * 0.4, (G.random() - 0.5) * 0.4, (G.random() - 0.5) * 0.4);
  const vel = new THREE.Vector3()
    .addScaledVector(right, baseRight)
    .addScaledVector(up, baseUp)
    .addScaledVector(fwd, -back)
    .add(jitter);

  // Random angular velocity for spin
  const angVel = new THREE.Vector3(
    (G.random() - 0.5) * 20,
    (G.random() - 0.5) * 30,
    (G.random() - 0.5) * 20
  );

  // Keep list bounded to avoid unbounded accumulation
  if (G.casings.length >= MAX_CASINGS) {
    const old = G.casings.shift();
    if (old) G.scene.remove(old.mesh);
  }

  G.casings.push({
    mesh: group,
    pos: group.position,
    vel,
    angVel,
    life: 6,
    grounded: false
  });
}

export function updateCasings(delta) {
  const gravity = 20;
  const bounce = 0.25;
  for (let i = G.casings.length - 1; i >= 0; i--) {
    const c = G.casings[i];

    // Integrate
    c.vel.y -= gravity * delta;
    c.pos.addScaledVector(c.vel, delta);

    // Spin
    if (c.angVel) {
      c.mesh.rotateX(c.angVel.x * delta);
      c.mesh.rotateY(c.angVel.y * delta);
      c.mesh.rotateZ(c.angVel.z * delta);
    }

    // Ground collision (approximate at y ~ body radius)
    const floor = 0.02;
    if (c.pos.y <= floor) {
      c.pos.y = floor;
      if (Math.abs(c.vel.y) > 0.3) {
        c.vel.y = -c.vel.y * bounce;
      } else {
        c.vel.y = 0;
      }
      // Horizontal friction
      c.vel.x *= 0.75;
      c.vel.z *= 0.75;
      // Dampen spin
      if (c.angVel) c.angVel.multiplyScalar(0.88);
    }

    // Lifetime fade and cleanup
    c.life -= delta;
    if (c.life <= 1.5) {
      for (const child of c.mesh.children) {
        const m = child.material;
        if (m && m.opacity !== undefined) {
          m.transparent = true;
          m.opacity = Math.max(0, c.life / 1.5);
        }
      }
    }
    if (c.life <= 0) {
      G.scene.remove(c.mesh);
      G.casings.splice(i, 1);
    }
  }
}

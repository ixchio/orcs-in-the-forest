import * as THREE from 'three';
import { CFG } from './config.js';
import { G } from './globals.js';
import { getTerrainHeight, knockdownNearbyTrees } from './world.js';
import { updateHUD } from './hud.js';
import { spawnExplosionAt } from './fx.js';
import { playExplosion } from './audio.js';
import { spawnHealthOrbs } from './pickups.js';
import { registerKill, getScoreMultiplier } from './killstreak.js';
import { getWeatherScoreMult } from './weather.js';

const TMPv = new THREE.Vector3();
const FORWARD = new THREE.Vector3();
// Shared grenade mesh resources
const GRENADE = (() => {
  // Shared resources for a more realistic grenade
  const bodyGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.22, 12);
  const capGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12);
  const leverGeo = new THREE.BoxGeometry(0.16, 0.03, 0.04);
  const ringGeo = new THREE.TorusGeometry(0.06, 0.01, 8, 20);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2b4c2b, roughness: 0.8, metalness: 0.1 }); // olive green
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.5, metalness: 0.6 });
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, roughness: 0.4, metalness: 0.9 });
  return { bodyGeo, capGeo, leverGeo, ringGeo, bodyMat, metalMat, pinMat };
})();

function createGrenadeMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(GRENADE.bodyGeo, GRENADE.bodyMat);
  body.castShadow = true; body.receiveShadow = false;
  g.add(body);
  const cap = new THREE.Mesh(GRENADE.capGeo, GRENADE.metalMat);
  cap.position.y = 0.14;
  g.add(cap);
  // Yellow identification stripe
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.015, 16), new THREE.MeshStandardMaterial({ color: 0xffd84d, emissive: 0x7a6400, emissiveIntensity: 0.25, roughness: 0.6 }));
  stripe.position.y = 0.06;
  g.add(stripe);
  const lever = new THREE.Mesh(GRENADE.leverGeo, GRENADE.metalMat);
  lever.position.set(0.0, 0.18, -0.08);
  lever.rotation.x = -0.3;
  g.add(lever);
  const ring = new THREE.Mesh(GRENADE.ringGeo, GRENADE.pinMat);
  ring.position.set(-0.06, 0.16, -0.02);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  return g;
}

function throwOrigin(out) {
  // Start near player's feet for better looking arc
  const gx = G.player.pos.x;
  const gz = G.player.pos.z;
  const gy = getTerrainHeight(gx, gz);
  out.set(gx, gy + 0.6, gz);
  FORWARD.set(0, 0, 0);
  G.camera.getWorldDirection(FORWARD);
  // Nudge forward so it doesn't intersect player capsule
  out.addScaledVector(FORWARD, 0.7);
  return out;
}

function throwVelocity() {
  const dir = new THREE.Vector3();
  G.camera.getWorldDirection(dir);
  dir.normalize();
  const v = dir.clone().multiplyScalar(CFG.grenade.speed);
  // Add a small upward boost to keep a pleasant arc, scaled by horizontal aim amount
  const horiz = Math.min(1, Math.hypot(dir.x, dir.z));
  v.y += (CFG.grenade.yBoost || 0) * horiz;
  // Carry some of the player lateral velocity
  v.x += G.player.vel.x * 0.25;
  v.z += G.player.vel.z * 0.25;
  return v;
}

function ensurePreview() {
  if (G.grenadePreview) return;
  // Line for arc
  const pts = new Float32Array((CFG.grenade.previewSteps) * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.9, depthTest: true });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 10;
  // Landing marker
  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.06, 10, 24),
    new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.75, depthTest: true })
  );
  marker.rotation.x = Math.PI / 2;
  marker.renderOrder = 10;
  G.scene.add(line);
  G.scene.add(marker);
  G.grenadePreview = { line, marker };
}

function clearPreview() {
  if (!G.grenadePreview) return;
  const { line, marker } = G.grenadePreview;
  if (line) {
    G.scene.remove(line);
    line.geometry.dispose();
    if (line.material?.dispose) line.material.dispose();
  }
  if (marker) {
    G.scene.remove(marker);
    marker.geometry.dispose();
    if (marker.material?.dispose) marker.material.dispose();
  }
  G.grenadePreview = null;
}

export function primeGrenade() {
  if (G.state !== 'playing' || !G.player.alive) return;
  if (G.heldGrenade || G.grenadeCount <= 0) return;
  // Consume a grenade and start fuse
  G.grenadeCount -= 1;
  updateHUD();
  G.heldGrenade = { fuseLeft: CFG.grenade.fuse };
  ensurePreview();
}

export function releaseGrenade() {
  if (!G.heldGrenade) return;
  // Spawn a thrown grenade with remaining fuse
  const pos = throwOrigin(new THREE.Vector3());
  const vel = throwVelocity();
  const mesh = createGrenadeMesh();
  mesh.position.copy(pos);
  G.scene.add(mesh);
  const g = {
    pos,
    vel,
    fuseLeft: G.heldGrenade.fuseLeft,
    alive: true,
    grounded: false,
    mesh
  };
  G.grenades.push(g);
  G.heldGrenade = null;
  clearPreview();
}

function explodeAt(position) {
  // Visual + sound
  spawnExplosionAt(position, CFG.grenade.radius);
  playExplosion();

  // Damage enemies (simple radial falloff)
  for (let i = 0; i < G.enemies.length; i++) {
    const e = G.enemies[i];
    if (!e.alive) continue;
    const d = position.distanceTo(e.pos);
    if (d <= CFG.grenade.radius) {
      const t = Math.max(0, 1 - d / CFG.grenade.radius);
      const dmg = CFG.grenade.maxDamage * (0.3 + 0.7 * t); // keep some damage at edge
      e.hp -= dmg;
      if (e.hp <= 0 && e.alive) {
        e.alive = false;
        e.deathTimer = 0;
        G.waves.aliveCount--;
        const scoreMult = getScoreMultiplier() * getWeatherScoreMult();
        G.player.score += 10 * scoreMult;
        G.stats.kills++;
        registerKill();
        // Heals: larger drop for golems
        if (e.type === 'golem') {
          spawnHealthOrbs(e.pos, 15 + Math.floor(G.random() * 6)); // 15..20
        } else {
          spawnHealthOrbs(e.pos, 1 + Math.floor(G.random() * 3));
        }
      }
    }
  }

  // Damage player
  const pd = position.distanceTo(G.player.pos);
  if (pd <= CFG.grenade.radius) {
    const t = Math.max(0, 1 - pd / CFG.grenade.radius);
    const dmg = CFG.grenade.selfMaxDamage * (0.3 + 0.7 * t);
    G.player.health -= dmg;
    G.damageFlash = Math.min(1, G.damageFlash + dmg * CFG.hud.damagePulsePerHP);
    if (G.player.health <= 0 && G.player.alive) {
      G.player.health = 0;
      G.player.alive = false;
    }
  }

  // Knock down nearby trees
  knockdownNearbyTrees(position, CFG.grenade.radius);

  // Shrapnel upgrade: split into 3 mini-explosions
  const shrapStacks = G.upgrades?.shrapnel || 0;
  if (shrapStacks > 0) {
    for (let s = 0; s < 3 * shrapStacks; s++) {
      const angle = G.random() * Math.PI * 2;
      const dist = CFG.grenade.radius * 0.4 + G.random() * CFG.grenade.radius * 0.3;
      const subPos = position.clone();
      subPos.x += Math.cos(angle) * dist;
      subPos.z += Math.sin(angle) * dist;
      subPos.y = getTerrainHeight(subPos.x, subPos.z) + 0.5;
      spawnExplosionAt(subPos, CFG.grenade.radius * 0.3);
      // Mini damage
      for (let i = 0; i < G.enemies.length; i++) {
        const e = G.enemies[i];
        if (!e.alive) continue;
        const d = subPos.distanceTo(e.pos);
        const subRadius = CFG.grenade.radius * 0.5;
        if (d <= subRadius) {
          const t = Math.max(0, 1 - d / subRadius);
          e.hp -= CFG.grenade.maxDamage * 0.35 * t;
          if (e.hp <= 0 && e.alive) {
            e.alive = false; e.deathTimer = 0;
            G.waves.aliveCount--;
            G.player.score += 10;
            G.stats.kills++;
            registerKill();
            spawnHealthOrbs(e.pos, 1 + Math.floor(G.random() * 2));
          }
        }
      }
    }
  }
}

export function updateGrenades(delta) {
  // Update held grenade: fuse + preview
  if (G.heldGrenade) {
    G.heldGrenade.fuseLeft -= delta;
    if (G.heldGrenade.fuseLeft <= 0) {
      // Explode in hand
      clearPreview();
      explodeAt(G.player.pos.clone());
      G.heldGrenade = null;
      updateHUD();
    } else {
      // Update preview arc
      ensurePreview();
      const origin = throwOrigin(new THREE.Vector3());
      const vel0 = throwVelocity();
      const dt = CFG.grenade.previewDt;
      const n = CFG.grenade.previewSteps;
      const posAttr = G.grenadePreview.line.geometry.getAttribute('position');
      let p = origin.clone();
      let v = vel0.clone();
      let hitPos = null;
      for (let i = 0; i < n; i++) {
        const idx = i * 3;
        posAttr.array[idx] = p.x;
        posAttr.array[idx + 1] = p.y;
        posAttr.array[idx + 2] = p.z;
        // step
        v.y -= CFG.grenade.gravity * dt;
        p.addScaledVector(v, dt);
        const ground = getTerrainHeight(p.x, p.z);
        if (p.y <= ground) {
          p.y = ground;
          hitPos = p.clone();
          // Fill remaining points at landing
          for (let k = i + 1; k < n; k++) {
            const id2 = k * 3;
            posAttr.array[id2] = p.x;
            posAttr.array[id2 + 1] = p.y;
            posAttr.array[id2 + 2] = p.z;
          }
          break;
        }
      }
      posAttr.needsUpdate = true;
      if (G.grenadePreview.marker) {
        G.grenadePreview.marker.position.copy(hitPos || p);
      }
    }
  }

  // Update thrown grenades
  for (let i = G.grenades.length - 1; i >= 0; i--) {
    const g = G.grenades[i];
    if (!g.alive) { G.grenades.splice(i, 1); continue; }
    g.fuseLeft -= delta;

    // Physics
    g.vel.y -= CFG.grenade.gravity * delta;
    g.pos.addScaledVector(g.vel, delta);
    const ground = getTerrainHeight(g.pos.x, g.pos.z);
    if (g.pos.y <= ground) {
      g.pos.y = ground;
      // Simple damp when on ground
      g.vel.set(0, 0, 0);
      g.grounded = true;
    }

    // Sync mesh
    if (g.mesh) { g.mesh.position.copy(g.pos); g.mesh.rotation.y += delta * 2; }

    if (g.fuseLeft <= 0) {
      explodeAt(g.pos.clone());
      if (g.mesh) { G.scene.remove(g.mesh); g.mesh = null; }
      g.alive = false;
      G.grenades.splice(i, 1);
      updateHUD();
    }
  }
}

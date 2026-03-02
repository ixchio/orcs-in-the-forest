import * as THREE from 'three';
import { G } from './globals.js';
import { CFG } from './config.js';
import { getTerrainHeight } from './world.js';
import { playPowerupPickup } from './audio.js';

// Share orb material/geometry to avoid per-orb allocations
// Switch to unlit Basic material so orbs glow without extra scene lights
const ORB_MAT = new THREE.MeshBasicMaterial({
  color: 0x5cff9a
});
const ORB_GEO = new THREE.SphereGeometry(0.12, 14, 12);

// Accelerator (ROF boost) shared resources
// Battery aesthetic with yellow accent/glow
const ACCEL_COLOR = 0xffd84d; // warm yellow
const ACCEL_MAT = new THREE.MeshBasicMaterial({ color: ACCEL_COLOR, fog: false });
const ACCEL_SEG_GEO = new THREE.BoxGeometry(0.12, 0.42, 0.06); // repurposed for plus symbol arms
const GLOW_TEX = makeGlowTexture(128, 1, 0);

function makeGlowTexture(size = 128, inner = 1, outer = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, `rgba(255,255,255,${inner})`);
  grad.addColorStop(1, `rgba(255,255,255,${outer})`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function makeAcceleratorMesh() {
  const g = new THREE.Group();

  // --- Battery body ---
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x1c1f24, fog: false }); // dark shell
  const bodyGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.72, 18, 1);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 0, 0);
  g.add(body);

  // Metallic positive terminal cap (+) on top
  const capMat = new THREE.MeshBasicMaterial({ color: 0xcfd3d6, fog: false });
  const capGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 18, 1);
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.position.set(0, 0.40, 0);
  g.add(cap);

  // Accent stripe around the body (green energy band)
  const stripeGeo = new THREE.CylinderGeometry(0.225, 0.225, 0.18, 18, 1);
  const stripe = new THREE.Mesh(stripeGeo, ACCEL_MAT);
  stripe.position.set(0, 0.0, 0);
  g.add(stripe);

  // Embossed plus symbol on the front face
  const plusMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const plusH = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.02), plusMat);
  const plusV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.02), plusMat);
  // Place slightly off the surface to avoid z-fighting, near the upper third
  plusH.position.set(0, 0.18, 0.205);
  plusV.position.set(0, 0.18, 0.205);
  g.add(plusH);
  g.add(plusV);

  // --- Glow sprites (inner core + outer aura) ---
  const innerMat = new THREE.SpriteMaterial({
    map: GLOW_TEX,
    color: ACCEL_COLOR,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    fog: false
  });
  const outerMat = new THREE.SpriteMaterial({
    map: GLOW_TEX,
    color: ACCEL_COLOR,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    fog: false
  });
  const inner = new THREE.Sprite(innerMat);
  const outer = new THREE.Sprite(outerMat);
  inner.scale.set(0.7, 0.7, 1);
  outer.scale.set(1.7, 1.7, 1);
  g.add(outer);
  g.add(inner);

  g.castShadow = false;
  g.receiveShadow = false;
  // Expose for animation
  g.userData.glowInner = inner;
  g.userData.glowOuter = outer;
  return g;
}

// Infinite ammo (indigo bullet) shared resources
const INF_COLOR = 0x6366f1; // brighter indigo

function makeInfiniteAmmoMesh() {
  const g = new THREE.Group();

  // Bullet body: cylinder + conical tip
  const bodyMat = new THREE.MeshBasicMaterial({ color: INF_COLOR, fog: false });
  const bodyGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.52, 16, 1);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 0.0, 0);
  g.add(body);

  const tipGeo = new THREE.ConeGeometry(0.10, 0.20, 16);
  const tip = new THREE.Mesh(tipGeo, bodyMat);
  tip.position.set(0, 0.36, 0);
  g.add(tip);

  // Base cap
  const baseMat = new THREE.MeshBasicMaterial({ color: 0x221133, fog: false });
  const baseGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 16, 1);
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.set(0, -0.29, 0);
  g.add(base);

  // Glow sprites similar to accelerator
  const innerMat = new THREE.SpriteMaterial({
    map: GLOW_TEX,
    color: INF_COLOR,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    fog: false
  });
  const outerMat = new THREE.SpriteMaterial({
    map: GLOW_TEX,
    color: INF_COLOR,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    fog: false
  });
  const inner = new THREE.Sprite(innerMat);
  const outer = new THREE.Sprite(outerMat);
  inner.scale.set(0.7, 0.7, 1);
  outer.scale.set(1.7, 1.7, 1);
  g.add(outer);
  g.add(inner);

  g.castShadow = false;
  g.receiveShadow = false;
  g.userData.glowInner = inner;
  g.userData.glowOuter = outer;
  return g;
}

// Spawn N accelerator powerups at random world locations
// They float near ground and rotate, granting x2 ROF for 20s on pickup
export function spawnAccelerators(count) {
  const n = Math.max(0, Math.min(6, Math.floor(count)));
  const half = CFG.forestSize / 2;
  const margin = 12;

  function sampleAroundAnchor() {
    const a = G.waves?.spawnAnchor;
    if (!a) return null;
    // Uniform-in-area annulus around wave spawn anchor
    const Rmin = 8;
    const Rmax = 26;
    const u = G.random();
    const r = Math.sqrt(u * (Rmax * Rmax - Rmin * Rmin) + Rmin * Rmin);
    const t = G.random() * Math.PI * 2;
    let x = a.x + Math.cos(t) * r;
    let z = a.z + Math.sin(t) * r;
    // Clamp to playable bounds
    x = Math.max(-half + margin, Math.min(half - margin, x));
    z = Math.max(-half + margin, Math.min(half - margin, z));
    return { x, z };
  }

  function sampleGlobal() {
    // Fallback: uniform across map square, reject inside clearing
    const clear = (CFG.clearRadius || 12) + 4;
    for (let tries = 0; tries < 10; tries++) {
      const x = (G.random() * 2 - 1) * (half - margin);
      const z = (G.random() * 2 - 1) * (half - margin);
      if (Math.hypot(x, z) < clear) continue;
      return { x, z };
    }
    return { x: (G.random() * 2 - 1) * (half - margin), z: (G.random() * 2 - 1) * (half - margin) };
  }

  for (let i = 0; i < n; i++) {
    const pt = sampleAroundAnchor() || sampleGlobal();
    const gy = getTerrainHeight(pt.x, pt.z);
    const group = makeAcceleratorMesh();
    const baseY = gy + 0.60; // raise so bolt never clips ground
    group.position.set(pt.x, baseY + 0.14, pt.z);
    group.scale.setScalar(1.5); // 50% bigger
    G.scene.add(group);

    const p = {
      type: 'accelerator',
      mesh: group,
      pos: group.position,
      baseY,
      bobT: G.random() * Math.PI * 2,
      rotSpeed: 2.6 + G.random() * 1.2,
      glowInner: group.userData.glowInner,
      glowOuter: group.userData.glowOuter,
      glowT: G.random() * Math.PI * 2
    };
    G.powerups.push(p);
  }
}

// Spawn N infinite-ammo powerups (indigo bullet) scattered around waves anchor
export function spawnInfiniteAmmo(count) {
  const n = Math.max(0, Math.min(3, Math.floor(count)));
  const half = CFG.forestSize / 2;
  const margin = 12;

  function sampleAroundAnchor() {
    const a = G.waves?.spawnAnchor;
    if (!a) return null;
    const Rmin = 8;
    const Rmax = 26;
    const u = G.random();
    const r = Math.sqrt(u * (Rmax * Rmax - Rmin * Rmin) + Rmin * Rmin);
    const t = G.random() * Math.PI * 2;
    let x = a.x + Math.cos(t) * r;
    let z = a.z + Math.sin(t) * r;
    x = Math.max(-half + margin, Math.min(half - margin, x));
    z = Math.max(-half + margin, Math.min(half - margin, z));
    return { x, z };
  }

  function sampleGlobal() {
    const clear = (CFG.clearRadius || 12) + 4;
    for (let tries = 0; tries < 10; tries++) {
      const x = (G.random() * 2 - 1) * (half - margin);
      const z = (G.random() * 2 - 1) * (half - margin);
      if (Math.hypot(x, z) < clear) continue;
      return { x, z };
    }
    return { x: (G.random() * 2 - 1) * (half - margin), z: (G.random() * 2 - 1) * (half - margin) };
  }

  for (let i = 0; i < n; i++) {
    const pt = sampleAroundAnchor() || sampleGlobal();
    const gy = getTerrainHeight(pt.x, pt.z);
    const group = makeInfiniteAmmoMesh();
    const baseY = gy + 0.60;
    group.position.set(pt.x, baseY + 0.14, pt.z);
    group.scale.setScalar(1.5); // match accelerator size
    G.scene.add(group);

    const p = {
      type: 'infiniteAmmo',
      mesh: group,
      pos: group.position,
      baseY,
      bobT: G.random() * Math.PI * 2,
      rotSpeed: 2.8 + G.random() * 1.2,
      glowInner: group.userData.glowInner,
      glowOuter: group.userData.glowOuter,
      glowT: G.random() * Math.PI * 2
    };
    G.powerups.push(p);
  }
}

// Spawns N small glowing green health orbs around a position
export function spawnHealthOrbs(center, count) {
  // Allow larger drops (e.g., golem 15–20); cap to keep it reasonable
  const n = Math.max(1, Math.min(30, Math.floor(count)));
  for (let i = 0; i < n; i++) {
    const group = new THREE.Group();

    // Slight radial scatter around center (tighter grouping)
    const r = 0.12 + G.random() * 0.48; // was up to ~1.4
    const t = G.random() * Math.PI * 2;
    const startY = 0.9 + G.random() * 0.8; // spawn a bit in the air
    group.position.set(
      center.x + Math.cos(t) * r,
      startY,
      center.z + Math.sin(t) * r
    );

    const sphere = new THREE.Mesh(ORB_GEO, ORB_MAT);
    sphere.castShadow = false;
    sphere.receiveShadow = false;
    group.add(sphere);

    G.scene.add(group);

    // Initial outward + upward velocity (reduced to keep grouping tighter)
    const dir = new THREE.Vector3(Math.cos(t), 0, Math.sin(t));
    const speed = 0.8 + G.random() * 1.4; // was up to ~4.8
    const vel = dir.multiplyScalar(speed);
    vel.y = 2.2 + G.random() * 1.6; // was up to ~5.5

    const orb = {
      mesh: group,
      light: null,
      pos: group.position,
      radius: 0.7, // legacy; pickup now uses absolute distance
      heal: 1,
      bobT: G.random() * Math.PI * 2,
      vel,
      state: 'air', // 'air' | 'settled'
      settleTimer: 0,
      baseY: 0.2,
      magnet: false
    };
    G.orbs.push(orb);
  }
}

export function updatePickups(delta) {
  // Attraction/pickup thresholds (meters)
  const ATTRACT_RADIUS = 5.0; // start pulling from farther away
  const PICKUP_DIST = 3.0;    // auto-collect distance
  for (let i = G.orbs.length - 1; i >= 0; i--) {
    const o = G.orbs[i];

    // Simple physics: integrate while in air, bounce on ground, then settle to bob
    if (o.state !== 'settled') {
      // Gravity
      if (o.vel) o.vel.y -= 18 * delta;
      // Integrate
      if (o.vel) o.pos.addScaledVector(o.vel, delta);

      // Ground collision (sphere radius ~0.12)
      const ground = getTerrainHeight(o.pos.x, o.pos.z);
      const floor = ground + 0.12;
      if (o.pos.y <= floor) {
        o.pos.y = floor;
        if (o.vel) {
          const bounce = 0.35;
          const friction = 10.0; // stronger horizontal damping for tighter spread
          if (Math.abs(o.vel.y) > 0.6) {
            o.vel.y = -o.vel.y * bounce;
          } else {
            o.vel.y = 0;
          }
          // Horizontal friction
          const fr = Math.max(0, 1 - friction * delta);
          o.vel.x *= fr;
          o.vel.z *= fr;

          // Settle detection
          const horizSpeed = Math.hypot(o.vel.x, o.vel.z);
          if (horizSpeed < 0.15 && Math.abs(o.vel.y) < 0.05) {
            o.settleTimer += delta;
            if (o.settleTimer > 0.15) {
              o.state = 'settled';
              o.baseY = ground + 0.2;
              // Snap to a clean base height
              o.pos.y = o.baseY;
            }
          } else {
            o.settleTimer = 0;
          }
        }
      }
    }

    // Visuals: rotation and glow pulse
    o.bobT += delta * 2.0;
    // Speed up spin slightly when magnetized
    const spin = o.magnet ? 4.0 : 1.5;
    o.mesh.rotation.y += delta * spin;
    // No dynamic light; keep unlit glow cheap

    // If settled and not magnetized, apply gentle bob around baseY
    if (o.state === 'settled' && !o.magnet) {
      o.pos.y = o.baseY + Math.sin(o.bobT) * 0.06;
    }

    // Distance on ground plane (for feel); magnet + pickup thresholds
    const dx = o.pos.x - G.player.pos.x;
    const dz = o.pos.z - G.player.pos.z;
    const dist = Math.hypot(dx, dz);
    // Begin attraction when close enough
    if (!o.magnet && dist <= ATTRACT_RADIUS) {
      o.magnet = true;
    }
    // Attraction animation: pull toward player smoothly
    if (o.magnet) {
      // Disable physics while magnetized for a clean pull
      if (o.vel) { o.vel.set(0, 0, 0); }
      const t = Math.max(0, Math.min(1, 1 - dist / ATTRACT_RADIUS));
      // Non-linear catch-up factor for a snappy feel
      const alpha = 1 - Math.pow(1 - Math.min(0.95, 0.15 + t * 0.8), Math.max(1, delta * 60));
      // Target toward player's position (eye-level), looks good with vertical glide
      o.pos.lerp(G.player.pos, alpha);
      // Scale up slightly as it gets closer
      const s = 1 + 0.35 * t;
      o.mesh.scale.setScalar(s);
    } else {
      // Reset scale when not magnetized
      o.mesh.scale.setScalar(1);
    }

    // Pickup check using absolute distance threshold (meters)
    if (dist <= PICKUP_DIST && G.player.alive && G.state === 'playing') {
      G.player.health = Math.min(CFG.player.health, G.player.health + o.heal);
      // Pulse green heal overlay
      G.healFlash = Math.min(1, G.healFlash + CFG.hud.healPulsePerPickup + o.heal * CFG.hud.healPulsePerHP);
      // Dispose unique geometries (materials are shared)
      o.mesh.traverse((obj) => { if (obj.isMesh && obj.geometry?.dispose) obj.geometry.dispose(); });
      G.scene.remove(o.mesh);
      G.orbs.splice(i, 1);
    }
  }

  // Update ephemeral powerups (non-magnetized; float + rotate)
  for (let i = G.powerups.length - 1; i >= 0; i--) {
    const p = G.powerups[i];
    // Bob and spin
    p.bobT += delta * 2.0;
    p.pos.y = p.baseY + Math.sin(p.bobT) * 0.12 + 0.14;
    p.mesh.rotation.y += delta * p.rotSpeed;
    // Stronger glow pulse
    p.glowT += delta * 3.2;
    const glowPulse = 0.7 + Math.sin(p.glowT) * 0.3; // 0.4..1.0
    if (p.glowInner && p.glowInner.material) {
      // Much softer core
      p.glowInner.material.opacity = 0.30 + glowPulse * 0.20; // ~0.38..0.50
      p.glowInner.scale.set(0.70 + glowPulse * 0.12, 0.70 + glowPulse * 0.12, 1);
    }
    if (p.glowOuter && p.glowOuter.material) {
      // Keep aura noticeable but not blown out
      p.glowOuter.material.opacity = 0.35 + glowPulse * 0.40; // ~0.51..0.75
      p.glowOuter.scale.set(1.60 + glowPulse * 0.50, 1.60 + glowPulse * 0.50, 1);
    }

    // Pickup check
    const dx = p.pos.x - G.player.pos.x;
    const dz = p.pos.z - G.player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= 2.4 && G.player.alive && G.state === 'playing') {
      if (p.type === 'accelerator') {
        // Apply/refresh ROF buff: x2 for 20s
        G.weapon.rofMult = 2;
        G.weapon.rofBuffTimer = 20;
        G.weapon.rofBuffTotal = 20;
        // Movement speed buff: +50% for 20s
        G.movementMult = 1.5;
        G.movementBuffTimer = 20;
        // Audio cue for powerup pickup
        try { playPowerupPickup(); } catch {}
      } else if (p.type === 'infiniteAmmo') {
        // Apply/refresh infinite ammo for 12s
        if (G.weapon.infiniteAmmoTimer <= 0) {
          G.weapon.ammoBeforeInf = G.weapon.ammo;
          G.weapon.reserveBeforeInf = G.weapon.reserve;
        }
        G.weapon.infiniteAmmoTimer = 12;
        G.weapon.infiniteAmmoTotal = 12;
        // Cancel any reload in progress
        G.weapon.reloading = false;
        G.weapon.reloadTimer = 0;
        // Audio cue for powerup pickup
        try { playPowerupPickup(); } catch {}
      }
      G.scene.remove(p.mesh);
      G.powerups.splice(i, 1);
    }
  }
}

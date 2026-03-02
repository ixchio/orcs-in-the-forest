import * as THREE from 'three';
import { CFG } from './config.js';
import { G } from './globals.js';

export function spawnTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 9;
  G.scene.add(line);
  G.fx.tracers.push({ mesh: line, life: CFG.fx.tracerLife });
}

export function spawnTracerColored(from, to, color = 0xff4444, opacity = 0.85) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 9;
  G.scene.add(line);
  G.fx.tracers.push({ mesh: line, life: CFG.fx.tracerLife });
}

export function spawnImpact(point, normal) {
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.15, 0.15),
    new THREE.MeshBasicMaterial({ color: 0xffbb55, transparent: true, opacity: 0.9, depthTest: true })
  );
  plane.position.copy(point);
  plane.lookAt(G.camera.position);
  G.scene.add(plane);
  G.fx.impacts.push({ mesh: plane, life: CFG.fx.impactLife });
}

export function spawnMuzzleFlash() {
  if (!G.weapon.muzzle) return;
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 1.0, depthTest: false })
  );
  G.weapon.muzzle.getWorldPosition(quad.position);
  quad.lookAt(G.camera.position);
  quad.renderOrder = 11;
  G.scene.add(quad);

  // Avoid dynamic lights to prevent shader recompiles
  G.fx.flashes.push({ mesh: quad, light: null, life: CFG.fx.muzzleLife });
}

export function spawnMuzzleFlashAt(worldPos, color = 0xffc060) {
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.18),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1.0, depthTest: false })
  );
  quad.position.copy(worldPos);
  quad.lookAt(G.camera.position);
  quad.renderOrder = 11;
  G.scene.add(quad);

  G.fx.flashes.push({ mesh: quad, light: null, life: CFG.fx.muzzleLife });
}

// Quick, subtle dust puff at a world position
export function spawnDustAt(worldPos, color = 0xcdbf9e, size = 0.55, life = 0.14) {
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: true })
  );
  quad.position.copy(worldPos);
  quad.position.y += 0.15; // lift slightly off the ground
  quad.lookAt(G.camera.position);
  quad.renderOrder = 8;
  G.scene.add(quad);

  G.fx.dusts.push({ mesh: quad, life, maxLife: life });
}

// Portal effect: additive ring that grows and fades, plus soft light
export function spawnPortalAt(worldPos, color = 0xff5522, size = 1.1, life = 0.35) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(size * 0.35, size * 0.08, 12, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  ring.position.copy(worldPos);
  ring.rotation.x = Math.PI / 2;
  ring.renderOrder = 12;
  const flare = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 0.9, size * 0.9),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  flare.position.copy(worldPos);
  flare.lookAt(G.camera.position);
  flare.renderOrder = 12;
  G.scene.add(ring);
  G.scene.add(flare);
  G.fx.portals.push({ ring, flare, light: null, life, maxLife: life, rot: Math.random() * Math.PI * 2 });
}

// Grenade explosion: additive glow sphere + shock ring + light
export function spawnExplosionAt(worldPos, radius = 6) {
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.4, 18, 14),
    new THREE.MeshBasicMaterial({ color: 0xffaa55, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.position.copy(worldPos);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.25, radius * 0.08, 12, 28),
    new THREE.MeshBasicMaterial({ color: 0xffdd99, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  ring.position.copy(worldPos);
  ring.rotation.x = Math.PI / 2;
  G.scene.add(glow);
  G.scene.add(ring);
  G.explosions.push({ glow, ring, light: null, life: 0.5, maxLife: 0.5 });
}

export function updateFX(delta) {
  for (let i = G.fx.tracers.length - 1; i >= 0; i--) {
    const t = G.fx.tracers[i];
    t.life -= delta;
    t.mesh.material.opacity = Math.max(0, t.life / CFG.fx.tracerLife);
    if (t.life <= 0) {
      G.scene.remove(t.mesh);
      t.mesh.geometry.dispose();
      if (t.mesh.material && t.mesh.material.dispose) t.mesh.material.dispose();
      G.fx.tracers.splice(i, 1);
    }
  }
  for (let i = G.fx.impacts.length - 1; i >= 0; i--) {
    const s = G.fx.impacts[i];
    s.life -= delta;
    s.mesh.material.opacity = Math.max(0, s.life / CFG.fx.impactLife);
    s.mesh.scale.setScalar(1 + (1 - s.life / CFG.fx.impactLife) * 0.5);
    if (s.life <= 0) {
      G.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      if (s.mesh.material && s.mesh.material.dispose) s.mesh.material.dispose();
      G.fx.impacts.splice(i, 1);
    }
  }
  for (let i = G.fx.flashes.length - 1; i >= 0; i--) {
    const m = G.fx.flashes[i];
    m.life -= delta;
    m.mesh.material.opacity = Math.max(0, m.life / CFG.fx.muzzleLife);
    m.mesh.scale.setScalar(1 + (1 - m.life / CFG.fx.muzzleLife) * 0.6);
    if (m.life <= 0) {
      G.scene.remove(m.mesh);
      m.mesh.geometry.dispose();
      if (m.mesh.material && m.mesh.material.dispose) m.mesh.material.dispose();
      G.fx.flashes.splice(i, 1);
    }
  }
  // Dust puffs: very short-lived billboards that expand and fade
  for (let i = G.fx.dusts.length - 1; i >= 0; i--) {
    const d = G.fx.dusts[i];
    d.life -= delta;
    const t = Math.max(0, d.life / d.maxLife);
    d.mesh.material.opacity = t;
    d.mesh.scale.setScalar(1 + (1 - t) * 0.8);
    d.mesh.lookAt(G.camera.position);
    if (d.life <= 0) {
      G.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      if (d.mesh.material && d.mesh.material.dispose) d.mesh.material.dispose();
      G.fx.dusts.splice(i, 1);
    }
  }
  // Portals
  for (let i = G.fx.portals.length - 1; i >= 0; i--) {
    const p = G.fx.portals[i];
    p.life -= delta;
    const t = Math.max(0, p.life / p.maxLife);
    const s = 1 + (1 - t) * 1.6;
    p.rot += delta * 4;
    p.ring.rotation.z = p.rot;
    p.ring.material.opacity = 0.25 + 0.7 * t;
    p.ring.scale.setScalar(s);
    p.flare.material.opacity = 0.15 + 0.45 * t;
    p.flare.scale.setScalar(s * 1.2);
    p.flare.lookAt(G.camera.position);
    if (p.life <= 0) {
      G.scene.remove(p.ring);
      G.scene.remove(p.flare);
      p.ring.geometry.dispose();
      p.flare.geometry.dispose();
      if (p.ring.material && p.ring.material.dispose) p.ring.material.dispose();
      if (p.flare.material && p.flare.material.dispose) p.flare.material.dispose();
      G.fx.portals.splice(i, 1);
    }
  }

  // Explosions
  for (let i = G.explosions.length - 1; i >= 0; i--) {
    const e = G.explosions[i];
    e.life -= delta;
    const t = Math.max(0, e.life / e.maxLife);
    const s = 1 + (1 - t) * 2.2;
    if (e.glow) {
      e.glow.material.opacity = 0.3 + 0.7 * t;
      e.glow.scale.setScalar(s);
    }
    if (e.ring) {
      e.ring.material.opacity = 0.2 + 0.7 * t;
      e.ring.scale.setScalar(0.9 + (1 - t) * 2.6);
      e.ring.rotation.z += delta * 2.5;
    }
    if (e.life <= 0) {
      if (e.glow) { G.scene.remove(e.glow); e.glow.geometry.dispose(); if (e.glow.material?.dispose) e.glow.material.dispose(); }
      if (e.ring) { G.scene.remove(e.ring); e.ring.geometry.dispose(); if (e.ring.material?.dispose) e.ring.material.dispose(); }
      G.explosions.splice(i, 1);
    }
  }
}

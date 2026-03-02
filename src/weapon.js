import * as THREE from 'three';
import { CFG } from './config.js';
import { G } from './globals.js';
import { updateHUD } from './hud.js';
import { playReloadStart, playReloadEnd } from './audio.js';
import { launchWeaponRedrawAgent } from './redrawAgents.js';

// Helper to get the active weapon's config
export function activeWeaponConfig() {
  if (G.activeWeaponSlot === 2) return CFG.sniper;
  if (G.activeWeaponSlot === 1) return CFG.shotgun;
  return CFG.gun;
}

function computeWeaponBasePos() {
  const d = G.weapon.anchor.depth;
  const halfH = Math.tan(THREE.MathUtils.degToRad(G.camera.fov * 0.5)) * d;
  const halfW = halfH * G.camera.aspect;
  const x = halfW - G.weapon.anchor.right;
  const y = -halfH + G.weapon.anchor.bottom;
  return new THREE.Vector3(x, y, -d);
}

export function updateWeaponAnchor() {
  G.weapon.basePos.copy(computeWeaponBasePos());
  if (G.weapon.group) {
    G.weapon.group.position.copy(G.weapon.basePos);
    G.weapon.group.rotation.copy(G.weapon.baseRot);
  }
}

export function setupWeapon() {
  const makeVM = (color, metal = 0.4, rough = 0.6) => {
    const m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
    m.fog = false;
    m.depthTest = false;
    return m;
  };

  const steel = makeVM(0x2a2d30, 0.8, 0.35);
  const polymer = makeVM(0x1b1f23, 0.1, 0.8);
  const tan = makeVM(0x7b6a4d, 0.2, 0.7);

  const g = new THREE.Group();
  g.renderOrder = 10;
  g.castShadow = false;
  g.receiveShadow = false;

  const handguardL = 0.62;
  const receiverL = 0.40;
  const barrelL = 0.60;
  const muzzleL = 0.10;
  const stockL = 0.34;

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, receiverL), steel);
  receiver.position.set(0.00, 0.00, -0.42);
  g.add(receiver);

  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.22), steel);
  lower.position.set(0.00, -0.10, -0.36);
  g.add(lower);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.22, 0.08), polymer);
  grip.position.set(-0.06, -0.19, -0.28);
  grip.rotation.x = -0.6;
  g.add(grip);

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.22, 0.14), polymer);
  mag.position.set(0.02, -0.16, -0.44);
  mag.rotation.x = 0.35;
  g.add(mag);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, stockL), tan);
  stock.position.set(-0.02, 0.01, +0.02);
  g.add(stock);

  const butt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.06), polymer);
  butt.position.set(-0.02, 0.01, +0.22);
  g.add(butt);

  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.12, handguardL), tan);
  handguard.position.set(0.00, 0.00, -0.90);
  g.add(handguard);

  const rail = new THREE.Group();
  const lugW = 0.035, lugH = 0.01, lugD = 0.03;
  const lugCount = 12;
  for (let i = 0; i < lugCount; i++) {
    const lug = new THREE.Mesh(new THREE.BoxGeometry(lugW, lugH, lugD), steel);
    lug.position.set(0, 0.10, -0.55 - i * 0.03);
    rail.add(lug);
  }
  g.add(rail);

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.08), steel);
  base.position.set(0.00, 0.09, -0.62);
  g.add(base);

  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12), steel);
  hood.rotation.x = Math.PI / 2;
  hood.position.set(0.00, 0.09, -0.70);
  g.add(hood);

  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.028, 16),
    new THREE.MeshStandardMaterial({ color: 0x66aaff, emissive: 0x112244, metalness: 0.2, roughness: 0.1 })
  );
  lens.position.set(0.00, 0.09, -0.66);
  lens.rotation.x = Math.PI / 2;
  lens.material.fog = false;
  lens.material.depthTest = false;
  g.add(lens);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, barrelL, 12), steel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.00, 0.00, -1.25);
  g.add(barrel);

  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, muzzleL, 10), steel);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0.00, 0.00, -1.58);
  g.add(muzzle);

  const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.02), steel);
  frontPost.position.set(0.00, 0.06, -1.55);
  g.add(frontPost);

  const muzzleAnchor = new THREE.Object3D();
  muzzleAnchor.position.set(0.00, 0.00, -1.63);
  g.add(muzzleAnchor);

  // Ejector anchor (right side of receiver)
  const ejectorAnchor = new THREE.Object3D();
  ejectorAnchor.position.set(0.09, 0.06, -0.42);
  g.add(ejectorAnchor);

  launchWeaponRedrawAgent({
    group: g,
    steel,
    polymer
  });

  G.weapon.group = g;
  G.weapon.muzzle = muzzleAnchor;
  G.weapon.ejector = ejectorAnchor;
  // Track materials we can tint when buffs are active
  G.weapon.materials = [steel, polymer, tan];

  G.camera.add(g);
  g.scale.setScalar(1.55);

  // Store as slot 0 (rifle)
  G.weaponSlots[0] = {
    group: g,
    muzzle: muzzleAnchor,
    ejector: ejectorAnchor,
    materials: [steel, polymer, tan],
    ammo: CFG.gun.magSize,
    reserve: Infinity
  };

  G.weapon.group = g;
  G.weapon.muzzle = muzzleAnchor;
  G.weapon.ejector = ejectorAnchor;
  G.weapon.ammo = CFG.gun.magSize;
  G.weapon.reserve = Infinity;

  updateWeaponAnchor();

  // Build shotgun and store as slot 1
  setupShotgun();
  // Build sniper and store as slot 2
  setupSniper();
}

function setupShotgun() {
  const makeVM = (color, metal = 0.4, rough = 0.6) => {
    const m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
    m.fog = false;
    m.depthTest = false;
    return m;
  };

  const darkSteel = makeVM(0x1e2024, 0.85, 0.30);
  const wood = makeVM(0x5a3d20, 0.15, 0.75);
  const chrome = makeVM(0x8a8e94, 0.9, 0.2);

  const g = new THREE.Group();
  g.renderOrder = 10;
  g.castShadow = false;
  g.receiveShadow = false;

  // Receiver (chunkier than rifle)
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.20, 0.38), darkSteel);
  receiver.position.set(0.00, 0.00, -0.40);
  g.add(receiver);

  // Barrel (wider bore)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.65, 12), darkSteel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.00, 0.03, -0.95);
  g.add(barrel);

  // Tube magazine (under barrel)
  const tubeMag = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.45, 10), darkSteel);
  tubeMag.rotation.x = Math.PI / 2;
  tubeMag.position.set(0.00, -0.04, -0.82);
  g.add(tubeMag);

  // Pump grip (slide)
  const pump = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.10, 0.16), wood);
  pump.position.set(0.00, -0.02, -0.75);
  g.add(pump);

  // Stock
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.17, 0.36), wood);
  stock.position.set(-0.01, 0.01, 0.02);
  g.add(stock);

  // Butt pad
  const butt = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.04), makeVM(0x111111, 0.1, 0.9));
  butt.position.set(-0.01, 0.01, 0.22);
  g.add(butt);

  // Grip
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.20, 0.08), wood);
  grip.position.set(-0.04, -0.16, -0.25);
  grip.rotation.x = -0.55;
  g.add(grip);

  // Trigger guard
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.12), chrome);
  guard.position.set(0.00, -0.12, -0.34);
  g.add(guard);

  // Muzzle
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.06, 10), darkSteel);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0.00, 0.03, -1.30);
  g.add(muzzle);

  // Front sight
  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.02), chrome);
  frontSight.position.set(0.00, 0.09, -1.26);
  g.add(frontSight);

  const muzzleAnchor = new THREE.Object3D();
  muzzleAnchor.position.set(0.00, 0.03, -1.35);
  g.add(muzzleAnchor);

  const ejectorAnchor = new THREE.Object3D();
  ejectorAnchor.position.set(0.09, 0.08, -0.40);
  g.add(ejectorAnchor);

  G.camera.add(g);
  g.scale.setScalar(1.55);
  g.visible = false; // hidden by default (rifle is default)

  // Position it like the rifle
  g.position.copy(computeWeaponBasePos());

  G.weaponSlots[1] = {
    group: g,
    muzzle: muzzleAnchor,
    ejector: ejectorAnchor,
    materials: [darkSteel, wood, chrome],
    ammo: CFG.shotgun.magSize,
    reserve: Infinity
  };
}

function setupSniper() {
  const makeVM = (color, metal = 0.4, rough = 0.6) => {
    const m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
    m.fog = false;
    m.depthTest = false;
    return m;
  };

  const gunmetal = makeVM(0x1a1d22, 0.9, 0.25);
  const polymer = makeVM(0x2a2e33, 0.3, 0.7);
  const chrome = makeVM(0x8a8e94, 0.9, 0.2);

  const g = new THREE.Group();
  g.renderOrder = 10;
  g.castShadow = false;
  g.receiveShadow = false;

  // Long barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.0, 10), gunmetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.00, 0.03, -1.1);
  g.add(barrel);

  // Receiver (slim)
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 0.42), gunmetal);
  receiver.position.set(0.00, 0.00, -0.40);
  g.add(receiver);

  // Scope (two rings + tube)
  const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.30, 10), polymer);
  scopeTube.rotation.x = Math.PI / 2;
  scopeTube.position.set(0.00, 0.14, -0.50);
  g.add(scopeTube);

  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 12), chrome);
  ring1.position.set(0.00, 0.14, -0.38);
  g.add(ring1);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 12), chrome);
  ring2.position.set(0.00, 0.14, -0.62);
  g.add(ring2);

  // Scope lens tint
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.022, 12),
    new THREE.MeshBasicMaterial({ color: 0x3366ff, transparent: true, opacity: 0.4, depthTest: false })
  );
  lens.position.set(0.00, 0.14, -0.65);
  g.add(lens);

  // Stock (long, slim)
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.44), polymer);
  stock.position.set(-0.01, 0.00, 0.05);
  g.add(stock);

  // Butt pad
  const butt = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 0.04), makeVM(0x111111, 0.1, 0.9));
  butt.position.set(-0.01, 0.00, 0.29);
  g.add(butt);

  // Pistol grip
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.06), polymer);
  grip.position.set(-0.03, -0.14, -0.22);
  grip.rotation.x = -0.6;
  g.add(grip);

  // Bipod legs (folded back)
  const legMat = makeVM(0x444444, 0.5, 0.5);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 6), legMat);
    leg.position.set(side * 0.06, -0.04, -0.90);
    leg.rotation.x = -0.3;
    g.add(leg);
  }

  // Muzzle brake
  const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.06, 10), chrome);
  brake.rotation.x = Math.PI / 2;
  brake.position.set(0.00, 0.03, -1.64);
  g.add(brake);

  // Trigger guard
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.08), chrome);
  guard.position.set(0.00, -0.10, -0.32);
  g.add(guard);

  const muzzleAnchor = new THREE.Object3D();
  muzzleAnchor.position.set(0.00, 0.03, -1.70);
  g.add(muzzleAnchor);

  const ejectorAnchor = new THREE.Object3D();
  ejectorAnchor.position.set(0.09, 0.06, -0.36);
  g.add(ejectorAnchor);

  G.camera.add(g);
  g.scale.setScalar(1.55);
  g.visible = false;
  g.position.copy(computeWeaponBasePos());

  G.weaponSlots[2] = {
    group: g,
    muzzle: muzzleAnchor,
    ejector: ejectorAnchor,
    materials: [gunmetal, polymer, chrome],
    ammo: CFG.sniper.magSize,
    reserve: Infinity
  };
}

export function switchWeapon(slot) {
  if (slot === G.activeWeaponSlot) return;
  if (G.switching) return;
  if (G.weapon.reloading) return;

  // Save current weapon ammo
  const curSlot = G.weaponSlots[G.activeWeaponSlot];
  if (curSlot) {
    curSlot.ammo = G.weapon.ammo;
    curSlot.reserve = G.weapon.reserve;
  }

  // Hide current
  if (curSlot && curSlot.group) curSlot.group.visible = false;

  // Switch
  G.activeWeaponSlot = slot;
  const newSlot = G.weaponSlots[slot];
  if (!newSlot) return;

  // Show new
  newSlot.group.visible = true;
  G.weapon.group = newSlot.group;
  G.weapon.muzzle = newSlot.muzzle;
  G.weapon.ejector = newSlot.ejector;
  G.weapon.materials = newSlot.materials;
  G.weapon.ammo = newSlot.ammo;
  G.weapon.reserve = newSlot.reserve;
  G.weapon.reloading = false;
  G.weapon.reloadTimer = 0;
  G.weapon.spread = activeWeaponConfig().spreadMin || activeWeaponConfig().bloom || 0;

  updateWeaponAnchor();
  updateHUD();
}

export function beginReload() {
  if (G.weapon.reloading) return;
  if (G.weapon.infiniteAmmoTimer > 0) return;
  const wCfg = activeWeaponConfig();
  if (G.weapon.ammo >= wCfg.magSize) return;
  G.weapon.reloading = true;
  G.weapon.reloadTimer = wCfg.reloadTime;
  if (CFG.audio.reloadStart) playReloadStart();
}

export function updateWeapon(delta) {
  if (!G.weapon.group) return;
  const wCfg = activeWeaponConfig();

  const moving = G.input.w || G.input.a || G.input.s || G.input.d;
  const sprinting = moving && G.input.sprint;
  const crouching = !!G.input.crouch;
  // Reduce sway/bob intensity and slightly lower frequencies
  G.weapon.swayT += delta * (sprinting ? 9 : (moving ? 7 : 2.5));
  let bobAmp = sprinting ? 0.008 : (moving ? 0.006 : 0.0035);
  let swayAmp = sprinting ? 0.0045 : (moving ? 0.0035 : 0.002);
  if (crouching) { bobAmp *= 0.7; swayAmp *= 0.7; }

  const bobX = Math.sin(G.weapon.swayT * 1.8) * bobAmp;
  const bobY = Math.cos(G.weapon.swayT * 3.6) * bobAmp * 0.6;
  const swayZRot = Math.sin(G.weapon.swayT * 1.4) * swayAmp;

  G.weapon.recoil = Math.max(0, G.weapon.recoil - (wCfg.recoilKick > 0.1 ? 12 : CFG.gun.recoilRecover) * delta);

  // ----- Dynamic spread update -----
  const base = wCfg.spreadMin ?? wCfg.bloom ?? 0;
  const moveMult = moving ? (sprinting ? (wCfg.spreadSprintMult || 1) : (wCfg.spreadMoveMult || 1)) : 1;
  const airMult = G.player.grounded ? 1 : (wCfg.spreadAirMult || 1);
  const crouchMult = crouching ? (wCfg.spreadCrouchMult || 1) : 1;
  const target = Math.min(wCfg.spreadMax || 0.02, base * moveMult * airMult * crouchMult);
  G.weapon.targetSpread = target;
  const decay = wCfg.spreadDecay || 6.0;
  // Exponential approach to target
  const k = 1 - Math.exp(-decay * delta);
  G.weapon.spread += (target - G.weapon.spread) * k;

  let reloadTilt = 0;
  if (G.weapon.reloading && G.weapon.infiniteAmmoTimer <= 0) {
    G.weapon.reloadTimer -= delta;
    reloadTilt = 0.4 * Math.sin(Math.min(1, 1 - G.weapon.reloadTimer / wCfg.reloadTime) * Math.PI);
    if (G.weapon.reloadTimer <= 0) {
      const needed = wCfg.magSize - G.weapon.ammo;
      if (G.weapon.reserve === Infinity) {
        G.weapon.ammo += needed;
      } else {
        const taken = Math.min(needed, G.weapon.reserve);
        G.weapon.ammo += taken;
        G.weapon.reserve -= taken;
      }
      G.weapon.reloading = false;
      if (CFG.audio.reloadEnd) playReloadEnd();
      updateHUD();
    }
  }

  G.weapon.group.position.set(
    G.weapon.basePos.x + bobX,
    G.weapon.basePos.y + bobY,
    G.weapon.basePos.z - G.weapon.recoil
  );

  // Aim barrel at crosshair
  const muzzleWorld = G.tmpV1;
  G.weapon.muzzle.getWorldPosition(muzzleWorld);
  const muzzleCam = G.tmpV2.copy(muzzleWorld);
  G.camera.worldToLocal(muzzleCam);

  const aimPointCam = G.tmpV3.set(0, 0, -10);
  const aimDirCam = aimPointCam.sub(muzzleCam).normalize();

  // Reuse quaternions to reduce GC
  const FWD = G.tmpFwd || (G.tmpFwd = new THREE.Vector3(0, 0, -1));
  const QAIM = G.tmpQAim || (G.tmpQAim = new THREE.Quaternion());
  const QROLL = G.tmpQRoll || (G.tmpQRoll = new THREE.Quaternion());
  const QREL = G.tmpQRel || (G.tmpQRel = new THREE.Quaternion());

  QAIM.setFromUnitVectors(FWD, aimDirCam);
  const styleRoll = THREE.MathUtils.degToRad(-3);
  QROLL.setFromAxisAngle(FWD, swayZRot + styleRoll + reloadTilt);
  QREL.setFromAxisAngle(new THREE.Vector3(1, 0, 0), reloadTilt * 0.2);

  G.weapon.group.quaternion.copy(QAIM).multiply(QROLL).multiply(QREL);

  // ----- Apply view recoil to camera (non-destructive) -----
  // Smoothly return view kick to zero
  const ret = wCfg.viewReturn || 9.0;
  const rk = 1 - Math.exp(-ret * delta);
  G.weapon.viewPitch -= G.weapon.viewPitch * rk;
  G.weapon.viewYaw -= G.weapon.viewYaw * rk;

  // Apply the delta since last frame to the camera so it cancels on return
  const dPitch = G.weapon.viewPitch - G.weapon.appliedPitch;
  const dYaw = G.weapon.viewYaw - G.weapon.appliedYaw;
  // Pitch up (negative X rotation) feels like CS, invert sign accordingly
  G.camera.rotation.x -= dPitch;
  G.camera.rotation.y += dYaw;
  G.weapon.appliedPitch = G.weapon.viewPitch;
  G.weapon.appliedYaw = G.weapon.viewYaw;

  // ----- Temporary fire-rate buff -----
  if (G.weapon.rofBuffTimer > 0) {
    G.weapon.rofBuffTimer -= delta;
    if (G.weapon.rofBuffTimer <= 0) {
      G.weapon.rofBuffTimer = 0;
      G.weapon.rofMult = 1;
    }
  }

  // ----- Infinite ammo buff timer and restore -----
  if (G.weapon.infiniteAmmoTimer > 0) {
    G.weapon.infiniteAmmoTimer -= delta;
    if (G.weapon.infiniteAmmoTimer <= 0) {
      G.weapon.infiniteAmmoTimer = 0;
      // Restore original ammo/reserve values if saved
      if (G.weapon.ammoBeforeInf != null) {
        G.weapon.ammo = G.weapon.ammoBeforeInf;
        G.weapon.ammoBeforeInf = null;
      }
      if (G.weapon.reserveBeforeInf != null) {
        G.weapon.reserve = G.weapon.reserveBeforeInf;
        G.weapon.reserveBeforeInf = null;
      }
      updateHUD();
    }
  }

  // ----- Weapon glow while buffs are active -----
  const active = (G.weapon.rofBuffTimer > 0) || (G.weapon.infiniteAmmoTimer > 0);
  // Pulse emissive when active (subtle), color depends on buff
  const mats = G.weapon.materials || [];
  if (active) {
    G.weapon.glowT += delta * 3.0;
    const pulse = 0.6 + Math.sin(G.weapon.glowT) * 0.4; // 0.2..1.0
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m || !m.isMaterial) continue;
      // Indigo for infinite ammo, yellow for accelerator
      const color = (G.weapon.infiniteAmmoTimer > 0) ? 0x6366f1 : 0xffd84d;
      if (m.emissive) m.emissive.setHex(color);
      if ('emissiveIntensity' in m) m.emissiveIntensity = 0.8 + pulse * 0.6;
    }
  } else {
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m || !m.isMaterial) continue;
      if (m.emissive) m.emissive.setHex(0x000000);
      if ('emissiveIntensity' in m) m.emissiveIntensity = 1.0;
    }
  }
}

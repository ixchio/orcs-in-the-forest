import * as THREE from 'three';

// Shared detail materials used by redraw sub-agents.
const DETAIL_MAT = {
  bone: new THREE.MeshStandardMaterial({ color: 0xe4dcc7, roughness: 0.88, metalness: 0.04 }),
  leatherDark: new THREE.MeshStandardMaterial({ color: 0x372214, roughness: 0.9, metalness: 0.02 }),
  leatherWarm: new THREE.MeshStandardMaterial({ color: 0x6d4524, roughness: 0.86, metalness: 0.02 }),
  clothDark: new THREE.MeshStandardMaterial({ color: 0x2c1712, roughness: 0.94, metalness: 0.0 }),
  furLight: new THREE.MeshStandardMaterial({ color: 0xddd5c6, roughness: 0.98, metalness: 0.0, flatShading: true }),
  ember: new THREE.MeshStandardMaterial({
    color: 0xff8454, emissive: 0xff4a1f, emissiveIntensity: 1.1, roughness: 0.35, metalness: 0.08
  }),
  rune: new THREE.MeshStandardMaterial({
    color: 0x99ddff, emissive: 0x3fa7ff, emissiveIntensity: 0.85, roughness: 0.32, metalness: 0.12
  }),
  stoneDark: new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.95, metalness: 0.02, flatShading: true }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x171a1f, roughness: 0.62, metalness: 0.32 })
};

function detailMesh(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

function applyOrcRedraw(ctx) {
  const { enemyGroup, head, armL, armR, legL, legR, bowGroup } = ctx;
  if (!enemyGroup || !head || !armL || !armR || !legL || !legR || !bowGroup) return;

  const faceMat = head.material;

  // Snout + tusks for a stronger orc silhouette.
  const snout = detailMesh(new THREE.BoxGeometry(0.20, 0.14, 0.16), faceMat);
  snout.position.set(0, -0.05, -0.22);
  head.add(snout);

  const tuskGeo = new THREE.ConeGeometry(0.028, 0.16, 10);
  for (const sign of [-1, 1]) {
    const tusk = detailMesh(tuskGeo, DETAIL_MAT.bone);
    tusk.position.set(sign * 0.10, -0.13, -0.25);
    tusk.rotation.x = Math.PI * 0.58;
    tusk.rotation.z = sign * -0.34;
    head.add(tusk);
  }

  const brow = detailMesh(new THREE.BoxGeometry(0.36, 0.05, 0.08), DETAIL_MAT.clothDark);
  brow.position.set(0, 0.08, -0.20);
  head.add(brow);

  // Wrist wraps and boots.
  const bracerGeo = new THREE.BoxGeometry(0.22, 0.08, 0.22);
  for (const arm of [armL, armR]) {
    const bracer = detailMesh(bracerGeo, DETAIL_MAT.leatherDark);
    bracer.position.set(0, -0.24, 0);
    arm.add(bracer);
  }

  const bootGeo = new THREE.BoxGeometry(0.30, 0.16, 0.32);
  for (const leg of [legL, legR]) {
    const boot = detailMesh(bootGeo, DETAIL_MAT.leatherDark);
    boot.position.set(0, -0.36, 0.03);
    leg.add(boot);
  }

  // Quiver on back with simple arrow shafts.
  const quiver = detailMesh(new THREE.CylinderGeometry(0.09, 0.11, 0.44, 12), DETAIL_MAT.leatherWarm);
  quiver.position.set(0.24, 1.33, 0.27);
  quiver.rotation.set(0.32, 0.08, -0.20);
  enemyGroup.add(quiver);

  const shaftGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.34, 8);
  for (let i = 0; i < 3; i++) {
    const shaft = detailMesh(shaftGeo, DETAIL_MAT.bone);
    shaft.position.set(0.21 + i * 0.02, 1.60 + i * 0.02, 0.35 + i * 0.01);
    shaft.rotation.set(0.48, -0.12, -0.12);
    enemyGroup.add(shaft);
  }

  // Bow grip and horn tips.
  const grip = detailMesh(new THREE.BoxGeometry(0.05, 0.16, 0.06), DETAIL_MAT.leatherDark);
  grip.position.set(0, 0, 0);
  bowGroup.add(grip);

  const tipGeo = new THREE.CylinderGeometry(0.014, 0.02, 0.16, 8);
  for (const sign of [-1, 1]) {
    const tip = detailMesh(tipGeo, DETAIL_MAT.bone);
    tip.position.set(0, sign * 0.38, 0);
    tip.rotation.x = Math.PI * 0.5;
    tip.rotation.y = sign * 0.2;
    bowGroup.add(tip);
  }
}

function applyShamanRedraw(ctx) {
  const { enemyGroup, torso, armL, armR, staffGroup } = ctx;
  if (!enemyGroup || !torso || !armL || !armR || !staffGroup) return;

  const mantle = detailMesh(new THREE.TorusGeometry(0.38, 0.07, 10, 22), DETAIL_MAT.clothDark);
  mantle.rotation.x = Math.PI * 0.5;
  mantle.position.set(0, 1.62, 0.01);
  enemyGroup.add(mantle);

  const sash = detailMesh(new THREE.TorusGeometry(0.31, 0.035, 8, 20), DETAIL_MAT.leatherWarm);
  sash.rotation.x = Math.PI * 0.5;
  sash.position.set(0, 1.03, 0);
  enemyGroup.add(sash);

  const runeMedallion = detailMesh(new THREE.OctahedronGeometry(0.085, 0), DETAIL_MAT.ember);
  runeMedallion.position.set(0, 1.10, -0.25);
  torso.add(runeMedallion);

  const cuffGeo = new THREE.BoxGeometry(0.22, 0.09, 0.22);
  for (const arm of [armL, armR]) {
    const cuff = detailMesh(cuffGeo, DETAIL_MAT.clothDark);
    cuff.position.set(0, -0.24, 0);
    arm.add(cuff);
  }

  const ring = detailMesh(new THREE.TorusGeometry(0.20, 0.015, 8, 18), DETAIL_MAT.rune);
  ring.rotation.x = Math.PI * 0.5;
  ring.position.set(0, 0.96, 0);
  staffGroup.add(ring);

  const shardGeo = new THREE.TetrahedronGeometry(0.055, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const shard = detailMesh(shardGeo, DETAIL_MAT.ember);
    shard.position.set(Math.cos(a) * 0.11, 0.95 + ((i % 2) * 0.03), Math.sin(a) * 0.11);
    shard.rotation.set(i * 0.4, a, i * 0.2);
    staffGroup.add(shard);
  }
}

function applyWolfRedraw(ctx) {
  const { body, tailPivot, legs } = ctx;
  if (!body || !tailPivot || !legs) return;

  const bodyGeo = body.geometry?.parameters || {};
  const bodyH = bodyGeo.height ?? 2.5;
  const bodyD = bodyGeo.depth ?? 7.0;

  const shoulder = detailMesh(new THREE.BoxGeometry(3.2, 0.55, 2.4), DETAIL_MAT.stoneDark);
  shoulder.position.set(0, bodyH * 0.5 + 0.22, bodyD * 0.20);
  body.add(shoulder);

  const hip = detailMesh(new THREE.BoxGeometry(2.8, 0.5, 2.2), DETAIL_MAT.stoneDark);
  hip.position.set(0, bodyH * 0.45, -bodyD * 0.24);
  body.add(hip);

  const chestTuft = detailMesh(new THREE.BoxGeometry(1.8, 1.1, 0.55), DETAIL_MAT.furLight);
  chestTuft.position.set(0, -0.15, bodyD * 0.50);
  body.add(chestTuft);

  const tailSpikes = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const spike = detailMesh(new THREE.BoxGeometry(0.32, 0.24, 0.42), DETAIL_MAT.stoneDark);
    spike.position.set(0, 0.12 + i * 0.02, -0.56 - i * 0.46);
    tailSpikes.add(spike);
  }
  tailPivot.add(tailSpikes);

  const clawGeo = new THREE.BoxGeometry(0.16, 0.10, 0.28);
  const legList = [legs.FL, legs.FR, legs.RL, legs.RR].filter(Boolean);
  for (const leg of legList) {
    for (const sign of [-1, 1]) {
      const claw = detailMesh(clawGeo, DETAIL_MAT.bone);
      claw.position.set(sign * 0.22, -1.95, 0.62);
      leg.add(claw);
    }
  }
}

function applyGolemRedraw(ctx) {
  const { torso, leftArm, rightArm, leftLeg, rightLeg } = ctx;
  if (!torso || !leftArm || !rightArm || !leftLeg || !rightLeg) return;

  const bodyGeo = torso.geometry?.parameters || {};
  const bodyW = bodyGeo.width ?? 4.0;
  const bodyH = bodyGeo.height ?? 4.6;
  const bodyD = bodyGeo.depth ?? 2.2;

  const chestPlate = detailMesh(new THREE.BoxGeometry(1.65, 1.45, 0.26), DETAIL_MAT.stoneDark);
  chestPlate.position.set(0, 0.10, bodyD * 0.5 + 0.10);
  torso.add(chestPlate);

  const core = detailMesh(new THREE.OctahedronGeometry(0.36, 0), DETAIL_MAT.rune);
  core.position.set(0, 0.12, bodyD * 0.5 + 0.28);
  torso.add(core);

  for (const sign of [-1, 1]) {
    const shoulder = detailMesh(new THREE.BoxGeometry(1.35, 0.72, 1.75), DETAIL_MAT.stoneDark);
    shoulder.position.set(sign * (bodyW * 0.5 + 0.1), bodyH * 0.43, 0);
    torso.add(shoulder);
  }

  const armList = [leftArm.arm, rightArm.arm].filter(Boolean);
  for (const arm of armList) {
    const elbowBand = detailMesh(new THREE.BoxGeometry(1.10, 0.30, 1.10), DETAIL_MAT.stoneDark);
    elbowBand.position.set(0, -2.0, 0);
    arm.add(elbowBand);
  }

  const legList = [leftLeg.leg, rightLeg.leg].filter(Boolean);
  for (const leg of legList) {
    const knee = detailMesh(new THREE.BoxGeometry(0.95, 0.78, 0.24), DETAIL_MAT.stoneDark);
    knee.position.set(0, -0.35, 0.73);
    leg.add(knee);
  }
}

const CHARACTER_SUB_AGENTS = {
  orc: applyOrcRedraw,
  shaman: applyShamanRedraw,
  wolf: applyWolfRedraw,
  golem: applyGolemRedraw
};

export function launchCharacterRedrawAgent(type, context) {
  const subAgent = CHARACTER_SUB_AGENTS[type];
  if (!subAgent || !context) return;
  subAgent(context);
}

function makeWeaponDetail(material, geometry) {
  if (material?.isMaterial && !material.userData?.vmPrepared) {
    material.fog = false;
    material.depthTest = false;
    material.userData = { ...material.userData, vmPrepared: true };
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export function launchWeaponRedrawAgent(context) {
  const { group, steel, polymer } = context || {};
  if (!group || !steel || !polymer) return;
  if (group.userData?.redrawBySubAgent) return;

  group.userData = { ...group.userData, redrawBySubAgent: true };

  const upperRail = makeWeaponDetail(steel, new THREE.BoxGeometry(0.10, 0.04, 0.36));
  upperRail.position.set(0.0, 0.12, -0.50);
  group.add(upperRail);

  const rearSightBase = makeWeaponDetail(steel, new THREE.BoxGeometry(0.05, 0.04, 0.05));
  rearSightBase.position.set(0.0, 0.12, -0.28);
  group.add(rearSightBase);

  const rearSight = makeWeaponDetail(steel, new THREE.BoxGeometry(0.018, 0.03, 0.04));
  rearSight.position.set(0.0, 0.15, -0.28);
  group.add(rearSight);

  const ejectionPort = makeWeaponDetail(DETAIL_MAT.steelDark, new THREE.BoxGeometry(0.016, 0.042, 0.11));
  ejectionPort.position.set(0.067, 0.014, -0.42);
  group.add(ejectionPort);

  const chargingHandle = makeWeaponDetail(steel, new THREE.BoxGeometry(0.015, 0.018, 0.14));
  chargingHandle.position.set(-0.07, 0.05, -0.39);
  group.add(chargingHandle);

  const triggerGuard = makeWeaponDetail(steel, new THREE.TorusGeometry(0.045, 0.008, 7, 14, Math.PI));
  triggerGuard.rotation.x = Math.PI * 0.5;
  triggerGuard.position.set(-0.005, -0.11, -0.31);
  group.add(triggerGuard);

  const trigger = makeWeaponDetail(DETAIL_MAT.steelDark, new THREE.BoxGeometry(0.008, 0.04, 0.015));
  trigger.position.set(-0.005, -0.115, -0.315);
  group.add(trigger);

  // Handguard vent strips.
  for (let i = 0; i < 5; i++) {
    const z = -0.68 - i * 0.09;
    const ventL = makeWeaponDetail(DETAIL_MAT.steelDark, new THREE.BoxGeometry(0.010, 0.020, 0.045));
    const ventR = makeWeaponDetail(DETAIL_MAT.steelDark, new THREE.BoxGeometry(0.010, 0.020, 0.045));
    ventL.position.set(-0.055, -0.005, z);
    ventR.position.set(0.055, -0.005, z);
    group.add(ventL, ventR);
  }

  // Muzzle brake crown and ports.
  const brakeRing = makeWeaponDetail(steel, new THREE.CylinderGeometry(0.032, 0.032, 0.04, 10));
  brakeRing.rotation.x = Math.PI * 0.5;
  brakeRing.position.set(0.0, 0.0, -1.615);
  group.add(brakeRing);

  for (const sign of [-1, 1]) {
    const port = makeWeaponDetail(DETAIL_MAT.steelDark, new THREE.BoxGeometry(0.008, 0.012, 0.02));
    port.position.set(sign * 0.031, 0.0, -1.59);
    group.add(port);
  }

  const slingLoop = makeWeaponDetail(steel, new THREE.TorusGeometry(0.017, 0.004, 6, 10));
  slingLoop.rotation.x = Math.PI * 0.5;
  slingLoop.position.set(0.0, -0.03, 0.20);
  group.add(slingLoop);

  // Add subtle selector markings.
  const selectorDotA = makeWeaponDetail(polymer, new THREE.CircleGeometry(0.006, 8));
  selectorDotA.position.set(0.062, -0.03, -0.34);
  selectorDotA.rotation.y = -Math.PI * 0.5;
  selectorDotA.material.fog = false;
  selectorDotA.material.depthTest = false;
  group.add(selectorDotA);

  const selectorDotB = makeWeaponDetail(polymer, new THREE.CircleGeometry(0.006, 8));
  selectorDotB.position.set(0.062, -0.05, -0.34);
  selectorDotB.rotation.y = -Math.PI * 0.5;
  selectorDotB.material.fog = false;
  selectorDotB.material.depthTest = false;
  group.add(selectorDotB);
}

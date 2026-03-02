import * as THREE from 'three';
import { CFG } from './config.js';
import { G } from './globals.js';

// --- Shared materials, geometries, and wind uniforms for trees ---
// We keep these module-scoped so all trees can share them efficiently.
const FOLIAGE_WIND = { uTime: { value: 0 }, uStrength: { value: 0.35 } };

// Use simpler Lambert shading for mass content to reduce uniforms
const TRUNK_MAT = new THREE.MeshLambertMaterial({
  color: 0x6b4f32,
  emissive: 0x000000
});

// Foliage material with simple vertex sway, inspired by reference project
const FOLIAGE_MAT = new THREE.MeshLambertMaterial({
  color: 0x2f6b3d,
  emissive: 0x000000
});
FOLIAGE_MAT.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = FOLIAGE_WIND.uTime;
  shader.uniforms.uStrength = FOLIAGE_WIND.uStrength;
  shader.vertexShader = (
    'uniform float uTime;\n' +
    'uniform float uStrength;\n' +
    shader.vertexShader
  ).replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
     float sway = sin(uTime * 1.7 + position.y * 0.35) * 0.5 +
                  sin(uTime * 0.9 + position.y * 0.7) * 0.5;
     transformed.x += sway * uStrength * (0.4 + position.y * 0.06);
     transformed.z += cos(uTime * 1.1 + position.y * 0.42) * uStrength * (0.3 + position.y * 0.05);`
  );
};
FOLIAGE_MAT.needsUpdate = true;

// Reusable base geometries (scaled per-tree)
// Trunk: slight taper, height 10, translated so base at y=0
const GEO_TRUNK = new THREE.CylinderGeometry(0.7, 1.2, 10, 8, 1, false);
GEO_TRUNK.translate(0, 5, 0);

// Foliage stack (positions expect trunk height ~10)
const GEO_CONE1 = new THREE.ConeGeometry(6, 10, 8); GEO_CONE1.translate(0, 14, 0);
const GEO_CONE2 = new THREE.ConeGeometry(5, 9, 8); GEO_CONE2.translate(0, 20, 0);
const GEO_CONE3 = new THREE.ConeGeometry(4, 8, 8); GEO_CONE3.translate(0, 25, 0);
const GEO_SPH = new THREE.SphereGeometry(3.5, 8, 6); GEO_SPH.translate(0, 28.5, 0);

// Allow main loop to advance wind time
export function tickForest(timeSec) {
  FOLIAGE_WIND.uTime.value = timeSec;
  // Distance-based chunk culling for grass/flowers (cheap per-frame visibility)
  const cam = G.camera;
  if (!cam || !G.foliage) return;
  const px = cam.position.x;
  const pz = cam.position.z;
  const gv = CFG.foliage;
  const g2 = gv.grassViewDist * gv.grassViewDist;
  const f2 = gv.flowerViewDist * gv.flowerViewDist;
  const bView = (gv.bushViewDist ?? (gv.grassViewDist * 1.1));
  const rView = (gv.rockViewDist ?? (gv.grassViewDist * 1.2));
  const b2 = bView * bView;
  const r2 = rView * rView;
  for (let i = 0; i < G.foliage.grass.length; i++) {
    const m = G.foliage.grass[i];
    const dx = (m.position.x) - px;
    const dz = (m.position.z) - pz;
    m.visible = (dx * dx + dz * dz) <= g2;
  }
  for (let i = 0; i < G.foliage.flowers.length; i++) {
    const m = G.foliage.flowers[i];
    const dx = (m.position.x) - px;
    const dz = (m.position.z) - pz;
    m.visible = (dx * dx + dz * dz) <= f2;
  }
  if (G.foliage.bushes) {
    for (let i = 0; i < G.foliage.bushes.length; i++) {
      const m = G.foliage.bushes[i];
      const dx = (m.position.x) - px;
      const dz = (m.position.z) - pz;
      m.visible = (dx * dx + dz * dz) <= b2;
    }
  }
  if (G.foliage.rocks) {
    for (let i = 0; i < G.foliage.rocks.length; i++) {
      const m = G.foliage.rocks[i];
      const dx = (m.position.x) - px;
      const dz = (m.position.z) - pz;
      m.visible = (dx * dx + dz * dz) <= r2;
    }
  }
}

// --- Ground cover (grass, flowers, bushes, rocks) ---
// Triangle grass defaults tuned for dense fields with console-panel control.
const DEFAULT_GRASS_DENSITY_MULT = 6.0;
const DEFAULT_GRASS_SETTINGS = Object.freeze({
  densityMult: DEFAULT_GRASS_DENSITY_MULT,
  baseYOffset: -0.01,
  randomTilt: 0.10,
  bladeBaseWidth: 0.07,
  bladeBaseHeight: 0.62,
  bladeMinScale: 0.95,
  bladeMaxScale: 1.45,
  rootWidth: 0.65,
  tipWidth: 0.10,
  bendBase: 0.16,
  bendWindMult: 0.55,
  leanJitter: 0.22,
  swayPushX: 0.28,
  swayPushZ: 0.22,
  tipNoiseBase: 0.02,
  tipNoiseMult: 0.03,
  phaseScaleX: 0.047,
  phaseScaleZ: 0.041,
  gustFreqA: 1.6,
  gustFreqB: 0.85,
  gustAmpA: 0.65,
  gustAmpB: 0.35,
  hueMin: 0.26,
  hueMax: 0.34,
  satMin: 0.46,
  satMax: 0.72,
  lightMin: 0.26,
  lightMax: 0.42
});

function toNum(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getGrassSettings() {
  const g = CFG.foliage?.grass || {};
  const densitySrc = (g.densityMult != null) ? g.densityMult : CFG.foliage?.grassDensityMult;
  const densityMult = THREE.MathUtils.clamp(toNum(densitySrc, DEFAULT_GRASS_SETTINGS.densityMult), 0.5, 12.0);
  const baseYOffset = THREE.MathUtils.clamp(toNum(g.baseYOffset, DEFAULT_GRASS_SETTINGS.baseYOffset), -0.20, 0.20);
  const randomTilt = THREE.MathUtils.clamp(toNum(g.randomTilt, DEFAULT_GRASS_SETTINGS.randomTilt), 0.0, 0.35);
  const bladeBaseWidth = THREE.MathUtils.clamp(toNum(g.bladeBaseWidth, DEFAULT_GRASS_SETTINGS.bladeBaseWidth), 0.03, 0.40);
  const bladeBaseHeight = THREE.MathUtils.clamp(toNum(g.bladeBaseHeight, DEFAULT_GRASS_SETTINGS.bladeBaseHeight), 0.15, 1.6);
  const bladeMinScale = THREE.MathUtils.clamp(toNum(g.bladeMinScale, DEFAULT_GRASS_SETTINGS.bladeMinScale), 0.2, 3.0);
  const bladeMaxScaleRaw = THREE.MathUtils.clamp(toNum(g.bladeMaxScale, DEFAULT_GRASS_SETTINGS.bladeMaxScale), 0.2, 3.2);
  const bladeMaxScale = Math.max(bladeMinScale + 0.01, bladeMaxScaleRaw);
  const rootWidth = THREE.MathUtils.clamp(toNum(g.rootWidth, DEFAULT_GRASS_SETTINGS.rootWidth), 0.1, 1.6);
  const tipWidth = THREE.MathUtils.clamp(toNum(g.tipWidth, DEFAULT_GRASS_SETTINGS.tipWidth), 0.01, 0.8);
  const bendBase = THREE.MathUtils.clamp(toNum(g.bendBase, DEFAULT_GRASS_SETTINGS.bendBase), 0.0, 1.5);
  const bendWindMult = THREE.MathUtils.clamp(toNum(g.bendWindMult, DEFAULT_GRASS_SETTINGS.bendWindMult), 0.0, 2.0);
  const leanJitter = THREE.MathUtils.clamp(toNum(g.leanJitter, DEFAULT_GRASS_SETTINGS.leanJitter), 0.0, 1.0);
  const swayPushX = THREE.MathUtils.clamp(toNum(g.swayPushX, DEFAULT_GRASS_SETTINGS.swayPushX), 0.0, 1.2);
  const swayPushZ = THREE.MathUtils.clamp(toNum(g.swayPushZ, DEFAULT_GRASS_SETTINGS.swayPushZ), 0.0, 1.2);
  const tipNoiseBase = THREE.MathUtils.clamp(toNum(g.tipNoiseBase, DEFAULT_GRASS_SETTINGS.tipNoiseBase), 0.0, 0.3);
  const tipNoiseMult = THREE.MathUtils.clamp(toNum(g.tipNoiseMult, DEFAULT_GRASS_SETTINGS.tipNoiseMult), 0.0, 0.4);
  const phaseScaleX = THREE.MathUtils.clamp(toNum(g.phaseScaleX, DEFAULT_GRASS_SETTINGS.phaseScaleX), 0.001, 0.25);
  const phaseScaleZ = THREE.MathUtils.clamp(toNum(g.phaseScaleZ, DEFAULT_GRASS_SETTINGS.phaseScaleZ), 0.001, 0.25);
  const gustFreqA = THREE.MathUtils.clamp(toNum(g.gustFreqA, DEFAULT_GRASS_SETTINGS.gustFreqA), 0.1, 6.0);
  const gustFreqB = THREE.MathUtils.clamp(toNum(g.gustFreqB, DEFAULT_GRASS_SETTINGS.gustFreqB), 0.1, 6.0);
  const gustAmpA = THREE.MathUtils.clamp(toNum(g.gustAmpA, DEFAULT_GRASS_SETTINGS.gustAmpA), 0.0, 2.0);
  const gustAmpB = THREE.MathUtils.clamp(toNum(g.gustAmpB, DEFAULT_GRASS_SETTINGS.gustAmpB), 0.0, 2.0);
  let hueMin = THREE.MathUtils.clamp(toNum(g.hueMin, DEFAULT_GRASS_SETTINGS.hueMin), 0.0, 1.0);
  let hueMax = THREE.MathUtils.clamp(toNum(g.hueMax, DEFAULT_GRASS_SETTINGS.hueMax), 0.0, 1.0);
  if (hueMax < hueMin) { const t = hueMin; hueMin = hueMax; hueMax = t; }
  let satMin = THREE.MathUtils.clamp(toNum(g.satMin, DEFAULT_GRASS_SETTINGS.satMin), 0.0, 1.0);
  let satMax = THREE.MathUtils.clamp(toNum(g.satMax, DEFAULT_GRASS_SETTINGS.satMax), 0.0, 1.0);
  if (satMax < satMin) { const t = satMin; satMin = satMax; satMax = t; }
  let lightMin = THREE.MathUtils.clamp(toNum(g.lightMin, DEFAULT_GRASS_SETTINGS.lightMin), 0.0, 1.0);
  let lightMax = THREE.MathUtils.clamp(toNum(g.lightMax, DEFAULT_GRASS_SETTINGS.lightMax), 0.0, 1.0);
  if (lightMax < lightMin) { const t = lightMin; lightMin = lightMax; lightMax = t; }
  return {
    densityMult,
    baseYOffset,
    randomTilt,
    bladeBaseWidth,
    bladeBaseHeight,
    bladeMinScale,
    bladeMaxScale,
    rootWidth,
    tipWidth,
    bendBase,
    bendWindMult,
    leanJitter,
    swayPushX,
    swayPushZ,
    tipNoiseBase,
    tipNoiseMult,
    phaseScaleX,
    phaseScaleZ,
    gustFreqA,
    gustFreqB,
    gustAmpA,
    gustAmpB,
    hueMin,
    hueMax,
    satMin,
    satMax,
    lightMin,
    lightMax
  };
}

const GRASS_SHADER = {
  uRootWidth: { value: DEFAULT_GRASS_SETTINGS.rootWidth },
  uTipWidth: { value: DEFAULT_GRASS_SETTINGS.tipWidth },
  uBendBase: { value: DEFAULT_GRASS_SETTINGS.bendBase },
  uBendWindMult: { value: DEFAULT_GRASS_SETTINGS.bendWindMult },
  uLeanJitter: { value: DEFAULT_GRASS_SETTINGS.leanJitter },
  uSwayPushX: { value: DEFAULT_GRASS_SETTINGS.swayPushX },
  uSwayPushZ: { value: DEFAULT_GRASS_SETTINGS.swayPushZ },
  uTipNoiseBase: { value: DEFAULT_GRASS_SETTINGS.tipNoiseBase },
  uTipNoiseMult: { value: DEFAULT_GRASS_SETTINGS.tipNoiseMult },
  uPhaseScaleX: { value: DEFAULT_GRASS_SETTINGS.phaseScaleX },
  uPhaseScaleZ: { value: DEFAULT_GRASS_SETTINGS.phaseScaleZ },
  uGustFreqA: { value: DEFAULT_GRASS_SETTINGS.gustFreqA },
  uGustFreqB: { value: DEFAULT_GRASS_SETTINGS.gustFreqB },
  uGustAmpA: { value: DEFAULT_GRASS_SETTINGS.gustAmpA },
  uGustAmpB: { value: DEFAULT_GRASS_SETTINGS.gustAmpB }
};

function syncGrassShaderSettings(gs) {
  GRASS_SHADER.uRootWidth.value = gs.rootWidth;
  GRASS_SHADER.uTipWidth.value = gs.tipWidth;
  GRASS_SHADER.uBendBase.value = gs.bendBase;
  GRASS_SHADER.uBendWindMult.value = gs.bendWindMult;
  GRASS_SHADER.uLeanJitter.value = gs.leanJitter;
  GRASS_SHADER.uSwayPushX.value = gs.swayPushX;
  GRASS_SHADER.uSwayPushZ.value = gs.swayPushZ;
  GRASS_SHADER.uTipNoiseBase.value = gs.tipNoiseBase;
  GRASS_SHADER.uTipNoiseMult.value = gs.tipNoiseMult;
  GRASS_SHADER.uPhaseScaleX.value = gs.phaseScaleX;
  GRASS_SHADER.uPhaseScaleZ.value = gs.phaseScaleZ;
  GRASS_SHADER.uGustFreqA.value = gs.gustFreqA;
  GRASS_SHADER.uGustFreqB.value = gs.gustFreqB;
  GRASS_SHADER.uGustAmpA.value = gs.gustAmpA;
  GRASS_SHADER.uGustAmpB.value = gs.gustAmpB;
}

// Shared materials
const GRASS_MAT = new THREE.MeshLambertMaterial({
  color: 0xffffff,
  vertexColors: true,
  side: THREE.DoubleSide
});
GRASS_MAT.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = FOLIAGE_WIND.uTime;
  shader.uniforms.uStrength = FOLIAGE_WIND.uStrength;
  shader.uniforms.uRootWidth = GRASS_SHADER.uRootWidth;
  shader.uniforms.uTipWidth = GRASS_SHADER.uTipWidth;
  shader.uniforms.uBendBase = GRASS_SHADER.uBendBase;
  shader.uniforms.uBendWindMult = GRASS_SHADER.uBendWindMult;
  shader.uniforms.uLeanJitter = GRASS_SHADER.uLeanJitter;
  shader.uniforms.uSwayPushX = GRASS_SHADER.uSwayPushX;
  shader.uniforms.uSwayPushZ = GRASS_SHADER.uSwayPushZ;
  shader.uniforms.uTipNoiseBase = GRASS_SHADER.uTipNoiseBase;
  shader.uniforms.uTipNoiseMult = GRASS_SHADER.uTipNoiseMult;
  shader.uniforms.uPhaseScaleX = GRASS_SHADER.uPhaseScaleX;
  shader.uniforms.uPhaseScaleZ = GRASS_SHADER.uPhaseScaleZ;
  shader.uniforms.uGustFreqA = GRASS_SHADER.uGustFreqA;
  shader.uniforms.uGustFreqB = GRASS_SHADER.uGustFreqB;
  shader.uniforms.uGustAmpA = GRASS_SHADER.uGustAmpA;
  shader.uniforms.uGustAmpB = GRASS_SHADER.uGustAmpB;
  shader.vertexShader = (
    'uniform float uTime;\n' +
    'uniform float uStrength;\n' +
    'uniform float uRootWidth;\n' +
    'uniform float uTipWidth;\n' +
    'uniform float uBendBase;\n' +
    'uniform float uBendWindMult;\n' +
    'uniform float uLeanJitter;\n' +
    'uniform float uSwayPushX;\n' +
    'uniform float uSwayPushZ;\n' +
    'uniform float uTipNoiseBase;\n' +
    'uniform float uTipNoiseMult;\n' +
    'uniform float uPhaseScaleX;\n' +
    'uniform float uPhaseScaleZ;\n' +
    'uniform float uGustFreqA;\n' +
    'uniform float uGustFreqB;\n' +
    'uniform float uGustAmpA;\n' +
    'uniform float uGustAmpB;\n' +
    'varying float vBladeH;\n' +
    shader.vertexShader
  ).replace(
    '#include <color_vertex>',
    `#include <color_vertex>
     vBladeH = uv.y;`
  ).replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
     #ifdef USE_INSTANCING
       vec3 localRoot = instanceMatrix[3].xyz;
       vec3 worldRoot = (modelMatrix * vec4(localRoot, 1.0)).xyz;
       float iRand = fract(sin(worldRoot.x*12.9898 + worldRoot.z*78.233) * 43758.5453);
     #else
       vec3 worldRoot = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
       float iRand = 0.5;
     #endif
     float h = clamp(uv.y, 0.0, 1.0);
     float narrow = mix(uRootWidth, uTipWidth, h);
     transformed.x *= narrow;
     float phase = dot(worldRoot.xz, vec2(uPhaseScaleX, uPhaseScaleZ));
     float gust = sin(uTime * uGustFreqA + phase + iRand * 6.2831) * uGustAmpA +
                  cos(uTime * uGustFreqB + phase * 1.7) * uGustAmpB;
     float bend = (uBendBase + uStrength * uBendWindMult) * h * h;
     float lean = (iRand - 0.5) * uLeanJitter;
     transformed.x += (gust * uSwayPushX + lean) * bend;
     transformed.z += (gust * uSwayPushZ) * bend + h * h * (uTipNoiseBase + iRand * uTipNoiseMult);`
  );
  shader.fragmentShader = (
    'varying float vBladeH;\n' +
    shader.fragmentShader
  ).replace(
    '#include <color_fragment>',
    `#include <color_fragment>
     diffuseColor.rgb *= mix(0.78, 1.22, pow(vBladeH, 0.9));`
  );
};
GRASS_MAT.needsUpdate = true;

const FLOWER_MAT = new THREE.MeshLambertMaterial({
  color: 0xffffff,
  vertexColors: true,
  side: THREE.DoubleSide
});
FLOWER_MAT.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = FOLIAGE_WIND.uTime;
  shader.uniforms.uStrength = FOLIAGE_WIND.uStrength;
  shader.vertexShader = (
    'uniform float uTime;\n' +
    'uniform float uStrength;\n' +
    shader.vertexShader
  ).replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
     #ifdef USE_INSTANCING
       float iRand = fract(sin(instanceMatrix[3].x*19.123 + instanceMatrix[3].z*47.321) * 15731.123);
     #else
       float iRand = 0.5;
     #endif
     float h = clamp(position.y, 0.0, 1.0);
     float sway = sin(uTime*2.6 + iRand*8.0);
     float bend = uStrength * h;
     transformed.x += sway * bend * 0.18;
     transformed.z += sway * bend * 0.14;`
  );
};
FLOWER_MAT.needsUpdate = true;

const BUSH_MAT = new THREE.MeshLambertMaterial({
  color: 0x2b6a37,
  flatShading: false
});

const ROCK_MAT = new THREE.MeshLambertMaterial({
  color: 0x7b7066,
  flatShading: true
});

// Base geometries (kept small, cloned per-chunk to inject bounding spheres)
function makeTriangleBladeGeometry(width = DEFAULT_GRASS_SETTINGS.bladeBaseWidth, height = DEFAULT_GRASS_SETTINGS.bladeBaseHeight) {
  const hw = width * 0.5;
  const h = height;
  const positions = [
    -hw, 0, 0,
    hw, 0, 0,
    0, h, 0
  ];
  const uvs = [
    0, 0,
    1, 0,
    0.5, 1
  ];
  const colors = [
    0.12, 0.30, 0.10,
    0.14, 0.32, 0.11,
    0.36, 0.72, 0.28
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function makeCrossBladeGeometry(width = 0.5, height = 1.2) {
  // Two crossed quads around Y axis
  const hw = width * 0.5;
  const h = height;
  const positions = [
    // quad A (X axis)
    -hw, 0, 0, hw, 0, 0, hw, h, 0,
    -hw, 0, 0, hw, h, 0, -hw, h, 0,
    // quad B (Z axis)
    0, 0, -hw, 0, 0, hw, 0, h, hw,
    0, 0, -hw, 0, h, hw, 0, h, -hw,
  ];
  const colors = [];
  for (let i = 0; i < 12; i++) {
    const y = positions[i * 3 + 1];
    const t = y / h; // 0 at base -> 1 at tip
    const r = THREE.MathUtils.lerp(0.13, 0.25, t);
    const g = THREE.MathUtils.lerp(0.28, 0.55, t);
    const b = THREE.MathUtils.lerp(0.12, 0.22, t);
    colors.push(r, g, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

const BASE_GEOM = {
  // Flowers/bushes/rocks are static base meshes.
  flower: makeCrossBladeGeometry(0.18, 0.32),
  bush: new THREE.SphereGeometry(0.8, 8, 6),
  rock: new THREE.IcosahedronGeometry(0.7, 0)
};

// Deterministic per-chunk RNG
function lcg(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (1664525 * s + 1013904223) >>> 0) / 4294967296;
}

export function clearGroundCover() {
  if (!G.foliage) {
    G.foliage = { grass: [], flowers: [], bushes: [], rocks: [] };
    return;
  }
  if (!Array.isArray(G.foliage.grass)) G.foliage.grass = [];
  if (!Array.isArray(G.foliage.flowers)) G.foliage.flowers = [];
  if (!Array.isArray(G.foliage.bushes)) G.foliage.bushes = [];
  if (!Array.isArray(G.foliage.rocks)) G.foliage.rocks = [];

  const groups = [G.foliage.grass, G.foliage.flowers, G.foliage.bushes, G.foliage.rocks];
  for (let gi = 0; gi < groups.length; gi++) {
    const arr = groups[gi];
    for (let i = 0; i < arr.length; i++) {
      const mesh = arr[i];
      if (!mesh) continue;
      if (G.scene) G.scene.remove(mesh);
      if (mesh.geometry && mesh.geometry.dispose) {
        try { mesh.geometry.dispose(); } catch (_) { }
      }
    }
    arr.length = 0;
  }
}

export function generateGroundCover() {
  const S = CFG.foliage;
  const grassSettings = getGrassSettings();
  // Keep legacy knob mirrored for compatibility with existing configs/tools.
  CFG.foliage.grassDensityMult = grassSettings.densityMult;
  FOLIAGE_WIND.uStrength.value = S.windStrength;
  syncGrassShaderSettings(grassSettings);

  const half = CFG.forestSize / 2;
  const chunk = Math.max(8, S.chunkSize | 0);
  const chunksX = Math.ceil(CFG.forestSize / chunk);
  const chunksZ = Math.ceil(CFG.forestSize / chunk);
  const halfChunk = chunk * 0.5;
  const grassBaseGeom = makeTriangleBladeGeometry(grassSettings.bladeBaseWidth, grassSettings.bladeBaseHeight);

  const seed = (CFG.seed | 0) ^ (S.seedOffset | 0);

  // Helper to set a safe bounding sphere for a chunk-sized instanced mesh
  function setChunkBounds(mesh) {
    const g = mesh.geometry;
    const r = Math.sqrt(halfChunk * halfChunk * 2 + 25); // generous Y span
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), r);
  }

  // Skip center clearing smoothly
  function densityAt(x, z) {
    const r = Math.hypot(x, z);
    const edge = CFG.clearRadius;
    const k = THREE.MathUtils.clamp((r - edge) / (edge * 1.2), 0, 1);
    return THREE.MathUtils.lerp(S.densityNearClear, 1, k);
  }

  // Reset old cover meshes before rebuilding.
  clearGroundCover();

  // Per-chunk generation
  for (let iz = 0; iz < chunksZ; iz++) {
    for (let ix = 0; ix < chunksX; ix++) {
      const cx = -half + ix * chunk + halfChunk;
      const cz = -half + iz * chunk + halfChunk;

      // Keep within world bounds
      if (Math.abs(cx) > half || Math.abs(cz) > half) continue;

      // Density scaler by clearing and macro noise for patchiness
      const den = densityAt(cx, cz);
      const patch = (fbm(cx, cz, 1 / 60, 3, 2, 0.5, seed) * 0.5 + 0.5);
      const grassBaseCount = Math.max(0, Math.round(S.grassPerChunk * den * (0.6 + 0.8 * patch)));
      const grassCount = Math.max(0, Math.round(grassBaseCount * grassSettings.densityMult));
      const flowerCount = Math.max(0, Math.round(S.flowersPerChunk * den * (0.6 + 0.8 * (1 - patch))));
      const bushesCount = Math.max(0, Math.round(S.bushesPerChunk * den * (0.7 + 0.6 * patch)));
      const rocksCount = Math.max(0, Math.round(S.rocksPerChunk * den * (0.7 + 0.6 * (1 - patch))));

      // No work for empty chunks
      if (!grassCount && !flowerCount && !bushesCount && !rocksCount) continue;

      const rng = lcg(((ix + 1) * 73856093) ^ ((iz + 1) * 19349663) ^ seed);

      // Grass
      if (grassCount > 0) {
        const geom = grassBaseGeom.clone();
        const mesh = new THREE.InstancedMesh(geom, GRASS_MAT, grassCount);
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.position.set(cx, 0, cz);
        setChunkBounds(mesh);
        const m = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scl = new THREE.Vector3();
        const color = new THREE.Color();
        for (let i = 0; i < grassCount; i++) {
          const dx = (rng() - 0.5) * chunk;
          const dz = (rng() - 0.5) * chunk;
          const wx = cx + dx;
          const wz = cz + dz;
          const wy = getTerrainHeight(wx, wz);
          // Single-triangle blades with a little random tilt
          const yaw = rng() * Math.PI * 2;
          const tiltX = (rng() - 0.5) * grassSettings.randomTilt;
          const tiltZ = (rng() - 0.5) * grassSettings.randomTilt;
          quat.setFromEuler(new THREE.Euler(tiltX, yaw, tiltZ));
          const scale = THREE.MathUtils.lerp(grassSettings.bladeMinScale, grassSettings.bladeMaxScale, rng());
          scl.set(scale, scale, scale);
          pos.set(dx, wy + grassSettings.baseYOffset, dz);
          m.compose(pos, quat, scl);
          mesh.setMatrixAt(i, m);
          // Natural hue/saturation variation across the field
          color.setHSL(
            THREE.MathUtils.lerp(grassSettings.hueMin, grassSettings.hueMax, rng()),
            THREE.MathUtils.lerp(grassSettings.satMin, grassSettings.satMax, rng()),
            THREE.MathUtils.lerp(grassSettings.lightMin, grassSettings.lightMax, rng())
          );
          mesh.setColorAt(i, color);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        G.scene.add(mesh);
        G.foliage.grass.push(mesh);
      }

      // Flowers
      if (flowerCount > 0) {
        const geom = BASE_GEOM.flower.clone();
        const mesh = new THREE.InstancedMesh(geom, FLOWER_MAT, flowerCount);
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.position.set(cx, 0, cz);
        setChunkBounds(mesh);
        const m = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scl = new THREE.Vector3();
        const color = new THREE.Color();
        for (let i = 0; i < flowerCount; i++) {
          const dx = (rng() - 0.5) * chunk;
          const dz = (rng() - 0.5) * chunk;
          const wx = cx + dx;
          const wz = cz + dz;
          const wy = getTerrainHeight(wx, wz) + 0.02;
          const yaw = rng() * Math.PI * 2;
          quat.setFromEuler(new THREE.Euler(0, yaw, 0));
          // Flowers 1.5x larger than current small baseline
          const scale = (0.7 + rng() * 0.3) * 1.5;
          scl.set(scale, scale, scale);
          pos.set(dx, wy, dz);
          m.compose(pos, quat, scl);
          mesh.setMatrixAt(i, m);
          // bright palette variations
          const palettes = [
            new THREE.Color(0xff6fb3), // pink
            new THREE.Color(0xffda66), // yellow
            new THREE.Color(0x8be37c), // mint
            new THREE.Color(0x6fc3ff), // sky
            new THREE.Color(0xff8a6f)  // peach
          ];
          const base = palettes[Math.floor(rng() * palettes.length)];
          color.copy(base).multiplyScalar(0.9 + rng() * 0.2);
          mesh.setColorAt(i, color);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        G.scene.add(mesh);
        G.foliage.flowers.push(mesh);
      }

      // Bushes
      if (bushesCount > 0) {
        const geom = BASE_GEOM.bush.clone();
        const mesh = new THREE.InstancedMesh(geom, BUSH_MAT, bushesCount);
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.position.set(cx, 0, cz);
        setChunkBounds(mesh);
        const m = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scl = new THREE.Vector3();
        for (let i = 0; i < bushesCount; i++) {
          const dx = (rng() - 0.5) * chunk;
          const dz = (rng() - 0.5) * chunk;
          const wx = cx + dx;
          const wz = cz + dz;
          const wy = getTerrainHeight(wx, wz) + 0.2;
          quat.identity();
          const s = 0.7 + rng() * 0.8;
          scl.set(s, s, s);
          pos.set(dx, wy, dz);
          m.compose(pos, quat, scl);
          mesh.setMatrixAt(i, m);
        }
        mesh.instanceMatrix.needsUpdate = true;
        G.scene.add(mesh);
        G.foliage.bushes.push(mesh);
      }

      // Rocks
      if (rocksCount > 0) {
        const geom = BASE_GEOM.rock.clone();
        const mesh = new THREE.InstancedMesh(geom, ROCK_MAT, rocksCount);
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(cx, 0, cz);
        setChunkBounds(mesh);
        const m = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scl = new THREE.Vector3();
        const color = new THREE.Color();
        for (let i = 0; i < rocksCount; i++) {
          const dx = (rng() - 0.5) * chunk;
          const dz = (rng() - 0.5) * chunk;
          const wx = cx + dx;
          const wz = cz + dz;
          const wy = getTerrainHeight(wx, wz) + 0.05;
          const yaw = rng() * Math.PI * 2;
          quat.setFromEuler(new THREE.Euler(0, yaw, 0));
          const s = 0.4 + rng() * 0.9;
          scl.set(s * (0.8 + rng() * 0.4), s, s * (0.8 + rng() * 0.4));
          pos.set(dx, wy, dz);
          m.compose(pos, quat, scl);
          mesh.setMatrixAt(i, m);
          // slight per-rock color tint
          color.setHSL(0.07, 0.08, THREE.MathUtils.lerp(0.32, 0.46, rng()));
          if (mesh.instanceColor) mesh.setColorAt(i, color);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        G.scene.add(mesh);
        G.foliage.rocks.push(mesh);
      }
    }
  }
  grassBaseGeom.dispose();
}

// --- Procedural terrain helpers ---
// Hash-based 2D value noise for deterministic hills (pure 32-bit integer math)
function hash2i(xi, yi, seed) {
  let h = Math.imul(xi, 374761393) ^ Math.imul(yi, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296; // [0,1)
}

function smoothstep(a, b, t) {
  if (t <= a) return 0;
  if (t >= b) return 1;
  t = (t - a) / (b - a);
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) { return a + (b - a) * t; }

function valueNoise2(x, z, seed) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const s = smoothstep(0, 1, xf);
  const t = smoothstep(0, 1, zf);
  const v00 = hash2i(xi, zi, seed);
  const v10 = hash2i(xi + 1, zi, seed);
  const v01 = hash2i(xi, zi + 1, seed);
  const v11 = hash2i(xi + 1, zi + 1, seed);
  const x1 = lerp(v00, v10, s);
  const x2 = lerp(v01, v11, s);
  return lerp(x1, x2, t) * 2 - 1; // [-1,1]
}

function fbm(x, z, baseFreq, octaves, lacunarity, gain, seed) {
  let sum = 0;
  let amp = 1;
  let freq = baseFreq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, z * freq, seed);
    freq *= lacunarity;
    amp *= gain;
  }
  return sum;
}

// Exported height sampler so other systems can stick to the ground
export function getTerrainHeight(x, z) {
  const seed = (CFG.seed | 0) ^ 0x9e3779b9;
  // Gentle rolling hills with subtle detail
  const h1 = fbm(x, z, 1 / 90, 4, 2, 0.5, seed);
  const h2 = fbm(x, z, 1 / 28, 3, 2, 0.5, seed + 1337);
  const h3 = fbm(x, z, 1 / 9, 2, 2, 0.5, seed + 4242);
  let h = h1 * 3.6 + h2 * 1.7 + h3 * 0.6; // total amplitude ~ up to ~6-7

  // Soften near the center to keep spawn area playable
  const r = Math.hypot(x, z);
  const mask = smoothstep(CFG.clearRadius * 0.8, CFG.clearRadius * 1.8, r);
  h *= mask;

  return h;
}

// --- Procedural ground textures (albedo + normal) ---
function generateGroundTextures(size = 1024) {
  const seed = (CFG.seed | 0) ^ 0x51f9ac4d;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const nCanvas = document.createElement('canvas');
  nCanvas.width = size; nCanvas.height = size;
  const nctx = nCanvas.getContext('2d');

  // Choose a periodic cell count that divides nicely for octaves
  // Bigger = less obvious repeats; must keep perf reasonable
  const cells = 64; // base lattice cells across the tile

  // Periodic hash: wrap lattice coordinates to make the noise tile
  function hash2Periodic(xi, yi, period, s) {
    const px = ((xi % period) + period) % period;
    const py = ((yi % period) + period) % period;
    return hash2i(px, py, s);
  }

  function valueNoise2Periodic(x, z, period, s) {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const xf = x - xi;
    const zf = z - zi;
    const sx = smoothstep(0, 1, xf);
    const sz = smoothstep(0, 1, zf);
    const v00 = hash2Periodic(xi, zi, period, s);
    const v10 = hash2Periodic(xi + 1, zi, period, s);
    const v01 = hash2Periodic(xi, zi + 1, period, s);
    const v11 = hash2Periodic(xi + 1, zi + 1, period, s);
    const x1 = lerp(v00, v10, sx);
    const x2 = lerp(v01, v11, sx);
    return lerp(x1, x2, sz) * 2 - 1;
  }

  function fbmPeriodic(x, z, octaves, s) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    for (let i = 0; i < octaves; i++) {
      const period = cells * freq;
      sum += amp * valueNoise2Periodic(x * freq, z * freq, period, s + i * 1013);
      freq *= 2;
      amp *= 0.5;
    }
    return sum; // roughly [-1,1]
  }

  // Precompute a height-ish field for normal derivation (two-pass)
  const H = new Float32Array(size * size);
  const idx = (x, y) => y * size + x;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Map pixel -> tile domain [0, cells]
      const u = (x / size) * cells;
      const v = (y / size) * cells;

      const nLow = fbmPeriodic(u * 0.75, v * 0.75, 3, seed);
      const nHi = fbmPeriodic(u * 3.0, v * 3.0, 2, seed + 999);
      // Height proxy for normals: mix broad and fine details
      const h = 0.6 * (nLow * 0.5 + 0.5) + 0.4 * (nHi * 0.5 + 0.5);
      H[idx(x, y)] = h;
    }
  }

  const img = ctx.createImageData(size, size);
  const data = img.data;
  const nimg = nctx.createImageData(size, size);
  const ndata = nimg.data;

  // Palettes
  const grassDark = [0x20, 0x5a, 0x2b]; // #205a2b deep green
  const grassLight = [0x4c, 0x9a, 0x3b]; // #4c9a3b lively green
  const dryGrass = [0x88, 0xa0, 0x55]; // #88a055 sun-kissed
  const dirtDark = [0x4f, 0x39, 0x2c]; // #4f392c rich soil
  const dirtLight = [0x73, 0x5a, 0x48]; // #735a48 lighter soil

  function mixColor(a, b, t) {
    return [
      Math.round(lerp(a[0], b[0], t)),
      Math.round(lerp(a[1], b[1], t)),
      Math.round(lerp(a[2], b[2], t))
    ];
  }

  // Second pass: color + normal
  const strength = 2.2; // normal intensity
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * cells;
      const v = (y / size) * cells;

      // Patchiness control
      const broad = fbmPeriodic(u * 0.8, v * 0.8, 3, seed + 17) * 0.5 + 0.5;
      const detail = fbmPeriodic(u * 3.2, v * 3.2, 2, seed + 23) * 0.5 + 0.5;
      let grassness = smoothstep(0.38, 0.62, broad);
      grassness = lerp(grassness, grassness * (0.7 + 0.3 * detail), 0.5);

      // Choose palette and mix for variation
      const grassMid = mixColor(grassDark, grassLight, 0.6);
      const grassCol = mixColor(grassMid, dryGrass, 0.25 + 0.35 * detail);
      const dirtCol = mixColor(dirtDark, dirtLight, 0.35 + 0.4 * detail);
      const col = mixColor(dirtCol, grassCol, grassness);

      const p = idx(x, y) * 4;
      data[p + 0] = col[0];
      data[p + 1] = col[1];
      data[p + 2] = col[2];
      data[p + 3] = 255;

      // Normal from height field with wrapping
      const xL = (x - 1 + size) % size, xR = (x + 1) % size;
      const yT = (y - 1 + size) % size, yB = (y + 1) % size;
      const hL = H[idx(xL, y)], hR = H[idx(xR, y)];
      const hT = H[idx(x, yT)], hB = H[idx(x, yB)];
      const dx = (hR - hL) * strength;
      const dy = (hB - hT) * strength;
      let nx = -dx, ny = -dy, nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen; ny *= invLen; nz *= invLen;
      ndata[p + 0] = Math.round((nx * 0.5 + 0.5) * 255);
      ndata[p + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      ndata[p + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      ndata[p + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  nctx.putImageData(nimg, 0, 0);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;

  const normalMap = new THREE.CanvasTexture(nCanvas);
  normalMap.generateMipmaps = true;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.magFilter = THREE.LinearFilter;
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;

  // Anisotropy if available
  try {
    const maxAniso = G.renderer && G.renderer.capabilities ? G.renderer.capabilities.getMaxAnisotropy() : 0;
    if (maxAniso && maxAniso > 0) {
      map.anisotropy = Math.min(8, maxAniso);
      normalMap.anisotropy = Math.min(8, maxAniso);
    }
  } catch (_) { }

  return { map, normalMap };
}

export function setupGround() {
  const segs = 160; // enough resolution for smooth hills
  const geometry = new THREE.PlaneGeometry(CFG.forestSize, CFG.forestSize, segs, segs);
  geometry.rotateX(-Math.PI / 2);

  // Displace vertices along Y using our height function
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = getTerrainHeight(x, z);
    pos.setY(i, y);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  // Macro vertex colors based on slope (normal.y) and height
  const nrm = geometry.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);
    const ny = nrm.getY(i);

    const r = Math.hypot(x, z);
    const clear = 1.0 - smoothstep(CFG.clearRadius * 0.7, CFG.clearRadius * 1.4, r);
    const flat = smoothstep(0.6, 0.96, ny); // flat areas -> grass
    const hNorm = (y - minY) / Math.max(1e-5, (maxY - minY));

    // Grass tint varies with height; dirt tint more constant
    const grassDark = new THREE.Color(0x1f4f28);
    const grassLight = new THREE.Color(0x3f8f3a);
    const dirtDark = new THREE.Color(0x4a3a2e);
    const dirtLight = new THREE.Color(0x6a5040);

    const grassTint = grassDark.clone().lerp(grassLight, 0.35 + 0.45 * hNorm);
    const dirtTint = dirtDark.clone().lerp(dirtLight, 0.35);

    // Reduce grass in the central clearing for readability
    const grassness = THREE.MathUtils.clamp(flat * (1.0 - 0.65 * clear), 0, 1);
    const tint = dirtTint.clone().lerp(grassTint, grassness);

    colors[i * 3 + 0] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // High-frequency detail textures (tileable) + macro vertex tint
  const { map, normalMap } = generateGroundTextures(1024);
  // Repeat detail across the forest (fewer repeats = larger features)
  // Previously: forestSize / 4 (very fine, looked too uniform)
  const repeats = Math.max(12, Math.round(CFG.forestSize / 12));
  map.repeat.set(repeats, repeats);
  normalMap.repeat.set(repeats, repeats);

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map,
    normalMap,
    roughness: 0.95,
    metalness: 0.0,
    vertexColors: true
  });

  // Add a subtle world-space macro variation to break tiling repetition
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMacroScale = { value: 0.035 }; // frequency in world units
    shader.uniforms.uMacroStrength = { value: 0.28 }; // mix into base color

    shader.vertexShader = (
      'varying vec3 vWorldPos;\n' +
      shader.vertexShader
    ).replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
       vWorldPos = worldPosition.xyz;`
    );

    // Cheap 2D value-noise FBM in fragment to modulate albedo in world space
    const NOISE_CHUNK = `
      varying vec3 vWorldPos;
      uniform float uMacroScale;
      uniform float uMacroStrength;

      float hash12(vec2 p){
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      float vnoise(vec2 p){
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash12(i);
        float b = hash12(i + vec2(1.0, 0.0));
        float c = hash12(i + vec2(0.0, 1.0));
        float d = hash12(i + vec2(1.0, 1.0));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }
      float fbm2(vec2 p){
        float t = 0.0;
        float amp = 0.5;
        for(int i=0;i<4;i++){
          t += amp * vnoise(p);
          p *= 2.0;
          amp *= 0.5;
        }
        return t;
      }
    `;

    shader.fragmentShader = (
      NOISE_CHUNK + shader.fragmentShader
    ).replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       // World-space macro color variation to reduce visible tiling
       vec2 st = vWorldPos.xz * uMacroScale;
       float macro = fbm2(st);
       macro = macro * 0.5 + 0.5; // [0,1]
       float m = mix(0.82, 1.18, macro);
       diffuseColor.rgb *= mix(1.0, m, uMacroStrength);`
    );
  };
  const ground = new THREE.Mesh(geometry, material);
  ground.receiveShadow = true;
  G.scene.add(ground);
  G.ground = ground;
  // With instanced trees we approximate trunk blocking via spatial grid; keep raycast blockers minimal
  G.blockers = [ground];
}

export function generateForest() {
  const clearRadiusSq = CFG.clearRadius * CFG.clearRadius;
  const halfSize = CFG.forestSize / 2;
  let placed = 0;
  const maxAttempts = CFG.treeCount * 3;
  let attempts = 0;

  // Reset data
  G.treeColliders.length = 0;
  if (!G.treeTrunks) G.treeTrunks = [];
  G.treeTrunks.length = 0; // retained for compatibility; no longer populated with individual meshes
  if (!G.treeMeshes) G.treeMeshes = [];
  G.treeMeshes.length = 0;

  // Prepare instanced batches (upper bound capacity = CFG.treeCount)
  const trunkIM = new THREE.InstancedMesh(GEO_TRUNK, TRUNK_MAT, CFG.treeCount);
  trunkIM.castShadow = true; trunkIM.receiveShadow = true;
  const cone1IM = new THREE.InstancedMesh(GEO_CONE1, FOLIAGE_MAT, CFG.treeCount);
  const cone2IM = new THREE.InstancedMesh(GEO_CONE2, FOLIAGE_MAT, CFG.treeCount);
  const cone3IM = new THREE.InstancedMesh(GEO_CONE3, FOLIAGE_MAT, CFG.treeCount);
  const crownIM = new THREE.InstancedMesh(GEO_SPH, FOLIAGE_MAT, CFG.treeCount);
  cone1IM.castShadow = cone2IM.castShadow = cone3IM.castShadow = crownIM.castShadow = false;
  cone1IM.receiveShadow = cone2IM.receiveShadow = cone3IM.receiveShadow = crownIM.receiveShadow = true;

  const m = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  while (placed < CFG.treeCount && attempts < maxAttempts) {
    attempts++;
    const x = (G.random() - 0.5) * CFG.forestSize;
    const z = (G.random() - 0.5) * CFG.forestSize;

    // Check clearing
    if (x * x + z * z < clearRadiusSq) continue;

    // Check distance to other trees
    let tooClose = false;
    for (const collider of G.treeColliders) {
      const dx = x - collider.x;
      const dz = z - collider.z;
      if (dx * dx + dz * dz < Math.pow(collider.radius * 2, 2)) { tooClose = true; break; }
    }
    if (tooClose) continue;

    // Random uniform scale and rotation per tree
    const s = 0.75 + G.random() * 0.8; // ~0.75..1.55
    const fScale = s * (0.9 + G.random() * 0.15);
    const yaw = G.random() * Math.PI * 2;
    quat.setFromEuler(new THREE.Euler(0, yaw, 0));
    const y = getTerrainHeight(x, z);
    m.compose(new THREE.Vector3(x, y, z), quat, new THREE.Vector3(s, s, s));
    trunkIM.setMatrixAt(placed, m);

    // Foliage uses same transform but with foliage scale factor
    m.compose(new THREE.Vector3(x, y, z), quat, new THREE.Vector3(fScale, fScale, fScale));
    cone1IM.setMatrixAt(placed, m);
    cone2IM.setMatrixAt(placed, m);
    cone3IM.setMatrixAt(placed, m);
    crownIM.setMatrixAt(placed, m);

    // Collider roughly matching trunk base radius
    const trunkBaseRadius = 1.2 * s;
    G.treeColliders.push({ x, z, radius: trunkBaseRadius });
    placed++;
  }
  trunkIM.count = placed; cone1IM.count = placed; cone2IM.count = placed; cone3IM.count = placed; crownIM.count = placed;
  trunkIM.instanceMatrix.needsUpdate = true;
  cone1IM.instanceMatrix.needsUpdate = cone2IM.instanceMatrix.needsUpdate = true;
  cone3IM.instanceMatrix.needsUpdate = crownIM.instanceMatrix.needsUpdate = true;

  if (placed > 0) {
    G.scene.add(trunkIM, cone1IM, cone2IM, cone3IM, crownIM);
  }

  // With instancing, keep blockers to ground; tree collisions handled via grid tests
  if (G.ground) {
    G.blockers = [G.ground];
  } else {
    G.blockers = [];
  }
  buildTreeGrid();
}

// ---- Spatial index for tree colliders ----
// Simple uniform grid over the world to reduce O(N) scans
export function buildTreeGrid(cellSize = 12) {
  const half = CFG.forestSize / 2;
  const minX = -half, minZ = -half;
  const cols = Math.max(1, Math.ceil(CFG.forestSize / cellSize));
  const rows = Math.max(1, Math.ceil(CFG.forestSize / cellSize));
  const cells = new Array(cols * rows);
  for (let i = 0; i < cells.length; i++) cells[i] = [];
  function cellIndex(ix, iz) { return iz * cols + ix; }
  for (const t of G.treeColliders) {
    const ix = Math.max(0, Math.min(cols - 1, Math.floor((t.x - minX) / cellSize)));
    const iz = Math.max(0, Math.min(rows - 1, Math.floor((t.z - minZ) / cellSize)));
    cells[cellIndex(ix, iz)].push(t);
  }
  G.treeGrid = { cellSize, minX, minZ, cols, rows, cells };
}

const _nearTrees = [];
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

// Gathers tree colliders around a point within a given radius (XZ plane)
export function getNearbyTrees(x, z, radius = 4) {
  _nearTrees.length = 0;
  const grid = G.treeGrid;
  if (!grid) return _nearTrees;
  const { cellSize, minX, minZ, cols, rows, cells } = grid;
  const r = Math.max(radius, 0);
  const minIx = clamp(Math.floor((x - r - minX) / cellSize), 0, cols - 1);
  const maxIx = clamp(Math.floor((x + r - minX) / cellSize), 0, cols - 1);
  const minIz = clamp(Math.floor((z - r - minZ) / cellSize), 0, rows - 1);
  const maxIz = clamp(Math.floor((z + r - minZ) / cellSize), 0, rows - 1);
  for (let iz = minIz; iz <= maxIz; iz++) {
    for (let ix = minIx; ix <= maxIx; ix++) {
      const cell = cells[iz * cols + ix];
      for (let k = 0; k < cell.length; k++) _nearTrees.push(cell[k]);
    }
  }
  return _nearTrees;
}

const _aabbTrees = [];
export function getTreesInAABB(minX, minZ, maxX, maxZ) {
  _aabbTrees.length = 0;
  const grid = G.treeGrid;
  if (!grid) return _aabbTrees;
  const { cellSize, minX: gx, minZ: gz, cols, rows, cells } = grid;
  const minIx = clamp(Math.floor((minX - gx) / cellSize), 0, cols - 1);
  const maxIx = clamp(Math.floor((maxX - gx) / cellSize), 0, cols - 1);
  const minIz = clamp(Math.floor((minZ - gz) / cellSize), 0, rows - 1);
  const maxIz = clamp(Math.floor((maxZ - gz) / cellSize), 0, rows - 1);
  for (let iz = minIz; iz <= maxIz; iz++) {
    for (let ix = minIx; ix <= maxIx; ix++) {
      const cell = cells[iz * cols + ix];
      for (let k = 0; k < cell.length; k++) _aabbTrees.push(cell[k]);
    }
  }
  return _aabbTrees;
}

// Fast 2D segment-vs-circle test
function segIntersectsCircle(x1, z1, x2, z2, cx, cz, r) {
  const vx = x2 - x1, vz = z2 - z1;
  const wx = cx - x1, wz = cz - z1;
  const vv = vx * vx + vz * vz;
  if (vv <= 1e-6) return false;
  let t = (wx * vx + wz * vz) / vv;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const px = x1 + t * vx, pz = z1 + t * vz;
  const dx = cx - px, dz = cz - pz;
  return (dx * dx + dz * dz) <= r * r;
}

// Approximate line-of-sight using tree cylinders and terrain samples (no raycaster)
export function hasLineOfSight(from, to) {
  // Terrain occlusion: sample a few points along the ray
  const steps = 6;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    const y = from.y + (to.y - from.y) * t;
    const gy = getTerrainHeight(x, z) + 0.1;
    if (y <= gy) return false;
  }
  // Tree occlusion using grid-restricted set
  const minX = Math.min(from.x, to.x) - 2.0;
  const maxX = Math.max(from.x, to.x) + 2.0;
  const minZ = Math.min(from.z, to.z) - 2.0;
  const maxZ = Math.max(from.z, to.z) + 2.0;
  const candidates = getTreesInAABB(minX, minZ, maxX, maxZ);
  for (let i = 0; i < candidates.length; i++) {
    const t = candidates[i];
    // Use a slightly inflated radius to account for foliage
    const r = t.radius + 0.3;
    if (segIntersectsCircle(from.x, from.z, to.x, to.z, t.x, t.z, r)) {
      // If the segment is sufficiently high (e.g., arrow arc), allow pass
      // Estimate height at closest approach t in [0,1]
      const vx = to.x - from.x, vz = to.z - from.z;
      const wx = t.x - from.x, wz = t.z - from.z;
      const vv = vx * vx + vz * vz;
      let u = (wx * vx + wz * vz) / (vv || 1);
      if (u < 0) u = 0; else if (u > 1) u = 1;
      const yAt = from.y + (to.y - from.y) * u;
      if (yAt < 8) return false; // below canopy -> blocked
    }
  }
  return true;
}

// --- Destructible trees: grenades knock down nearby trees ---
export function knockdownNearbyTrees(position, radius) {
  const nearby = getNearbyTrees(position.x, position.z, radius);
  const destroyed = [];
  for (let i = 0; i < nearby.length; i++) {
    const t = nearby[i];
    const dx = t.x - position.x;
    const dz = t.z - position.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= radius && !t.destroyed) {
      t.destroyed = true;
      // Push direction: away from explosion
      const angle = Math.atan2(dz, dx);
      G.fallingTrees.push({
        collider: t,
        x: t.x, z: t.z,
        fallAngle: angle,
        fallProgress: 0,
        done: false
      });
      destroyed.push(t);
    }
  }
  // Remove destroyed trees from collision grid
  if (destroyed.length > 0 && G.treeGrid) {
    const { cellSize, minX, minZ, cols, cells } = G.treeGrid;
    for (const t of destroyed) {
      const ix = Math.max(0, Math.min(cols - 1, Math.floor((t.x - minX) / cellSize)));
      const iz = Math.max(0, Math.min(cols - 1, Math.floor((t.z - minZ) / cellSize)));
      const cell = cells[iz * cols + ix];
      const idx = cell.indexOf(t);
      if (idx !== -1) cell.splice(idx, 1);
    }
    // Also remove from main colliders array
    for (const t of destroyed) {
      const idx = G.treeColliders.indexOf(t);
      if (idx !== -1) G.treeColliders.splice(idx, 1);
    }
  }
}

export function updateFallingTrees(delta) {
  for (let i = G.fallingTrees.length - 1; i >= 0; i--) {
    const ft = G.fallingTrees[i];
    ft.fallProgress += delta * 0.7; // 1.5s to fully fall
    if (ft.fallProgress >= 1) {
      ft.done = true;
      G.fallingTrees.splice(i, 1);
    }
    // Note: Because trees use instanced meshes, we can't easily animate 
    // individual instances. The collision is already removed, so gameplay 
    // dynamics change immediately (can shoot/walk through).
  }
}

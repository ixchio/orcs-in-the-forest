import * as THREE from 'three';
import { G } from './globals.js';
import { CLOUDS } from './config.js';

const COLOR_N = new THREE.Color(CLOUDS.colorNight);
const COLOR_D = new THREE.Color(CLOUDS.colorDay);
const TMP_COLOR = new THREE.Color();

// Lightweight value-noise + FBM for soft, natural cloud edges
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

function valueNoise2(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = smoothstep(0, 1, xf);
  const sy = smoothstep(0, 1, yf);
  const v00 = hash2i(xi, yi, seed);
  const v10 = hash2i(xi + 1, yi, seed);
  const v01 = hash2i(xi, yi + 1, seed);
  const v11 = hash2i(xi + 1, yi + 1, seed);
  const ix0 = lerp(v00, v10, sx);
  const ix1 = lerp(v01, v11, sx);
  return lerp(ix0, ix1, sy) * 2 - 1; // [-1,1]
}

function fbm2(x, y, baseFreq, octaves, lacunarity, gain, seed) {
  let sum = 0;
  let amp = 1;
  let freq = baseFreq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + i * 1013);
    freq *= lacunarity;
    amp *= gain;
  }
  return sum; // ~[-ampSum, ampSum]
}

function makeCloudTexture(size = 256, puffCount = 10) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, size, size);

  // Draw several soft circles to form a cloud shape
  const r = size / 2;
  ctx.fillStyle = 'white';
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < puffCount; i++) {
    const pr = r * (0.42 + Math.random() * 0.38);
    const px = r + (Math.random() * 2 - 1) * r * 0.48;
    const py = r + (Math.random() * 2 - 1) * r * 0.22; // slightly flatter vertically
    const grad = ctx.createRadialGradient(px, py, pr * 0.18, px, py, pr);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Apply subtle FBM noise to alpha for irregular, more realistic edges
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  const seed = 1337;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const a = data[idx + 3] / 255; // base alpha from puffs
      if (a <= 0) continue;
      // FBM noise in [0..1]
      const nx = x / size;
      const ny = y / size;
      const n = fbm2(nx, ny, 8.0, 3, 2.0, 0.5, seed) * 0.5 + 0.5;
      // Edge breakup and slight interior variation
      let alpha = a * (0.78 + 0.35 * n);
      // Gentle bottom shading (darker underside)
      const shade = 0.90 + 0.10 * (1.0 - ny); // 1.0 at top -> 0.90 at bottom
      data[idx]   = Math.min(255, data[idx] * shade);
      data[idx+1] = Math.min(255, data[idx+1] * shade);
      data[idx+2] = Math.min(255, data[idx+2] * shade);
      // Contrast alpha for crisper silhouettes
      alpha = Math.pow(alpha, 0.85);
      // Hard clip tiny alphas to help alphaTest (reduces overdraw)
      if (alpha < 0.02) alpha = 0;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = true;
  tex.anisotropy = 2;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export function setupClouds() {
  if (!CLOUDS.enabled) return;
  // Create shared texture
  const tex = makeCloudTexture(256, 12);
  if (!tex) return;

  // Wind vector
  const ang = THREE.MathUtils.degToRad(CLOUDS.windDeg || 0);
  const wind = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));

  for (let i = 0; i < CLOUDS.count; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: new THREE.Color(CLOUDS.colorDay),
      transparent: true,
      opacity: CLOUDS.opacityDay,
      alphaTest: 0.03, // discard near-transparent pixels, reduces fill cost
      depthTest: true,
      depthWrite: false,
      fog: false
    });
    const sp = new THREE.Sprite(mat);
    // Randomize in-texture rotation for variety without extra draw cost
    sp.material.rotation = Math.random() * Math.PI * 2;
    const size = THREE.MathUtils.lerp(CLOUDS.sizeMin, CLOUDS.sizeMax, Math.random());
    sp.scale.set(size, size * 0.6, 1); // a bit flattened
    sp.castShadow = false; sp.receiveShadow = false;
    
    // Position in ring
    const t = Math.random() * Math.PI * 2;
    const r = CLOUDS.radius * (0.6 + Math.random() * 0.4);
    sp.position.set(Math.cos(t) * r, CLOUDS.height + (Math.random() - 0.5) * 10, Math.sin(t) * r);
    sp.renderOrder = 0;
    G.scene.add(sp);

    const speed = CLOUDS.speed * (0.6 + Math.random() * 0.8);
    G.clouds.push({ sprite: sp, speed, wind: wind.clone(), size });
  }
}

export function updateClouds(delta) {
  if (!CLOUDS.enabled || G.clouds.length === 0) return;

  // Day factor for opacity/color blending
  const dayF = 0.5 - 0.5 * Math.cos(2 * Math.PI * (G.timeOfDay || 0));

  for (const c of G.clouds) {
    // Drift
    c.sprite.position.addScaledVector(c.wind, c.speed * delta);

    // Wrap around ring bounds
    const p = c.sprite.position;
    const r = Math.hypot(p.x, p.z);
    const minR = CLOUDS.radius * 0.5;
    const maxR = CLOUDS.radius * 1.1;
    if (r < minR || r > maxR) {
      // Reposition opposite side keeping height
      const ang = Math.atan2(p.z, p.x) + Math.PI;
      p.x = Math.cos(ang) * CLOUDS.radius;
      p.z = Math.sin(ang) * CLOUDS.radius;
    }

    // Blend opacity and color via day/night
    const op = CLOUDS.opacityNight * (1 - dayF) + CLOUDS.opacityDay * dayF;
    c.sprite.material.opacity = op;
    TMP_COLOR.copy(COLOR_N).lerp(COLOR_D, dayF);
    c.sprite.material.color.copy(TMP_COLOR);
  }
}

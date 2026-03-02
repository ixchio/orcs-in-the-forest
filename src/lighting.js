import * as THREE from 'three';
import { CFG } from './config.js';
import { G } from './globals.js';

function makeRadialCircleTexture(size = 256, innerAlpha = 1, outerAlpha = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  ctx.clearRect(0, 0, size, size);
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, `rgba(255,255,255,${innerAlpha})`);
  grad.addColorStop(1, `rgba(255,255,255,${outerAlpha})`);
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

export function setupLights() {
  // Ambient
  const ambientLight = new THREE.HemisphereLight(0x6a7f9a, 0x203050, 0.3);
  G.scene.add(ambientLight);
  G.ambientLight = ambientLight;

  // Sun light (key during day)
  const sun = new THREE.DirectionalLight(0xfff1cc, 1.2);
  sun.position.set(0, 100, 0);
  sun.castShadow = true;
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 240;
  // Smaller shadow map for performance
  sun.shadow.mapSize.width = 512;
  sun.shadow.mapSize.height = 512;
  sun.target = new THREE.Object3D();
  G.scene.add(sun);
  G.scene.add(sun.target);
  G.sunLight = sun;

  // Moon light (key during night)
  const moon = new THREE.DirectionalLight(0x6a8fc5, 0.8);
  moon.position.set(50, 80, -50);
  // Disable moon shadows to reduce shadow pass cost
  moon.castShadow = false;
  moon.target = new THREE.Object3D();
  G.scene.add(moon);
  G.scene.add(moon.target);
  G.moonLight = moon;

  // Simple sun sprite (billboard, round via radial alpha)
  const sunTex = makeRadialCircleTexture(256, 1, 0);
  const sunMat = new THREE.SpriteMaterial({ color: 0xfff1cc, map: sunTex, transparent: true, opacity: 0.95, depthTest: true, depthWrite: false, fog: false });
  const sunSprite = new THREE.Sprite(sunMat);
  sunSprite.scale.set(10, 10, 1);
  sunSprite.renderOrder = 1;
  G.scene.add(sunSprite);
  G.sunSprite = sunSprite;

  // Simple moon sprite
  const moonTex = makeRadialCircleTexture(256, 1, 0);
  const moonMat = new THREE.SpriteMaterial({ color: 0xaec7ff, map: moonTex, transparent: true, opacity: 0.8, depthTest: true, depthWrite: false, fog: false });
  const moonSprite = new THREE.Sprite(moonMat);
  moonSprite.scale.set(6, 6, 1);
  moonSprite.renderOrder = 1;
  G.scene.add(moonSprite);
  G.moonSprite = moonSprite;

  // Flashlight
  const flashlight = new THREE.SpotLight(0xffffff, CFG.flashlight.intensity);
  flashlight.angle = CFG.flashlight.angle;
  flashlight.penumbra = 0.2;
  flashlight.distance = CFG.flashlight.distance;
  flashlight.decay = 1.5;
  // Flashlight shadowing is expensive; disable for performance
  flashlight.castShadow = false;
  flashlight.shadow.camera.near = 0.1;
  flashlight.shadow.camera.far = CFG.flashlight.distance;
  flashlight.visible = CFG.flashlight.on;
  G.camera.add(flashlight);
  flashlight.position.set(0, 0, 0);
  flashlight.target.position.set(0, 0, -1);
  G.camera.add(flashlight.target);
  G.scene.add(G.camera);
  G.flashlight = flashlight;
}

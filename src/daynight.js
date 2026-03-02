import * as THREE from 'three';
import { G } from './globals.js';
import { DAY_NIGHT } from './config.js';

const c = DAY_NIGHT.colors;

const color = (hex) => new THREE.Color(hex);

const SKY_N = color(c.ambientSkyNight);
const SKY_D = color(c.ambientSkyDay);
const GRD_N = color(c.ambientGroundNight);
const GRD_D = color(c.ambientGroundDay);
const DIR_N = color(c.dirNight);
const DIR_D = color(c.dirDay);
const SUN_R = color(c.sunSunrise || 0xffa04a);
const SUN_N = color(c.sunNoon || 0xfff1cc);
const FOG_N = color(c.fogNight);
const FOG_D = color(c.fogDay);
const BG_N = color(c.bgNight);
const BG_D = color(c.bgDay);

// Reusable colors to avoid allocs each frame
const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

// Returns [dayFactor, nightFactor]
function dayNightFactors(t) {
  // Cosine-based curve: 1 at noon, 0 at midnight
  const day = 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
  const night = 1 - day;
  return [day, night];
}

export function updateDayNight(delta) {
  if (!DAY_NIGHT.enabled) return;

  // Advance time
  const len = Math.max(10, DAY_NIGHT.lengthSec);
  G.timeOfDay = (G.timeOfDay + delta / len) % 1;

  const [dayF, nightF] = dayNightFactors(G.timeOfDay);

  // Intensities
  const ambI = DAY_NIGHT.nightAmbient * nightF + DAY_NIGHT.dayAmbient * dayF;
  const sunI = DAY_NIGHT.dayKey * dayF;
  const moonI = DAY_NIGHT.nightKey * nightF;
  const fogD = DAY_NIGHT.nightFogDensity * nightF + DAY_NIGHT.dayFogDensity * dayF;

  // Colors
  tmpA.copy(SKY_N).lerp(SKY_D, dayF);
  if (G.ambientLight) {
    G.ambientLight.intensity = ambI;
    G.ambientLight.color.copy(tmpA);
    tmpB.copy(GRD_N).lerp(GRD_D, dayF);
    // HemisphereLight has groundColor
    G.ambientLight.groundColor.copy(tmpB);
  }

  // Compute sun/moon directions along an arced path
  // Noon at t=0.5, midnight at t=0.0, use phi in [-pi, pi]
  const phi = (G.timeOfDay - 0.25) * Math.PI * 2; // -pi/2 at t=0, +pi/2 at t=0.5
  const sunDir = new THREE.Vector3(0, Math.sin(phi), Math.cos(phi)); // YZ plane
  // Apply yaw tilt
  const tilt = THREE.MathUtils.degToRad(DAY_NIGHT.sunTiltDeg || 0);
  sunDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), tilt).normalize();
  const moonDir = sunDir.clone().multiplyScalar(-1);

  // Update sun light
  if (G.sunLight) {
    G.sunLight.intensity = sunI;
    // Sun tint warms near horizon and whites near zenith
    const elev = Math.max(0, sunDir.y);
    const warmT = Math.pow(elev, 0.75);
    tmpA.copy(SUN_R).lerp(SUN_N, warmT);
    G.sunLight.color.copy(tmpA);
    const dist = DAY_NIGHT.sunDistance || 200;
    G.sunLight.position.copy(sunDir).multiplyScalar(dist);
    if (G.sunLight.target) G.sunLight.target.position.set(0, 0, 0);
    G.sunLight.visible = sunI > 0.01;
  }

  // Update moon light
  if (G.moonLight) {
    G.moonLight.intensity = moonI;
    G.moonLight.color.copy(DIR_N);
    const distM = DAY_NIGHT.moonDistance || 200;
    G.moonLight.position.copy(moonDir).multiplyScalar(distM);
    if (G.moonLight.target) G.moonLight.target.position.set(0, 0, 0);
    G.moonLight.visible = moonI > 0.01;
  }

  // Sun/moon sprites
  if (G.sunSprite) {
    const d = DAY_NIGHT.sunDistance || 200;
    G.sunSprite.position.copy(sunDir).multiplyScalar(d);
    // Match sprite tint to sun light color and boost opacity with day
    const elev = Math.max(0, sunDir.y);
    const warmT = Math.pow(elev, 0.75);
    tmpA.copy(SUN_R).lerp(SUN_N, warmT);
    G.sunSprite.material.color.copy(tmpA);
    G.sunSprite.material.opacity = 0.65 + 0.35 * dayF;
    G.sunSprite.visible = sunDir.y > 0.02; // only above horizon
  }
  if (G.moonSprite) {
    const d = DAY_NIGHT.moonDistance || 200;
    G.moonSprite.position.copy(moonDir).multiplyScalar(d);
    G.moonSprite.material.opacity = 0.5 + 0.3 * nightF;
    G.moonSprite.visible = moonDir.y > 0.02; // only above horizon
  }

  tmpA.copy(FOG_N).lerp(FOG_D, dayF);
  if (G.scene && G.scene.fog) {
    G.scene.fog.color.copy(tmpA);
    G.scene.fog.density = fogD;
  }

  tmpA.copy(BG_N).lerp(BG_D, dayF);
  if (G.scene && G.scene.background) {
    G.scene.background.copy(tmpA);
  }
}

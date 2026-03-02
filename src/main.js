import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CFG } from './config.js';
import { G } from './globals.js';
import { makeRandom } from './utils.js';
import { setupLights } from './lighting.js';
import { setupGround, generateForest, generateGroundCover, getTerrainHeight, tickForest } from './world.js';
import { setupWeapon, updateWeaponAnchor, beginReload, updateWeapon } from './weapon.js';
import { setupEvents } from './events.js';
import { updatePlayer } from './player.js';
import { updateEnemies } from './enemies.js';
import { startNextWave, updateWaves } from './waves.js';
import { updateHUD, showOverlay, updateDamageEffect, updateHealEffect, updateCrosshair, updateHitMarker } from './hud.js';
import { updateFX } from './fx.js';
import { updateCasings } from './casings.js';
import { updateEnemyProjectiles } from './projectiles.js';
import { updateGrenades } from './grenades.js';
import { updateDayNight } from './daynight.js';
import { performShooting } from './combat.js';
import { updatePickups } from './pickups.js';
import { updateHelmets } from './helmets.js';
import { setupClouds, updateClouds } from './clouds.js';
import { startMusic, stopMusic, startAmbience, updateAmbience, stopAmbience } from './audio.js';
import { setupMountains, updateMountains } from './mountains.js';
import { resetUpgrades, getRegenRate } from './upgrades.js';
import { updateKillStreak, resetStreak } from './killstreak.js';
import { updateWeather, endWeather } from './weather.js';
import { updateFallingTrees } from './world.js';
import { showDeathRecap, hideDeathRecap } from './hud.js';

init();
animate();

function init() {
  // Renderer
  G.renderer = new THREE.WebGLRenderer({ antialias: true });
  G.renderer.setSize(window.innerWidth, window.innerHeight);
  // Lower pixel ratio cap for significant fill-rate savings
  G.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
  G.renderer.shadowMap.enabled = true;
  // Use the cheapest shadow filter for CPU savings
  G.renderer.shadowMap.type = THREE.BasicShadowMap;
  document.body.appendChild(G.renderer.domElement);

  // Scene
  G.scene = new THREE.Scene();
  G.scene.background = new THREE.Color(0x0a1015);
  G.scene.fog = new THREE.FogExp2(0x05070a, CFG.fogDensity);

  // Camera
  G.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  // Controls
  G.controls = new PointerLockControls(G.camera, document.body);

  // Clock
  G.clock = new THREE.Clock();

  // Seeded random
  G.random = makeRandom(CFG.seed);

  // Player
  const startY = getTerrainHeight(0, 0) + (CFG.player.eyeHeight || 1.8);
  G.player = {
    pos: new THREE.Vector3(0, startY, 0),
    vel: new THREE.Vector3(),
    speed: CFG.player.speed,
    radius: CFG.player.radius,
    health: CFG.player.health,
    alive: true,
    score: 0,
    yVel: 0,
    grounded: true,
    // Apex-like movement state
    sliding: false,
    jumpBuffer: 0,
    coyoteTimer: 0,
    lastWallNormal: new THREE.Vector3(),
    wallContactTimer: 0
    , jumpHeld: false
  };
  G.weapon.ammo = CFG.gun.magSize;
  G.weapon.reserve = Infinity;
  G.grenadeCount = 0;

  // Add camera to scene
  G.camera.position.copy(G.player.pos);

  // Lights
  setupLights();

  // Ground and world
  setupGround();
  // Ground cover before or after trees — independent
  generateGroundCover();
  generateForest();
  setupClouds();
  setupMountains();

  // Weapon
  setupWeapon();
  updateWeaponAnchor();

  // Events
  setupEvents({
    startGame,
    restartGame,
    beginReload,
    updateWeaponAnchor
  });

  setupFoliageDebugPanel();

  // Pre-warm shaders to avoid first-frame hitches
  if (G.renderer && G.scene && G.camera) {
    try { G.renderer.compile(G.scene, G.camera); } catch (_) { }
  }
}

function setupFoliageDebugPanel() {
  if (typeof window === 'undefined') return;
  if (window.__foliageDebugReady) return;
  window.__foliageDebugReady = true;

  const grassDefaults = {
    densityMult: 6.0,
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
  };

  const normalizeGrassConfig = () => {
    if (!CFG.foliage.grass || typeof CFG.foliage.grass !== 'object') CFG.foliage.grass = {};
    const g = CFG.foliage.grass;
    for (const [k, v] of Object.entries(grassDefaults)) {
      if (g[k] == null || !Number.isFinite(Number(g[k]))) g[k] = v;
      else g[k] = Number(g[k]);
    }
    if (g.densityMult == null) g.densityMult = CFG.foliage.grassDensityMult ?? grassDefaults.densityMult;
    CFG.foliage.grassDensityMult = Number(g.densityMult);
    return g;
  };
  normalizeGrassConfig();

  const sliderDefs = [
    { group: 'Distribution', id: 'chunkSize', label: 'Chunk Size', min: 12, max: 64, step: 1, get: () => CFG.foliage.chunkSize, set: (v) => { CFG.foliage.chunkSize = Math.round(v); }, fmt: (v) => `${Math.round(v)}` },
    { group: 'Distribution', id: 'densityNearClear', label: 'Density Near Clear', min: 0, max: 1, step: 0.01, get: () => CFG.foliage.densityNearClear, set: (v) => { CFG.foliage.densityNearClear = Number(v); }, fmt: (v) => Number(v).toFixed(2) },
    { group: 'Distribution', id: 'grassPerChunk', label: 'Grass Base/Chunk', min: 60, max: 2200, step: 5, get: () => CFG.foliage.grassPerChunk, set: (v) => { CFG.foliage.grassPerChunk = Math.round(v); }, fmt: (v) => `${Math.round(v)}` },
    { group: 'Distribution', id: 'densityMult', label: 'Grass Density Mult', min: 0.5, max: 12, step: 0.1, get: () => normalizeGrassConfig().densityMult, set: (v) => { const g = normalizeGrassConfig(); g.densityMult = Number(v); CFG.foliage.grassDensityMult = Number(v); }, fmt: (v) => Number(v).toFixed(2) },
    { group: 'Distribution', id: 'grassViewDist', label: 'Grass View Dist', min: 30, max: 220, step: 1, get: () => CFG.foliage.grassViewDist, set: (v) => { CFG.foliage.grassViewDist = Number(v); }, fmt: (v) => `${Math.round(v)}` },
    { group: 'Distribution', id: 'windStrength', label: 'Wind Strength', min: 0, max: 1.5, step: 0.01, get: () => CFG.foliage.windStrength, set: (v) => { CFG.foliage.windStrength = Number(v); }, fmt: (v) => Number(v).toFixed(2) },

    { group: 'Blade Shape', id: 'bladeBaseWidth', label: 'Blade Base Width', min: 0.03, max: 0.4, step: 0.001, get: () => normalizeGrassConfig().bladeBaseWidth, set: (v) => { normalizeGrassConfig().bladeBaseWidth = Number(v); }, fmt: (v) => Number(v).toFixed(3) },
    { group: 'Blade Shape', id: 'bladeBaseHeight', label: 'Blade Base Height', min: 0.15, max: 1.6, step: 0.01, get: () => normalizeGrassConfig().bladeBaseHeight, set: (v) => { normalizeGrassConfig().bladeBaseHeight = Number(v); }, fmt: (v) => Number(v).toFixed(2) },
    { group: 'Blade Shape', id: 'bladeMinScale', label: 'Blade Min Scale', min: 0.2, max: 3.0, step: 0.01, get: () => normalizeGrassConfig().bladeMinScale, set: (v) => { normalizeGrassConfig().bladeMinScale = Number(v); }, fmt: (v) => Number(v).toFixed(2) },
    { group: 'Blade Shape', id: 'bladeMaxScale', label: 'Blade Max Scale', min: 0.25, max: 3.2, step: 0.01, get: () => normalizeGrassConfig().bladeMaxScale, set: (v) => { normalizeGrassConfig().bladeMaxScale = Number(v); }, fmt: (v) => Number(v).toFixed(2) },
    { group: 'Blade Shape', id: 'rootWidth', label: 'Root Width', min: 0.1, max: 1.6, step: 0.01, get: () => normalizeGrassConfig().rootWidth, set: (v) => { normalizeGrassConfig().rootWidth = Number(v); }, fmt: (v) => Number(v).toFixed(2) },
    { group: 'Blade Shape', id: 'tipWidth', label: 'Tip Width', min: 0.01, max: 0.8, step: 0.01, get: () => normalizeGrassConfig().tipWidth, set: (v) => { normalizeGrassConfig().tipWidth = Number(v); }, fmt: (v) => Number(v).toFixed(2) },
    { group: 'Blade Shape', id: 'baseYOffset', label: 'Base Y Offset', min: -0.2, max: 0.2, step: 0.001, get: () => normalizeGrassConfig().baseYOffset, set: (v) => { normalizeGrassConfig().baseYOffset = Number(v); }, fmt: (v) => Number(v).toFixed(3) },
    { group: 'Blade Shape', id: 'randomTilt', label: 'Random Tilt', min: 0, max: 0.35, step: 0.005, get: () => normalizeGrassConfig().randomTilt, set: (v) => { normalizeGrassConfig().randomTilt = Number(v); }, fmt: (v) => Number(v).toFixed(3) },

    { group: 'Motion', id: 'bendBase', label: 'Bend Base', min: 0, max: 1.5, step: 0.01, get: () => normalizeGrassConfig().bendBase, set: (v) => { normalizeGrassConfig().bendBase = Number(v); }, fmt: (v) => Number(v).toFixed(2) },
    { group: 'Motion', id: 'bendWindMult', label: 'Bend Wind Mult', min: 0, max: 2.0, step: 0.01, get: () => normalizeGrassConfig().bendWindMult, set: (v) => { normalizeGrassConfig().bendWindMult = Number(v); }, fmt: (v) => Number(v).toFixed(2) },
    { group: 'Motion', id: 'leanJitter', label: 'Lean Jitter', min: 0, max: 1.0, step: 0.01, get: () => normalizeGrassConfig().leanJitter, set: (v) => { normalizeGrassConfig().leanJitter = Number(v); }, fmt: (v) => Number(v).toFixed(2) },
    { group: 'Motion', id: 'swayPushX', label: 'Sway Push X', min: 0, max: 1.2, step: 0.01, get: () => normalizeGrassConfig().swayPushX, set: (v) => { normalizeGrassConfig().swayPushX = Number(v); }, fmt: (v) => Number(v).toFixed(2) },
    { group: 'Motion', id: 'swayPushZ', label: 'Sway Push Z', min: 0, max: 1.2, step: 0.01, get: () => normalizeGrassConfig().swayPushZ, set: (v) => { normalizeGrassConfig().swayPushZ = Number(v); }, fmt: (v) => Number(v).toFixed(2) },
    { group: 'Motion', id: 'tipNoiseBase', label: 'Tip Noise Base', min: 0, max: 0.3, step: 0.005, get: () => normalizeGrassConfig().tipNoiseBase, set: (v) => { normalizeGrassConfig().tipNoiseBase = Number(v); }, fmt: (v) => Number(v).toFixed(3) },
    { group: 'Motion', id: 'tipNoiseMult', label: 'Tip Noise Mult', min: 0, max: 0.4, step: 0.005, get: () => normalizeGrassConfig().tipNoiseMult, set: (v) => { normalizeGrassConfig().tipNoiseMult = Number(v); }, fmt: (v) => Number(v).toFixed(3) },
    { group: 'Motion', id: 'phaseScaleX', label: 'Phase Scale X', min: 0.001, max: 0.25, step: 0.001, get: () => normalizeGrassConfig().phaseScaleX, set: (v) => { normalizeGrassConfig().phaseScaleX = Number(v); }, fmt: (v) => Number(v).toFixed(3) },
    { group: 'Motion', id: 'phaseScaleZ', label: 'Phase Scale Z', min: 0.001, max: 0.25, step: 0.001, get: () => normalizeGrassConfig().phaseScaleZ, set: (v) => { normalizeGrassConfig().phaseScaleZ = Number(v); }, fmt: (v) => Number(v).toFixed(3) },
    { group: 'Motion', id: 'gustFreqA', label: 'Gust Freq A', min: 0.1, max: 6.0, step: 0.01, get: () => normalizeGrassConfig().gustFreqA, set: (v) => { normalizeGrassConfig().gustFreqA = Number(v); }, fmt: (v) => Number(v).toFixed(2) },
    { group: 'Motion', id: 'gustFreqB', label: 'Gust Freq B', min: 0.1, max: 6.0, step: 0.01, get: () => normalizeGrassConfig().gustFreqB, set: (v) => { normalizeGrassConfig().gustFreqB = Number(v); }, fmt: (v) => Number(v).toFixed(2) },
    { group: 'Motion', id: 'gustAmpA', label: 'Gust Amp A', min: 0, max: 2.0, step: 0.01, get: () => normalizeGrassConfig().gustAmpA, set: (v) => { normalizeGrassConfig().gustAmpA = Number(v); }, fmt: (v) => Number(v).toFixed(2) },
    { group: 'Motion', id: 'gustAmpB', label: 'Gust Amp B', min: 0, max: 2.0, step: 0.01, get: () => normalizeGrassConfig().gustAmpB, set: (v) => { normalizeGrassConfig().gustAmpB = Number(v); }, fmt: (v) => Number(v).toFixed(2) },

    { group: 'Color', id: 'hueMin', label: 'Hue Min', min: 0.0, max: 1.0, step: 0.001, get: () => normalizeGrassConfig().hueMin, set: (v) => { normalizeGrassConfig().hueMin = Number(v); }, fmt: (v) => Number(v).toFixed(3) },
    { group: 'Color', id: 'hueMax', label: 'Hue Max', min: 0.0, max: 1.0, step: 0.001, get: () => normalizeGrassConfig().hueMax, set: (v) => { normalizeGrassConfig().hueMax = Number(v); }, fmt: (v) => Number(v).toFixed(3) },
    { group: 'Color', id: 'satMin', label: 'Saturation Min', min: 0.0, max: 1.0, step: 0.001, get: () => normalizeGrassConfig().satMin, set: (v) => { normalizeGrassConfig().satMin = Number(v); }, fmt: (v) => Number(v).toFixed(3) },
    { group: 'Color', id: 'satMax', label: 'Saturation Max', min: 0.0, max: 1.0, step: 0.001, get: () => normalizeGrassConfig().satMax, set: (v) => { normalizeGrassConfig().satMax = Number(v); }, fmt: (v) => Number(v).toFixed(3) },
    { group: 'Color', id: 'lightMin', label: 'Lightness Min', min: 0.0, max: 1.0, step: 0.001, get: () => normalizeGrassConfig().lightMin, set: (v) => { normalizeGrassConfig().lightMin = Number(v); }, fmt: (v) => Number(v).toFixed(3) },
    { group: 'Color', id: 'lightMax', label: 'Lightness Max', min: 0.0, max: 1.0, step: 0.001, get: () => normalizeGrassConfig().lightMax, set: (v) => { normalizeGrassConfig().lightMax = Number(v); }, fmt: (v) => Number(v).toFixed(3) }
  ];

  let panel = null;
  const controlEls = {};
  let autoApply = true;
  let applyTimer = null;

  const applyAndRegen = () => {
    normalizeGrassConfig();
    CFG.foliage.grassDensityMult = Number(CFG.foliage.grass.densityMult);
    generateGroundCover();
    tickForest(G.clock ? G.clock.elapsedTime : 0);
    refreshReadout();
  };

  const scheduleApply = () => {
    if (!autoApply) return;
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      applyTimer = null;
      applyAndRegen();
    }, 120);
  };

  const snapshot = () => {
    const g = normalizeGrassConfig();
    return {
      chunkSize: CFG.foliage.chunkSize,
      densityNearClear: CFG.foliage.densityNearClear,
      grassPerChunk: CFG.foliage.grassPerChunk,
      grassViewDist: CFG.foliage.grassViewDist,
      windStrength: CFG.foliage.windStrength,
      grass: { ...g }
    };
  };

  const syncInputsFromConfig = () => {
    for (let i = 0; i < sliderDefs.length; i++) {
      const def = sliderDefs[i];
      const refs = controlEls[def.id];
      if (!refs) continue;
      refs.input.value = String(def.get());
    }
    refreshReadout();
  };

  const refreshReadout = () => {
    for (let i = 0; i < sliderDefs.length; i++) {
      const def = sliderDefs[i];
      const refs = controlEls[def.id];
      if (!refs) continue;
      const val = def.get();
      refs.value.textContent = def.fmt ? def.fmt(val) : String(val);
    }
  };

  const applyOverrides = (overrides = {}) => {
    if (!overrides || typeof overrides !== 'object') return;
    const g = normalizeGrassConfig();
    if (overrides.grass && typeof overrides.grass === 'object') {
      for (const [k, v] of Object.entries(overrides.grass)) {
        if (g[k] != null && Number.isFinite(Number(v))) g[k] = Number(v);
      }
    }
    for (const [k, v] of Object.entries(overrides)) {
      if (k === 'grass') continue;
      if (!Number.isFinite(Number(v))) continue;
      const n = Number(v);
      if (k in CFG.foliage) {
        CFG.foliage[k] = n;
      } else if (k in g) {
        g[k] = n;
      }
    }
    CFG.foliage.grassDensityMult = Number(g.densityMult);
  };

  const ensurePanel = () => {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'grass-debug-panel';
    panel.style.cssText = [
      'position:fixed',
      'top:16px',
      'right:16px',
      'z-index:99999',
      'width:380px',
      'padding:12px',
      'border:1px solid rgba(140,220,255,0.7)',
      'border-radius:10px',
      'background:rgba(8,12,18,0.92)',
      'color:#eaf6ff',
      'font:12px/1.4 monospace',
      'box-shadow:0 0 20px rgba(0,0,0,0.45)',
      'backdrop-filter: blur(4px)',
      'pointer-events:auto',
      'display:none',
      'max-height:78vh',
      'overflow:auto'
    ].join(';');

    let rows = '';
    let currentGroup = '';
    for (let i = 0; i < sliderDefs.length; i++) {
      const def = sliderDefs[i];
      if (def.group !== currentGroup) {
        currentGroup = def.group;
        rows += `<div style="margin:10px 0 6px;color:#a7ddff;font-weight:700;letter-spacing:.7px;">${currentGroup}</div>`;
      }
      rows += `
      <div style="margin-bottom:7px;" data-slider="${def.id}">
        <label for="fd-${def.id}">${def.label}</label>
        <input id="fd-${def.id}" type="range" min="${def.min}" max="${def.max}" step="${def.step}" style="width:100%;">
        <div style="text-align:right;color:#9ed8ff;" id="fd-val-${def.id}"></div>
      </div>`;
    }

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="font-size:13px;letter-spacing:.8px;">GRASS DEBUG</strong>
        <button id="fd-close" style="background:#13202e;color:#fff;border:1px solid #345;padding:2px 8px;border-radius:6px;cursor:pointer;">X</button>
      </div>
      <label style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <input type="checkbox" id="fd-auto-apply" checked />
        <span>Auto-apply while dragging</span>
      </label>
      ${rows}
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button id="fd-apply" style="flex:1;background:#134d2e;color:#fff;border:1px solid #2a7;padding:6px 8px;border-radius:6px;cursor:pointer;">Apply + Rebuild</button>
        <button id="fd-reset" style="flex:1;background:#4a2a1a;color:#fff;border:1px solid #8a5233;padding:6px 8px;border-radius:6px;cursor:pointer;">Reset Grass</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button id="fd-refresh" style="flex:1;background:#163447;color:#fff;border:1px solid #2a5678;padding:6px 8px;border-radius:6px;cursor:pointer;">Refresh From CFG</button>
        <button id="fd-copy" style="flex:1;background:#20331a;color:#fff;border:1px solid #456335;padding:6px 8px;border-radius:6px;cursor:pointer;">Copy JSON</button>
      </div>
      <div style="margin-top:10px;color:#93a8bb;">
        Console: <code>window.toggleGrassPanel()</code>
      </div>
    `;
    document.body.appendChild(panel);

    for (let i = 0; i < sliderDefs.length; i++) {
      const def = sliderDefs[i];
      const input = panel.querySelector(`#fd-${def.id}`);
      const value = panel.querySelector(`#fd-val-${def.id}`);
      controlEls[def.id] = { input, value };
      input.addEventListener('input', () => {
        def.set(Number(input.value));
        refreshReadout();
        scheduleApply();
      });
    }
    syncInputsFromConfig();

    const autoEl = panel.querySelector('#fd-auto-apply');
    autoEl.addEventListener('change', () => { autoApply = !!autoEl.checked; });
    panel.querySelector('#fd-close').addEventListener('click', () => { panel.style.display = 'none'; });
    panel.querySelector('#fd-apply').addEventListener('click', applyAndRegen);
    panel.querySelector('#fd-refresh').addEventListener('click', syncInputsFromConfig);
    panel.querySelector('#fd-reset').addEventListener('click', () => {
      CFG.foliage.grass = { ...grassDefaults };
      CFG.foliage.grassDensityMult = grassDefaults.densityMult;
      CFG.foliage.grassPerChunk = 1260;
      CFG.foliage.grassViewDist = 95;
      CFG.foliage.windStrength = 0.45;
      CFG.foliage.chunkSize = 30;
      CFG.foliage.densityNearClear = 0.45;
      syncInputsFromConfig();
      applyAndRegen();
    });
    panel.querySelector('#fd-copy').addEventListener('click', async () => {
      const json = JSON.stringify(snapshot(), null, 2);
      try {
        await navigator.clipboard.writeText(json);
      } catch (_) { }
    });

    return panel;
  };

  window.showGrassPanel = () => {
    const p = ensurePanel();
    p.style.display = 'block';
  };
  window.hideGrassPanel = () => {
    if (panel) panel.style.display = 'none';
  };
  window.toggleGrassPanel = () => {
    const p = ensurePanel();
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
  };
  window.applyGrassSettings = (overrides = {}) => {
    applyOverrides(overrides);
    syncInputsFromConfig();
    applyAndRegen();
    return snapshot();
  };
  window.getGrassSettings = () => snapshot();

  // Backward-compatible aliases for earlier naming.
  window.showFoliageDebugPanel = window.showGrassPanel;
  window.hideFoliageDebugPanel = window.hideGrassPanel;
  window.toggleFoliageDebugPanel = window.toggleGrassPanel;
  window.applyFoliageDebugSettings = window.applyGrassSettings;
}

function startGame() {
  G.state = 'playing';
  G.player.health = CFG.player.health;
  G.player.score = 0;
  G.player.alive = true;

  // Reset upgrades to defaults
  resetUpgrades();
  resetStreak();
  endWeather();

  // Reset stats
  G.stats = { kills: 0, headshots: 0, totalShots: 0, grenadesThrown: 0, damageDealt: 0 };
  G.fallingTrees = [];
  G.activeBoss = null;
  hideDeathRecap();
  G.player.pos.set(0, getTerrainHeight(0, 0) + (CFG.player.eyeHeight || 1.8), 0);
  G.player.vel.set(0, 0, 0);
  G.player.yVel = 0;
  G.player.grounded = true;
  G.player.sliding = false;
  G.player.jumpBuffer = 0;
  G.player.coyoteTimer = 0;
  G.player.lastWallNormal.set(0, 0, 0);
  G.player.wallContactTimer = 0;
  G.camera.position.copy(G.player.pos);
  G.damageFlash = 0;
  G.healFlash = 0;
  G.hitFlash = 0;
  // Grenades reset
  G.grenades.length = 0;
  G.heldGrenade = null;
  G.grenadeCount = 0;

  // Clear enemies
  for (const enemy of G.enemies) {
    G.scene.remove(enemy.mesh);
  }
  G.enemies.length = 0;
  // Clear enemy projectiles
  for (const p of G.enemyProjectiles) {
    G.scene.remove(p.mesh);
  }
  G.enemyProjectiles.length = 0;

  // Clear pickups/orbs
  for (const o of G.orbs) {
    G.scene.remove(o.mesh);
  }
  G.orbs.length = 0;
  // Clear wave powerups
  for (const p of G.powerups || []) {
    if (p && p.mesh) G.scene.remove(p.mesh);
  }
  G.powerups.length = 0;

  // Clear any detached helmets
  for (const h of G.helmets) {
    G.scene.remove(h.mesh);
  }
  G.helmets.length = 0;

  // Clear ejected casings
  for (const c of G.casings) {
    G.scene.remove(c.mesh);
  }
  G.casings.length = 0;

  // Reset waves
  G.waves.current = 1;
  G.waves.aliveCount = 0;
  G.waves.spawnQueue = 0;
  G.waves.nextSpawnTimer = 0;
  G.waves.breakTimer = 0;
  G.waves.inBreak = false;
  G.waves.wolvesToSpawn = 0;
  G.waves.shamansToSpawn = 0;
  G.waves.golemsToSpawn = 0;

  // Reset weapon
  G.weapon.ammo = CFG.gun.magSize;
  G.weapon.reloading = false;
  G.weapon.reloadTimer = 0;
  G.weapon.recoil = 0;
  G.weapon.spread = CFG.gun.spreadMin ?? CFG.gun.bloom ?? 0;
  G.weapon.targetSpread = G.weapon.spread;
  G.weapon.viewPitch = 0;
  G.weapon.viewYaw = 0;
  G.weapon.appliedPitch = 0;
  G.weapon.appliedYaw = 0;
  G.weapon.rofMult = 1;
  G.weapon.rofBuffTimer = 0;
  G.weapon.rofBuffTotal = 0;
  G.movementMult = 1;
  G.movementBuffTimer = 0;
  G.weapon.infiniteAmmoTimer = 0;
  G.weapon.infiniteAmmoTotal = 0;
  G.weapon.ammoBeforeInf = null;
  G.weapon.reserveBeforeInf = null;

  // Reset weapon slots
  G.activeWeaponSlot = 0;
  G.switching = false;
  G.switchTimer = 0;
  if (G.weaponSlots[0]) {
    G.weaponSlots[0].ammo = CFG.gun.magSize;
    G.weaponSlots[0].reserve = Infinity;
    if (G.weaponSlots[0].group) G.weaponSlots[0].group.visible = true;
  }
  if (G.weaponSlots[1]) {
    G.weaponSlots[1].ammo = CFG.shotgun.magSize;
    G.weaponSlots[1].reserve = Infinity;
    if (G.weaponSlots[1].group) G.weaponSlots[1].group.visible = false;
  }
  G.weapon.group = G.weaponSlots[0]?.group || G.weapon.group;
  G.weapon.muzzle = G.weaponSlots[0]?.muzzle || G.weapon.muzzle;
  G.weapon.ejector = G.weaponSlots[0]?.ejector || G.weapon.ejector;
  G.weapon.materials = G.weaponSlots[0]?.materials || G.weapon.materials;
  // Reset slot 2 (sniper)
  if (G.weaponSlots[2]) {
    G.weaponSlots[2].ammo = CFG.sniper.magSize;
    G.weaponSlots[2].reserve = Infinity;
    if (G.weaponSlots[2].group) G.weaponSlots[2].group.visible = false;
  }

  const overlay = document.getElementById('overlay');
  if (overlay) overlay.classList.add('hidden');
  updateHUD();
  // Initialize day/night visuals immediately
  updateDayNight(0);
  startNextWave();
  // Start background music + ambient soundscape (once audio is unlocked)
  startMusic();
  startAmbience();
}

function restartGame() {
  G.controls.lock();
}

function gameOver() {
  G.state = 'gameover';
  G.controls.unlock();
  showOverlay('gameover');
  // Gracefully fade out music and ambience
  stopMusic(0.6);
  stopAmbience(0.6);
  endWeather();
  showDeathRecap();
}

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(G.clock.getDelta(), 0.1);

  if (G.state === 'playing') {
    updatePlayer(delta);
    updateEnemies(delta, gameOver);
    updateEnemyProjectiles(delta, gameOver);
    updateWaves(delta);
    performShooting(delta);
    updateWeapon(delta);
    updatePickups(delta);
    updateHUD();
    updateCrosshair(delta);
    updateHitMarker(delta);
    updateDamageEffect(delta);
    updateHealEffect(delta);

    // Passive regen from Rapid Recovery upgrade
    const regenRate = getRegenRate();
    if (regenRate > 0 && G.player.alive) {
      G.player.health = Math.min(CFG.player.health, G.player.health + regenRate * delta);
    }

    // Update ambient soundscape (day/night + war drums intensity)
    updateAmbience(G.timeOfDay, G.waves.current);

    // Kill streak timer
    updateKillStreak(delta);

    // Weather effects
    updateWeather(delta);

    // Falling trees
    updateFallingTrees(delta);

    // Boss health bar
    if (G.activeBoss) {
      const bossBar = document.getElementById('boss-healthbar');
      const bossFill = document.getElementById('boss-fill');
      if (bossBar && bossFill) {
        if (G.activeBoss.alive) {
          bossBar.style.display = 'block';
          const pct = Math.max(0, G.activeBoss.hp / G.activeBoss.maxHp * 100);
          bossFill.style.width = pct + '%';
        } else {
          bossBar.style.display = 'none';
          G.activeBoss = null;
        }
      }
    }
  }
  updateDayNight(delta);
  updateFX(delta);
  updateHelmets(delta);
  updateCasings(delta);
  // Update grenades and previews last among gameplay
  if (G.state === 'playing') {
    updateGrenades(delta);
    if (!G.player.alive) {
      gameOver();
    }
  }
  updateClouds(delta);
  updateMountains(delta);
  // Update subtle foliage wind sway using elapsedTime (avoid double-advancing clock)
  tickForest(G.clock.elapsedTime);

  G.renderer.render(G.scene, G.camera);

  // Lightweight FPS meter (updates ~2x/sec)
  if (!G._fpsAccum) { G._fpsAccum = 0; G._fpsFrames = 0; G._fpsNext = 0.5; }
  G._fpsAccum += delta; G._fpsFrames++;
  if (G._fpsAccum >= G._fpsNext) {
    const fps = Math.round(G._fpsFrames / G._fpsAccum);
    const el = document.getElementById('fps');
    if (el) {
      el.textContent = String(fps);
    }
    G._fpsAccum = 0; G._fpsFrames = 0;
  }

  // Process a small budget of deferred disposals to avoid spikes
  if (G.disposeQueue && G.disposeQueue.length) {
    const budget = 24; // dispose up to N geometries per frame
    for (let i = 0; i < budget && G.disposeQueue.length; i++) {
      const geom = G.disposeQueue.pop();
      if (geom && geom.dispose) {
        try { geom.dispose(); } catch (e) { /* noop */ }
      }
    }
  }
}

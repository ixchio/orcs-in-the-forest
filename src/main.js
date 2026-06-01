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
import { updateShake, checkAchievements, updateLowHealthWarning, updateDamageDirection, showBestScores, updateHighScores, hideLoadingScreen, updateLoadingProgress, initSettings } from './juice.js';
import { updateFootsteps, updateHeartbeat } from './sfx.js';

updateLoadingProgress(10);
try {
  init();
  updateLoadingProgress(90);
  hideLoadingScreen();
  animate();
} catch (e) {
  console.error('Init failed:', e);
  const tip = document.querySelector('.loading-tip');
  if (tip) tip.textContent = 'Error: ' + e.message;
  hideLoadingScreen();
}

function init() {
  // Renderer
  G.renderer = new THREE.WebGLRenderer({ antialias: true });
  G.renderer.setSize(window.innerWidth, window.innerHeight);
  G.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  G.renderer.shadowMap.enabled = true;
  G.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  G.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  G.renderer.toneMappingExposure = 1.0;
  const container = document.getElementById('game-container') || document.body;
  container.insertBefore(G.renderer.domElement, container.firstChild);

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

  // Initialize settings and show high scores on menu
  initSettings();
  showBestScores();

  // Pre-warm shaders to avoid first-frame hitches
  if (G.renderer && G.scene && G.camera) {
    try { G.renderer.compile(G.scene, G.camera); } catch (_) { }
  }
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
  // Save high scores and show results
  const scores = updateHighScores();
  showOverlay('gameover', scores);
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
          G._bossesKilled = (G._bossesKilled || 0) + 1;
          G.activeBoss = null;
        }
      }
    }

    // New juice systems
    updateLowHealthWarning();
    updateDamageDirection(delta);
    updateFootsteps(delta, G.input.w || G.input.a || G.input.s || G.input.d, G.input.sprint, G.input.crouch, G.player.grounded);
    updateHeartbeat(delta);
    checkAchievements();

    // Melee attack
    if (G.meleeTimer > 0) {
      G.meleeTimer -= delta;
    }
  }
  updateDayNight(delta);
  updateFX(delta);
  updateHelmets(delta);
  updateCasings(delta);
  if (G.state === 'playing') {
    updateGrenades(delta);
    if (!G.player.alive) {
      gameOver();
    }
  }
  updateClouds(delta);
  updateMountains(delta);
  tickForest(G.clock.elapsedTime);
  updateShake(delta);

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

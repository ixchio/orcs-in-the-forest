import * as THREE from 'three';
import { CFG } from './config.js';
import { G } from './globals.js';
import { getTerrainHeight } from './world.js';
import { showWaveBanner } from './hud.js';
import { spawnEnemy } from './enemies.js';
import { spawnAccelerators, spawnInfiniteAmmo } from './pickups.js';
import { showUpgradePicker, getScavengerBonus } from './upgrades.js';
import { maybeStartWeather, endWeather } from './weather.js';

export function startNextWave() {
  const waveCount = Math.min(
    CFG.waves.baseCount + CFG.waves.perWaveAdd * (G.waves.current - 1),
    CFG.waves.maxAlive
  );
  // Add two wolves on top of base wave enemies
  G.waves.spawnQueue = waveCount + 2;
  G.waves.nextSpawnTimer = 0;
  G.waves.shamansToSpawn = 1; // exactly 1 shaman per wave
  G.waves.wolvesToSpawn = 2;  // exactly 2 wolves per wave
  // Golem spawns on wave 3 and every 3 waves thereafter (3,6,9,...)
  const wave = G.waves.current;
  G.waves.golemsToSpawn = (wave >= 3 && ((wave - 3) % 3 === 0)) ? 1 : 0;

  // Choose a single spawn anchor for this wave (not near the center)
  const half = CFG.forestSize / 2;
  const margin = 24;
  const minR = Math.max(CFG.waves.annulusMin, 40);
  const maxR = Math.min(CFG.waves.annulusMax * 2.2, half - margin);
  const angle = G.random() * Math.PI * 2;
  const r = minR + G.random() * (maxR - minR);
  const ax = Math.cos(angle) * r;
  const az = Math.sin(angle) * r;
  G.waves.spawnAnchor = new THREE.Vector3(ax, getTerrainHeight(ax, az), az);

  showWaveBanner(`Wave ${G.waves.current}`);

  // Weather events on waves 4, 8, 12…
  maybeStartWeather(wave);

  // Mega-boss on waves 5, 10, 15… (replaces normal spawn for that wave)
  if (wave >= 5 && wave % 5 === 0) {
    G.waves.megaBossToSpawn = 1;
    showWaveBanner(`⚔️ BOSS WAVE ${wave}`);
  } else {
    G.waves.megaBossToSpawn = 0;
  }

  // Add 2 grenades + scavenger bonus each wave start (stacking)
  G.grenadeCount = (G.grenadeCount || 0) + 2 + getScavengerBonus();

  // Spawn 0..2 accelerator powerups at random locations
  const accelCount = Math.floor(G.random() * 3); // 0,1,2
  if (accelCount > 0) spawnAccelerators(accelCount);
  // Spawn at least 1 infinite ammo on wave 1 for visibility, then occasionally
  const infCount = (G.waves.current === 1) ? 1 : Math.floor(G.random() * 2);
  if (infCount > 0) spawnInfiniteAmmo(infCount);
}

export function updateWaves(delta) {
  if (G.waves.inBreak) {
    // If waiting for upgrade picker, don't count down
    if (G.upgradesPicking) return;

    G.waves.breakTimer -= delta;
    if (G.waves.breakTimer <= 0) {
      G.waves.inBreak = false;
      G.waves.current++;
      startNextWave();
    }
    return;
  }

  // Spawn enemies
  if (G.waves.spawnQueue > 0 && G.waves.aliveCount < CFG.waves.maxAlive) {
    G.waves.nextSpawnTimer -= delta;
    if (G.waves.nextSpawnTimer <= 0) {
      if (G.waves.megaBossToSpawn > 0) {
        spawnEnemy('megaBoss');
        G.waves.megaBossToSpawn--;
      } else if (G.waves.golemsToSpawn > 0) {
        spawnEnemy('golem');
        G.waves.golemsToSpawn--;
      } else if (G.waves.shamansToSpawn > 0) {
        spawnEnemy('shaman');
        G.waves.shamansToSpawn--;
      } else if (G.waves.wolvesToSpawn > 0) {
        spawnEnemy('wolf');
        G.waves.wolvesToSpawn--;
      } else {
        spawnEnemy('orc');
      }
      G.waves.spawnQueue--;
      const spawnRate = Math.max(
        CFG.waves.spawnMin,
        CFG.waves.spawnEvery - CFG.waves.spawnDecay * (G.waves.current - 1)
      );
      G.waves.nextSpawnTimer = spawnRate;
    }
  }

  // Check wave complete
  if (G.waves.spawnQueue === 0 && G.waves.aliveCount === 0) {
    G.waves.inBreak = true;
    G.waves.breakTimer = CFG.waves.breakTime;
    // End weather event when wave completes
    endWeather();
    // Show upgrade picker (skip on wave 1 start since player hasn't beaten a wave yet)
    showUpgradePicker(() => {
      // Picker done — break timer resumes naturally
    });
  }
}

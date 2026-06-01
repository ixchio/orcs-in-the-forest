// Visual juice: screen shake, damage numbers, kill feed, damage direction, low-health warning
import { G } from './globals.js';
import { CFG } from './config.js';

// ─── Screen Shake ───
let shakeIntensity = 0;
let shakeDecay = 8;

export function triggerShake(intensity = 0.5, decay = 8) {
  if (G.settings && !G.settings.screenShake) return;
  shakeIntensity = Math.min(1.5, shakeIntensity + intensity);
  shakeDecay = decay;
}

export function updateShake(delta) {
  if (shakeIntensity <= 0.001) return;
  shakeIntensity = Math.max(0, shakeIntensity - shakeDecay * delta);
  const container = document.getElementById('game-container');
  if (!container) return;
  if (shakeIntensity > 0.001) {
    const x = (Math.random() - 0.5) * shakeIntensity * 12;
    const y = (Math.random() - 0.5) * shakeIntensity * 12;
    container.style.transform = `translate(${x}px, ${y}px)`;
  } else {
    container.style.transform = '';
  }
}

// ─── Damage Numbers ───
export function spawnDamageNumber(worldPos, damage, isHeadshot = false) {
  if (!G.camera || !G.renderer) return;
  const pos = worldPos.clone();
  pos.project(G.camera);
  if (pos.z > 1) return; // behind camera
  const hw = window.innerWidth / 2;
  const hh = window.innerHeight / 2;
  const sx = (pos.x * hw) + hw + (Math.random() - 0.5) * 30;
  const sy = -(pos.y * hh) + hh + (Math.random() - 0.5) * 20;

  const el = document.createElement('div');
  el.className = 'dmg-number' + (isHeadshot ? ' headshot' : '');
  el.textContent = Math.round(damage);
  el.style.left = sx + 'px';
  el.style.top = sy + 'px';
  document.getElementById('hud')?.appendChild(el);
  setTimeout(() => el.remove(), 850);
}

// ─── Kill Feed ───
const ENEMY_NAMES = {
  orc: 'Orc Archer', wolf: 'Dire Wolf', shaman: 'Shaman',
  golem: 'Stone Golem', megaBoss: 'Mega Golem'
};

export function addKillFeedEntry(enemyType, isHeadshot = false) {
  const feed = document.getElementById('kill-feed');
  if (!feed) return;
  const name = ENEMY_NAMES[enemyType] || 'Enemy';
  const el = document.createElement('div');
  el.className = 'kill-entry' + (isHeadshot ? ' headshot' : '');
  el.textContent = isHeadshot ? `☠ ${name} — HEADSHOT` : `✦ Killed ${name}`;
  feed.appendChild(el);
  setTimeout(() => el.remove(), 3200);
  // Keep feed bounded
  while (feed.children.length > 6) feed.removeChild(feed.firstChild);
}

// ─── Damage Direction Indicator ───
let dmgArrows = [];

export function showDamageDirection(fromPos) {
  if (!G.camera || !fromPos) return;
  const dir = fromPos.clone().sub(G.camera.position);
  dir.y = 0;
  const angle = Math.atan2(dir.x, dir.z);
  const camDir = G.camera.getWorldDirection(dir.clone());
  const camAngle = Math.atan2(camDir.x, camDir.z);
  const relative = angle - camAngle;

  dmgArrows.push({ angle: relative, life: 1.0 });
}

export function updateDamageDirection(delta) {
  const container = document.getElementById('damage-direction');
  if (!container) return;

  // Clear and rebuild
  container.innerHTML = '';
  for (let i = dmgArrows.length - 1; i >= 0; i--) {
    dmgArrows[i].life -= delta * 1.5;
    if (dmgArrows[i].life <= 0) { dmgArrows.splice(i, 1); continue; }
    const a = dmgArrows[i];
    const el = document.createElement('div');
    el.className = 'dmg-arrow';
    el.style.opacity = String(a.life);
    // Position on a circle around center
    const r = 80;
    const cx = 100 + Math.sin(a.angle) * r;
    const cy = 100 - Math.cos(a.angle) * r;
    el.style.left = cx + 'px';
    el.style.top = cy + 'px';
    const deg = (a.angle * 180 / Math.PI);
    el.style.transform = `rotate(${deg}deg)`;
    container.appendChild(el);
  }
}

// ─── Low Health Warning ───
export function updateLowHealthWarning() {
  const overlay = document.getElementById('low-health-overlay');
  const fill = document.getElementById('health-fill');
  if (!overlay || !fill) return;

  const pct = G.player.health / CFG.player.health;

  // Health bar color coding
  if (pct <= 0.25) {
    fill.className = 'low';
    overlay.style.opacity = String(0.3 + Math.sin(Date.now() * 0.005) * 0.15);
  } else if (pct <= 0.5) {
    fill.className = 'medium';
    overlay.style.opacity = '0';
  } else {
    fill.className = '';
    overlay.style.opacity = '0';
  }

  // Ammo warning
  const ammoEl = document.getElementById('ammo');
  if (ammoEl && G.weapon.infiniteAmmoTimer <= 0) {
    const wCfg = G.activeWeaponSlot === 2 ? CFG.sniper : G.activeWeaponSlot === 1 ? CFG.shotgun : CFG.gun;
    if (G.weapon.ammo === 0) ammoEl.className = 'hud-value empty';
    else if (G.weapon.ammo <= Math.ceil(wCfg.magSize * 0.25)) ammoEl.className = 'hud-value low';
    else ammoEl.className = 'hud-value';
  }
}

// ─── High Scores (localStorage) ───
const STORAGE_KEY = 'oitf_scores';

function loadScores() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { bestScore: 0, bestWave: 0, totalKills: 0, gamesPlayed: 0 };
  } catch { return { bestScore: 0, bestWave: 0, totalKills: 0, gamesPlayed: 0 }; }
}

function saveScores(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

export function updateHighScores() {
  const data = loadScores();
  let newBest = false;
  if (G.player.score > data.bestScore) { data.bestScore = G.player.score; newBest = true; }
  if (G.waves.current > data.bestWave) { data.bestWave = G.waves.current; newBest = true; }
  data.totalKills += G.stats.kills;
  data.gamesPlayed++;
  saveScores(data);
  return { ...data, newBest };
}

export function showBestScores() {
  const data = loadScores();
  const el = document.getElementById('best-scores');
  if (!el) return;
  if (data.bestScore === 0 && data.bestWave === 0) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="best-item"><div class="best-label">BEST SCORE</div><div class="best-value">${data.bestScore}</div></div>
    <div class="best-item"><div class="best-label">BEST WAVE</div><div class="best-value">${data.bestWave}</div></div>
    <div class="best-item"><div class="best-label">TOTAL KILLS</div><div class="best-value">${data.totalKills}</div></div>
  `;
}

// ─── Achievement System ───
const ACHIEVEMENTS = [
  { id: 'first_blood', name: 'First Blood', desc: 'Kill your first orc', check: () => G.stats.kills >= 1 },
  { id: 'wave5', name: 'Getting Warmed Up', desc: 'Survive 5 waves', check: () => G.waves.current >= 5 },
  { id: 'wave10', name: 'Veteran', desc: 'Survive 10 waves', check: () => G.waves.current >= 10 },
  { id: 'headhunter', name: 'Headhunter', desc: 'Get 10 headshots', check: () => G.stats.headshots >= 10 },
  { id: 'streak5', name: 'Rampage', desc: 'Get a 5× kill streak', check: () => G.killStreak.peakStreak >= 5 },
  { id: 'centurion', name: 'Centurion', desc: 'Kill 100 enemies', check: () => G.stats.kills >= 100 },
  { id: 'boss_slayer', name: 'Boss Slayer', desc: 'Defeat a mega boss', check: () => (G._bossesKilled || 0) >= 1 },
  { id: 'score1000', name: 'High Roller', desc: 'Score 1000 points', check: () => G.player.score >= 1000 },
];

const ACHIEVED_KEY = 'oitf_achievements';
let achievedSet = new Set();

function loadAchievements() {
  try { achievedSet = new Set(JSON.parse(localStorage.getItem(ACHIEVED_KEY)) || []); } catch { achievedSet = new Set(); }
}

function saveAchievements() {
  try { localStorage.setItem(ACHIEVED_KEY, JSON.stringify([...achievedSet])); } catch {}
}

export function checkAchievements() {
  if (achievedSet.size === 0) loadAchievements();
  for (const a of ACHIEVEMENTS) {
    if (achievedSet.has(a.id)) continue;
    if (a.check()) {
      achievedSet.add(a.id);
      saveAchievements();
      showAchievementToast(a.name);
    }
  }
}

function showAchievementToast(name) {
  const el = document.getElementById('achievement-toast');
  if (!el) return;
  el.textContent = `🏆 ${name}`;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}

// ─── Loading Screen ───
export function updateLoadingProgress(pct) {
  const fill = document.getElementById('loading-fill');
  if (fill) fill.style.width = Math.min(100, pct) + '%';
}

export function hideLoadingScreen() {
  const el = document.getElementById('loading-screen');
  if (!el) return;
  el.classList.add('fade-out');
  setTimeout(() => el.remove(), 700);
}

// ─── Settings ───
export function initSettings() {
  G.settings = { masterVol: 0.6, musicVol: 0.18, sensitivity: 1.0, showFps: true, screenShake: true };

  // Load from localStorage
  try {
    const saved = JSON.parse(localStorage.getItem('oitf_settings'));
    if (saved) Object.assign(G.settings, saved);
  } catch {}

  applySettings();
  bindSettingsUI();
}

function applySettings() {
  if (!G.settings) return;
  CFG.audio.master = G.settings.masterVol;
  CFG.audio.musicVol = G.settings.musicVol;

  const fpsCard = document.getElementById('fps-card');
  if (fpsCard) fpsCard.style.display = G.settings.showFps ? '' : 'none';
}

function bindSettingsUI() {
  const master = document.getElementById('set-master');
  const music = document.getElementById('set-music');
  const sens = document.getElementById('set-sensitivity');
  const fps = document.getElementById('set-fps');
  const shake = document.getElementById('set-shake');
  const close = document.getElementById('settings-close-btn');

  if (master) { master.value = G.settings.masterVol * 100; master.oninput = () => { G.settings.masterVol = master.value / 100; saveSettings(); applySettings(); }; }
  if (music) { music.value = G.settings.musicVol * 100; music.oninput = () => { G.settings.musicVol = music.value / 100; saveSettings(); applySettings(); }; }
  if (sens) { sens.value = G.settings.sensitivity * 100; sens.oninput = () => { G.settings.sensitivity = sens.value / 100; saveSettings(); }; }
  if (fps) { fps.className = 'setting-toggle' + (G.settings.showFps ? ' on' : ''); fps.onclick = () => { G.settings.showFps = !G.settings.showFps; fps.className = 'setting-toggle' + (G.settings.showFps ? ' on' : ''); saveSettings(); applySettings(); }; }
  if (shake) { shake.className = 'setting-toggle' + (G.settings.screenShake ? ' on' : ''); shake.onclick = () => { G.settings.screenShake = !G.settings.screenShake; shake.className = 'setting-toggle' + (G.settings.screenShake ? ' on' : ''); saveSettings(); }; }
  if (close) { close.onclick = () => { const ov = document.getElementById('settings-overlay'); if (ov) ov.classList.remove('show'); }; }
}

function saveSettings() {
  try { localStorage.setItem('oitf_settings', JSON.stringify(G.settings)); } catch {}
}

export function toggleSettings() {
  const ov = document.getElementById('settings-overlay');
  if (ov) ov.classList.toggle('show');
}

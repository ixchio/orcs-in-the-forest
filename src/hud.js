import { G } from './globals.js';
import { CFG } from './config.js';
import { getActiveUpgrades } from './upgrades.js';
import { getStreakStats } from './killstreak.js';

// Cache HUD element refs and last values to minimize DOM churn
const HUD = {
  waveEl: /** @type {HTMLElement|null} */(document.getElementById('wave')),
  scoreEl: /** @type {HTMLElement|null} */(document.getElementById('score')),
  enemiesEl: /** @type {HTMLElement|null} */(document.getElementById('enemies')),
  ammoEl: /** @type {HTMLElement|null} */(document.getElementById('ammo')),
  grenadesEl: /** @type {HTMLElement|null} */(document.getElementById('grenades')),
  healthText: /** @type {HTMLElement|null} */(document.getElementById('health-text')),
  healthFill: /** @type {HTMLElement|null} */(document.getElementById('health-fill')),
  powerupsEl: /** @type {HTMLElement|null} */(document.getElementById('powerup-chips')),
  weaponNameEl: /** @type {HTMLElement|null} */(document.getElementById('weapon-name')),
  ch: {
    root: /** @type {HTMLElement|null} */(document.getElementById('crosshair')),
    left: /** @type {HTMLElement|null} */(document.getElementById('ch-left')),
    right: /** @type {HTMLElement|null} */(document.getElementById('ch-right')),
    top: /** @type {HTMLElement|null} */(document.getElementById('ch-top')),
    bottom: /** @type {HTMLElement|null} */(document.getElementById('ch-bottom')),
    hitA1: /** @type {HTMLElement|null} */(document.getElementById('ch-hit-a1')),
    hitA2: /** @type {HTMLElement|null} */(document.getElementById('ch-hit-a2')),
    hitB1: /** @type {HTMLElement|null} */(document.getElementById('ch-hit-b1')),
    hitB2: /** @type {HTMLElement|null} */(document.getElementById('ch-hit-b2')),
    lastGap: -1,
    lastLen: -1,
    hitLen: -1,
    lastHitOpacity: -1,
    hitGap: -1
  },
  last: {
    hp: -1,
    hpPct: -1,
    wave: -1,
    score: -1,
    enemies: -1,
    ammo: '',
    grenades: -1,
    powerupsKey: '',
    weaponSlot: -1,
    upgradesKey: ''
  }
};

export function updateHUD() {
  const hp = Math.ceil(G.player.health);
  const hpPct = Math.max(0, Math.min(1, G.player.health / CFG.player.health));

  if (hp !== HUD.last.hp) {
    HUD.last.hp = hp;
    if (HUD.healthText) HUD.healthText.textContent = String(hp);
  }
  if (Math.abs(hpPct - HUD.last.hpPct) > 0.005) {
    HUD.last.hpPct = hpPct;
    if (HUD.healthFill) HUD.healthFill.style.width = ((hpPct * 100) | 0) + '%';
  }

  if (G.waves.current !== HUD.last.wave) {
    HUD.last.wave = G.waves.current;
    if (HUD.waveEl) HUD.waveEl.textContent = String(G.waves.current);
  }
  if (G.player.score !== HUD.last.score) {
    HUD.last.score = G.player.score;
    if (HUD.scoreEl) HUD.scoreEl.textContent = String(G.player.score);
  }
  if (G.waves.aliveCount !== HUD.last.enemies) {
    HUD.last.enemies = G.waves.aliveCount;
    if (HUD.enemiesEl) HUD.enemiesEl.textContent = String(G.waves.aliveCount);
  }
  let ammoText;
  if (G.weapon.infiniteAmmoTimer > 0) {
    ammoText = '∞/∞';
  } else {
    const reserveText = G.weapon.reserve === Infinity ? '∞' : String(G.weapon.reserve);
    ammoText = `${G.weapon.ammo}/${reserveText}`;
  }
  if (ammoText !== HUD.last.ammo) {
    HUD.last.ammo = ammoText;
    if (HUD.ammoEl) HUD.ammoEl.textContent = ammoText;
  }
  if (G.grenadeCount !== HUD.last.grenades) {
    HUD.last.grenades = G.grenadeCount;
    if (HUD.grenadesEl) HUD.grenadesEl.textContent = String(G.grenadeCount);
  }

  // Weapon name
  if (G.activeWeaponSlot !== HUD.last.weaponSlot) {
    HUD.last.weaponSlot = G.activeWeaponSlot;
    if (HUD.weaponNameEl) {
      const names = ['RIFLE', 'SHOTGUN', 'SNIPER'];
      HUD.weaponNameEl.textContent = names[G.activeWeaponSlot] || 'RIFLE';
    }
  }

  // Active upgrades strip
  const activeUpgrades = getActiveUpgrades();
  const uKey = activeUpgrades.map(u => u.icon + u.stacks).join(',');
  if (uKey !== HUD.last.upgradesKey) {
    HUD.last.upgradesKey = uKey;
    const healthCard = document.getElementById('ui-health');
    let strip = healthCard ? healthCard.querySelector('.upgrade-strip') : null;
    if (!strip && healthCard) {
      strip = document.createElement('div');
      strip.className = 'upgrade-strip';
      healthCard.appendChild(strip);
    }
    if (strip) {
      strip.innerHTML = activeUpgrades.map(u =>
        `<span class="upgrade-strip-icon" title="${u.name} x${u.stacks}">${u.icon}</span>`
      ).join('');
    }
  }

  // Powerup chips next to health
  const active = [];
  if (G.weapon.rofBuffTimer > 0) active.push({ id: 'accelerator', name: 'ACCELERATE', color: 0xffd84d, time: G.weapon.rofBuffTimer });
  if (G.weapon.infiniteAmmoTimer > 0) active.push({ id: 'infinite', name: 'INFINITE AMMO', color: 0x6366f1, time: G.weapon.infiniteAmmoTimer });
  const key = active.map(a => a.id).join(',');
  if (key !== HUD.last.powerupsKey) {
    HUD.last.powerupsKey = key;
    const el = HUD.powerupsEl;
    if (el) {
      // Clear and rebuild chips
      el.innerHTML = '';
      for (const p of active) {
        const chip = document.createElement('div');
        chip.className = 'pu-chip';
        chip.dataset.id = p.id;
        const r = (p.color >> 16) & 255;
        const g = (p.color >> 8) & 255;
        const b = p.color & 255;
        chip.style.borderColor = `rgba(${r},${g},${b},0.75)`;
        chip.style.boxShadow = `0 0 10px rgba(${r},${g},${b},0.35)`;
        chip.style.backgroundColor = `rgba(${r},${g},${b},0.12)`;
        const fill = document.createElement('div');
        fill.className = 'pu-fill';
        fill.style.backgroundColor = `rgba(${r},${g},${b},0.35)`;
        fill.style.width = '100%';
        const text = document.createElement('span');
        text.className = 'pu-text';
        text.textContent = p.name;
        chip.appendChild(fill);
        chip.appendChild(text);
        el.appendChild(chip);
      }
    }
  }
  // Update blink state even if set didn't change
  const el = HUD.powerupsEl;
  if (el) {
    for (const p of active) {
      const chip = el.querySelector(`.pu-chip[data-id="${p.id}"]`);
      if (chip) {
        const shouldBlink = p.time != null && p.time <= 3;
        if (shouldBlink) chip.classList.add('blink'); else chip.classList.remove('blink');
        // Update progress fill width if total known
        const total = (p.id === 'accelerator') ? (G.weapon.rofBuffTotal || 0) : (p.id === 'infinite' ? (G.weapon.infiniteAmmoTotal || 0) : 0);
        const fill = chip.querySelector('.pu-fill');
        if (fill && total > 0 && p.time != null) {
          const t = Math.max(0, Math.min(1, p.time / total));
          fill.style.width = (t * 100).toFixed(1) + '%';
        }
      }
    }
    // Also remove blink from any chips not active
    const nodes = el.querySelectorAll('.pu-chip');
    nodes.forEach(node => {
      const id = node.dataset.id;
      if (!active.find(a => a.id === id)) node.classList.remove('blink');
    });
  }
}

export function showWaveBanner(text) {
  const banner = document.getElementById('wave-banner');
  if (!banner) return;
  banner.textContent = text;
  banner.classList.add('show');
  setTimeout(() => banner.classList.remove('show'), 2000);
}

export function showOverlay(type) {
  const overlay = document.getElementById('overlay');
  const content = document.getElementById('overlay-content');
  if (!overlay || !content) return;

  overlay.classList.remove('hidden');

  if (type === 'paused') {
    content.innerHTML = `
      <h1>Paused</h1>
      <p>Click to Resume</p>
    `;
  } else if (type === 'gameover') {
    content.innerHTML = `
      <h1>You Died</h1>
      <p>Score: ${G.player.score}</p>
      <p>Wave: ${G.waves.current}</p>
      <p>Click to Restart</p>
    `;
  }
}

// Simple red damage overlay that fades over time
export function updateDamageEffect(delta) {
  const el = document.getElementById('damage-overlay');
  if (!el) return;

  // Fade
  G.damageFlash = Math.max(0, G.damageFlash - CFG.hud.damageFadeSpeed * delta);
  const opacity = Math.min(CFG.hud.damageMaxOpacity, G.damageFlash * CFG.hud.damageMaxOpacity);
  el.style.opacity = String(opacity);
}

// Green heal overlay that fades over time
export function updateHealEffect(delta) {
  const el = document.getElementById('heal-overlay');
  if (!el) return;

  G.healFlash = Math.max(0, G.healFlash - CFG.hud.healFadeSpeed * delta);
  const opacity = Math.min(CFG.hud.healMaxOpacity, G.healFlash * CFG.hud.healMaxOpacity);
  el.style.opacity = String(opacity);
}

// Crosshair widening based on current spread
export function updateCrosshair(delta) {
  const { ch } = HUD;
  if (!ch.root || !ch.left || !ch.right || !ch.top || !ch.bottom) return;

  // Convert NDC spread to pixel gap (approximate using viewport width)
  // When crouched, the effective minimum spread is reduced
  const baseMin = (CFG.gun.spreadMin || CFG.gun.bloom || 0);
  const crouchMin = G.input.crouch ? baseMin * (CFG.gun.spreadCrouchMult || 1) : baseMin;
  const ndc = Math.max(G.weapon.spread, crouchMin);
  const baseGap = 6; // px baseline gap
  const gapPx = baseGap + ndc * 0.5 * window.innerWidth; // half-width maps NDC to px
  const armLen = 10 + Math.min(20, ndc * window.innerWidth * 0.4); // grow a bit with spread

  if (Math.abs(gapPx - ch.lastGap) < 0.5 && Math.abs(armLen - ch.lastLen) < 0.5) return;
  ch.lastGap = gapPx;
  ch.lastLen = armLen;

  // Horizontal arms
  ch.left.style.width = armLen + 'px';
  ch.left.style.left = -(gapPx + armLen) + 'px';
  ch.left.style.top = '-1px';
  ch.right.style.width = armLen + 'px';
  ch.right.style.left = gapPx + 'px';
  ch.right.style.top = '-1px';

  // Vertical arms
  ch.top.style.height = armLen + 'px';
  ch.top.style.top = -(gapPx + armLen) + 'px';
  ch.top.style.left = '-1px';
  ch.bottom.style.height = armLen + 'px';
  ch.bottom.style.top = gapPx + 'px';
  ch.bottom.style.left = '-1px';
}

// Small white X that flashes briefly when hitting an enemy
export function updateHitMarker(delta) {
  const { ch } = HUD;
  if (!ch.root || !ch.hitA1 || !ch.hitA2 || !ch.hitB1 || !ch.hitB2) return;

  // Fade out hit flash
  G.hitFlash = Math.max(0, G.hitFlash - (CFG.hud.hitFadeSpeed || 12) * delta);
  const maxOp = (CFG.hud.hitMaxOpacity != null ? CFG.hud.hitMaxOpacity : 0.3);
  const op = Math.max(0, Math.min(maxOp, G.hitFlash));

  // Only touch DOM when something changed
  if (Math.abs(op - ch.lastHitOpacity) > 0.01) {
    ch.lastHitOpacity = op;
    ch.hitA1.style.opacity = String(op);
    ch.hitA2.style.opacity = String(op);
    ch.hitB1.style.opacity = String(op);
    ch.hitB2.style.opacity = String(op);
  }

  // Size and placement: four segments with a center gap
  const L = (CFG.hud.hitSize || 16) | 0; // length of each segment in px
  const extra = (CFG.hud.hitGapExtra || 6) | 0;
  const baseGap = ch.lastGap >= 0 ? ch.lastGap : 10; // from crosshair
  const gap = baseGap + extra; // ensure larger than crosshair gap
  if (L !== ch.hitLen || Math.abs(gap - ch.hitGap) > 0.5) {
    ch.hitLen = L;
    ch.hitGap = gap;
    // Distance from center to each segment center along the diagonal
    const d = gap + L * 0.5;
    const s = Math.SQRT1_2; // 1 / sqrt(2)
    const dx = d * s;
    const dy = d * s;
    const leftBase = (v) => (v - L * 0.5) + 'px';
    const topBase = (v) => (v - 1) + 'px'; // thickness ~2px

    // A diagonal (+45deg): NE and SW
    ch.hitA1.style.width = L + 'px';
    ch.hitA1.style.left = leftBase(dx);
    ch.hitA1.style.top = topBase(dy);
    ch.hitA1.style.transform = 'rotate(45deg)';

    ch.hitA2.style.width = L + 'px';
    ch.hitA2.style.left = leftBase(-dx);
    ch.hitA2.style.top = topBase(-dy);
    ch.hitA2.style.transform = 'rotate(45deg)';

    // B diagonal (-45deg): NW and SE
    ch.hitB1.style.width = L + 'px';
    ch.hitB1.style.left = leftBase(-dx);
    ch.hitB1.style.top = topBase(dy);
    ch.hitB1.style.transform = 'rotate(-45deg)';

    ch.hitB2.style.width = L + 'px';
    ch.hitB2.style.left = leftBase(dx);
    ch.hitB2.style.top = topBase(-dy);
    ch.hitB2.style.transform = 'rotate(-45deg)';
  }
}

export function showDeathRecap() {
  const el = document.getElementById('death-recap');
  if (!el) return;
  const s = G.stats;
  const streak = getStreakStats();
  const hsRate = s.totalShots > 0 ? Math.round((s.headshots / s.kills) * 100) : 0;

  el.innerHTML = `
    <div class="recap-title">AFTER ACTION REPORT</div>
    <div class="recap-stats">
      <div class="recap-row"><span class="recap-label">Waves Survived</span><span class="recap-value">${G.waves.current}</span></div>
      <div class="recap-row"><span class="recap-label">Enemies Killed</span><span class="recap-value">${s.kills}</span></div>
      <div class="recap-row"><span class="recap-label">Headshot Rate</span><span class="recap-value">${hsRate}%</span></div>
      <div class="recap-row"><span class="recap-label">Longest Kill Streak</span><span class="recap-value">×${streak.peakStreak}</span></div>
      <div class="recap-row"><span class="recap-label">Damage Dealt</span><span class="recap-value">${Math.round(s.damageDealt)}</span></div>
      <div class="recap-row"><span class="recap-label">Final Score</span><span class="recap-value">${Math.round(G.player.score)}</span></div>
    </div>
  `;
  el.style.display = 'block';
}

export function hideDeathRecap() {
  const el = document.getElementById('death-recap');
  if (el) el.style.display = 'none';
}

// Roguelite upgrade picker between waves
import { CFG } from './config.js';
import { G } from './globals.js';
import { playPowerupPickup } from './audio.js';

// Snapshot defaults on first call so upgrades can reset cleanly
function ensureDefaults() {
    if (G._defaults) return;
    G._defaults = {
        magSize: CFG.gun.magSize,
        shotgunMagSize: CFG.shotgun.magSize,
        playerHealth: CFG.player.health,
        playerSpeed: CFG.player.speed,
        reloadTime: CFG.gun.reloadTime,
        shotgunReloadTime: CFG.shotgun.reloadTime,
        gunDamage: CFG.gun.damage,
        shotgunDamage: CFG.shotgun.damage,
        gunRof: CFG.gun.rof,
        shotgunRof: CFG.shotgun.rof,
        headshotMult: CFG.gun.headshotMult,
        shotgunHeadshotMult: CFG.shotgun.headshotMult,
        grenadeRadius: CFG.grenade.radius
    };
}

export function resetUpgrades() {
    ensureDefaults();
    const d = G._defaults;
    // Reset all stacks
    for (const key in G.upgrades) G.upgrades[key] = 0;
    // Revert CFG values
    CFG.gun.magSize = d.magSize;
    CFG.shotgun.magSize = d.shotgunMagSize;
    CFG.player.health = d.playerHealth;
    CFG.player.speed = d.playerSpeed;
    CFG.gun.reloadTime = d.reloadTime;
    CFG.shotgun.reloadTime = d.shotgunReloadTime;
    CFG.gun.damage = d.gunDamage;
    CFG.shotgun.damage = d.shotgunDamage;
    CFG.gun.rof = d.gunRof;
    CFG.shotgun.rof = d.shotgunRof;
    CFG.gun.headshotMult = d.headshotMult;
    CFG.shotgun.headshotMult = d.shotgunHeadshotMult;
    CFG.grenade.radius = d.grenadeRadius;
}

export function applyUpgrade(id) {
    ensureDefaults();
    const d = G._defaults;
    G.upgrades[id] = (G.upgrades[id] || 0) + 1;
    const stacks = G.upgrades[id];

    switch (id) {
        case 'extMag':
            CFG.gun.magSize = d.magSize + stacks * 8;
            CFG.shotgun.magSize = d.shotgunMagSize + stacks * 2;
            break;
        case 'hollowPoint':
            CFG.gun.damage = Math.round(d.gunDamage * (1 + stacks * 0.15));
            CFG.shotgun.damage = Math.round(d.shotgunDamage * (1 + stacks * 0.15));
            // Tradeoff: −10% fire rate per stack
            CFG.gun.rof = d.gunRof * (1 - stacks * 0.10);
            CFG.shotgun.rof = d.shotgunRof * (1 - stacks * 0.10);
            break;
        case 'adrenaline':
            // Speed scales with low health at runtime — handled in player.js
            // Just mark stacks, no static config change
            break;
        case 'quickHands':
            CFG.gun.reloadTime = d.reloadTime * Math.pow(0.75, stacks);
            CFG.shotgun.reloadTime = d.shotgunReloadTime * Math.pow(0.75, stacks);
            break;
        case 'shrapnel':
            CFG.grenade.radius = d.grenadeRadius * (1 + stacks * 0.50);
            break;
        case 'thickSkin': {
            const newMax = d.playerHealth + stacks * 25;
            CFG.player.health = newMax;
            // Also heal the bonus amount immediately
            G.player.health = Math.min(newMax, G.player.health + 25);
            break;
        }
        case 'deadEye':
            CFG.gun.headshotMult = d.headshotMult + stacks * 0.50;
            CFG.shotgun.headshotMult = d.shotgunHeadshotMult + stacks * 0.50;
            break;
        // vampiric, scavenger, regen are checked at runtime in other files
    }
}

/**
 * Returns the per-kill heal amount from Vampiric Rounds (0 if no stacks)
 */
export function getVampiricHeal() {
    const s = G.upgrades.vampiric || 0;
    return s > 0 ? 5 + (s - 1) * 3 : 0;
}

/**
 * Returns extra grenades per wave from Scavenger
 */
export function getScavengerBonus() {
    return G.upgrades.scavenger || 0;
}

/**
 * Returns HP/s regen from Rapid Recovery
 */
export function getRegenRate() {
    const s = G.upgrades.regen || 0;
    return s * 2;
}

// --- UI ---

let onPickComplete = null;

export function showUpgradePicker(callback) {
    ensureDefaults();
    G.upgradesPicking = true;
    onPickComplete = callback;

    // Pick 3 random upgrades (that haven't hit max stacks)
    const pool = CFG.upgrades.filter(u => (G.upgrades[u.id] || 0) < u.maxStacks);
    // Shuffle and take 3
    const shuffled = pool.sort(() => G.random() - 0.5);
    const picks = shuffled.slice(0, Math.min(3, shuffled.length));

    // If no upgrades available, skip
    if (picks.length === 0) {
        G.upgradesPicking = false;
        if (callback) callback();
        return;
    }

    const overlay = document.getElementById('upgrade-overlay');
    if (!overlay) {
        G.upgradesPicking = false;
        if (callback) callback();
        return;
    }

    // Build cards
    let html = '<div class="upgrade-title">CHOOSE AN UPGRADE</div><div class="upgrade-cards">';
    for (const u of picks) {
        const currentStacks = G.upgrades[u.id] || 0;
        const stackDots = Array.from({ length: u.maxStacks }, (_, i) =>
            `<span class="stack-dot ${i < currentStacks ? 'filled' : ''}"></span>`
        ).join('');
        html += `
      <div class="upgrade-card" data-upgrade-id="${u.id}">
        <div class="upgrade-icon">${u.icon}</div>
        <div class="upgrade-name">${u.name}</div>
        <div class="upgrade-desc">${u.desc}</div>
        <div class="upgrade-stacks">${stackDots}</div>
      </div>`;
    }
    html += '</div>';
    overlay.innerHTML = html;
    overlay.classList.remove('hidden');
    overlay.style.pointerEvents = 'auto';

    // Animate in
    requestAnimationFrame(() => {
        overlay.classList.add('show');
    });

    // Bind click handlers
    const cards = overlay.querySelectorAll('.upgrade-card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.upgradeId;
            applyUpgrade(id);
            try { playPowerupPickup(); } catch { }

            // Animate out
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.classList.add('hidden');
                overlay.style.pointerEvents = 'none';
                G.upgradesPicking = false;
                if (onPickComplete) {
                    const cb = onPickComplete;
                    onPickComplete = null;
                    cb();
                }
            }, 300);
        });
    });
}

/**
 * Returns a list of active upgrade {icon, name, stacks} for HUD display
 */
export function getActiveUpgrades() {
    const result = [];
    for (const u of CFG.upgrades) {
        const s = G.upgrades[u.id] || 0;
        if (s > 0) result.push({ icon: u.icon, name: u.name, stacks: s, maxStacks: u.maxStacks });
    }
    return result;
}

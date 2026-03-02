// Kill streak / combo system — rolling 3-second window
import { G } from './globals.js';

const WINDOW = 3.0; // seconds

export function registerKill() {
    const now = performance.now() / 1000;
    G.killStreak.kills.push(now);
    // Prune old kills
    while (G.killStreak.kills.length > 0 && now - G.killStreak.kills[0] > WINDOW) {
        G.killStreak.kills.shift();
    }
    const count = G.killStreak.kills.length;
    G.killStreak.multiplier = Math.max(1, count);
    G.killStreak.displayTimer = 2.5; // keep showing for 2.5s after last kill
    if (count > G.killStreak.peakStreak) {
        G.killStreak.peakStreak = count;
    }
    updateDisplay();
}

export function getScoreMultiplier() {
    return G.killStreak.multiplier;
}

export function getStreakStats() {
    return { peakStreak: G.killStreak.peakStreak };
}

export function resetStreak() {
    G.killStreak.kills = [];
    G.killStreak.multiplier = 1;
    G.killStreak.displayTimer = 0;
    G.killStreak.peakStreak = 0;
    const el = document.getElementById('streak-display');
    if (el) { el.style.opacity = '0'; el.textContent = ''; }
}

export function updateKillStreak(delta) {
    const now = performance.now() / 1000;
    // Prune old kills
    while (G.killStreak.kills.length > 0 && now - G.killStreak.kills[0] > WINDOW) {
        G.killStreak.kills.shift();
    }
    const count = G.killStreak.kills.length;
    G.killStreak.multiplier = count >= 2 ? count : 1;

    // Fade display
    if (G.killStreak.displayTimer > 0) {
        G.killStreak.displayTimer -= delta;
        if (G.killStreak.displayTimer <= 0 || count < 2) {
            const el = document.getElementById('streak-display');
            if (el) { el.style.opacity = '0'; }
        }
    }
}

function updateDisplay() {
    const el = document.getElementById('streak-display');
    if (!el) return;
    const m = G.killStreak.multiplier;
    if (m >= 2) {
        el.textContent = `×${m} KILL STREAK`;
        el.style.opacity = '1';
        el.style.transform = 'scale(1)';
        // Pulse animation
        el.classList.remove('streak-pulse');
        void el.offsetWidth; // reflow
        el.classList.add('streak-pulse');
        // Color based on multiplier
        if (m >= 6) el.style.color = '#ff4444';
        else if (m >= 4) el.style.color = '#ffaa22';
        else el.style.color = '#ffd700';
    } else {
        el.style.opacity = '0';
    }
}

// Additional sound effects: footsteps, impacts, melee, enemy sounds, heartbeat
import { CFG } from './config.js';
import { G } from './globals.js';

let ctx = null;
let master = null;

function ensureCtx() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = CFG.audio?.master ?? 0.6;
  master.connect(ctx.destination);
  if (ctx.state === 'suspended') ctx.resume();
}

function noise(dur, freq = 2000, vol = 0.15, type = 'bandpass') {
  ensureCtx();
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = type; bp.frequency.value = freq; bp.Q.value = 1;
  const g = ctx.createGain(); g.gain.value = vol * (CFG.audio?.master ?? 0.6);
  src.connect(bp).connect(g).connect(master);
  src.start(); src.stop(ctx.currentTime + dur + 0.01);
}

function tone(freq, dur, vol = 0.1, type = 'sine') {
  ensureCtx();
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(vol * (CFG.audio?.master ?? 0.6), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.01);
}

// ─── Footsteps ───
let footstepTimer = 0;
let footstepAlt = false;

export function updateFootsteps(delta, moving, sprinting, crouching, grounded) {
  if (!moving || !grounded) { footstepTimer = 0; return; }
  const interval = sprinting ? 0.28 : crouching ? 0.55 : 0.38;
  footstepTimer += delta;
  if (footstepTimer >= interval) {
    footstepTimer -= interval;
    playFootstep(sprinting);
  }
}

function playFootstep(sprint) {
  footstepAlt = !footstepAlt;
  const freq = footstepAlt ? 180 : 220;
  const vol = sprint ? 0.08 : 0.05;
  noise(0.06, freq, vol, 'lowpass');
  // Subtle crunch
  noise(0.03, 3000 + Math.random() * 1000, vol * 0.3, 'highpass');
}

// ─── Hit Impacts ───
export function playFleshHit() {
  noise(0.08, 800, 0.12, 'lowpass');
  tone(120, 0.06, 0.06);
}

export function playMetalHit() {
  tone(2400 + Math.random() * 800, 0.08, 0.1, 'sine');
  tone(4800 + Math.random() * 1200, 0.04, 0.06, 'sine');
  noise(0.03, 5000, 0.06, 'highpass');
}

export function playWoodHit() {
  noise(0.06, 600, 0.08, 'bandpass');
  tone(200, 0.05, 0.05, 'triangle');
}

// ─── Melee ───
export function playMeleeSwing() {
  ensureCtx();
  const len = Math.floor(ctx.sampleRate * 0.12);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / len;
    ch[i] = (Math.random() * 2 - 1) * (1 - t) * Math.sin(t * Math.PI * 8);
  }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 800;
  const g = ctx.createGain(); g.gain.value = 0.15 * (CFG.audio?.master ?? 0.6);
  src.connect(hp).connect(g).connect(master);
  src.start();
}

export function playMeleeHit() {
  noise(0.1, 400, 0.2, 'lowpass');
  tone(80, 0.12, 0.1, 'sine');
}

// ─── Enemy Sounds ───
export function playEnemyDeath() {
  tone(180, 0.15, 0.08, 'sawtooth');
  tone(120, 0.2, 0.06, 'triangle');
  noise(0.1, 500, 0.06, 'bandpass');
}

export function playEnemyAlert() {
  tone(300, 0.1, 0.04, 'square');
  tone(400, 0.08, 0.03, 'square');
}

// ─── Grenade Bounce ───
export function playGrenadeBounce() {
  tone(800, 0.04, 0.08, 'sine');
  tone(600, 0.03, 0.06, 'sine');
  noise(0.02, 2000, 0.04, 'highpass');
}

// ─── Dry Fire Click ───
export function playDryFire() {
  tone(1200, 0.02, 0.08, 'sine');
  noise(0.01, 4000, 0.05, 'highpass');
}

// ─── Low Health Heartbeat ───
let heartbeatTimer = 0;

export function updateHeartbeat(delta) {
  if (!G.player || !G.player.alive) return;
  const pct = G.player.health / CFG.player.health;
  if (pct > 0.25) { heartbeatTimer = 0; return; }

  const interval = 0.6 + pct * 1.4; // faster when lower
  heartbeatTimer += delta;
  if (heartbeatTimer >= interval) {
    heartbeatTimer -= interval;
    playHeartbeat(pct);
  }
}

function playHeartbeat(pct) {
  const vol = 0.08 * (1 - pct * 2);
  // Double thump
  tone(50, 0.12, vol, 'sine');
  setTimeout(() => tone(40, 0.1, vol * 0.7, 'sine'), 120);
}

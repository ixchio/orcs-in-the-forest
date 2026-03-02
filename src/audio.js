// Lightweight Web Audio synth for SFX
import { CFG } from './config.js';

let ctx = null;
let master = null;
let musicBus = null;
let musicState = null;

function ensureContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = (CFG.audio && CFG.audio.master != null) ? CFG.audio.master : 0.6;
    master.connect(ctx.destination);
    // Dedicated bus for background music so we can control it separately
    musicBus = ctx.createGain();
    musicBus.gain.value = (CFG.audio && CFG.audio.musicVol != null) ? CFG.audio.musicVol : 0.18;
    musicBus.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function initAudio() {
  ensureContext();
}

export function resumeAudio() {
  ensureContext();
}

// -------------------------------
// Background music (8-bit style)
// -------------------------------

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function envGain(at, g, a = 0.004, d = 0.18, level = 1.0) {
  g.gain.cancelScheduledValues(at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(level, at + a);
  g.gain.exponentialRampToValueAtTime(0.0001, at + d);
}

function note(at, midi, dur = 0.15, type = 'square', gainMul = 0.25, dest = musicBus) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(midiToFreq(midi), at);
  const g = ctx.createGain();
  envGain(at, g, 0.003, Math.max(0.06, dur), gainMul);
  o.connect(g).connect(dest);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function kick(at, vol = 0.5) {
  const o = ctx.createOscillator(); o.type = 'sine';
  const g = ctx.createGain();
  // Pitch decay for punchy kick
  o.frequency.setValueAtTime(130, at);
  o.frequency.exponentialRampToValueAtTime(48, at + 0.12);
  envGain(at, g, 0.002, 0.16, vol * 0.9);
  o.connect(g).connect(musicBus);
  o.start(at); o.stop(at + 0.2);
}

function snare(at, vol = 0.35) {
  const len = Math.floor(ctx.sampleRate * 0.12);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = b.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = b;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.9;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 600;
  const g = ctx.createGain(); envGain(at, g, 0.001, 0.13, vol);
  src.connect(hp).connect(bp).connect(g).connect(musicBus);
  src.start(at); src.stop(at + 0.14);
}

function hat(at, vol = 0.15) {
  const len = Math.floor(ctx.sampleRate * 0.04);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = b.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = b;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4000;
  const g = ctx.createGain(); envGain(at, g, 0.0006, 0.06, vol);
  src.connect(hp).connect(g).connect(musicBus);
  src.start(at); src.stop(at + 0.06);
}

// Scale: natural minor (Aeolian)
const SCALE = [0, 2, 3, 5, 7, 8, 10];
function degreeToMidi(rootMidi, deg, octaveOffset = 0) {
  const idx = ((deg % 7) + 7) % 7;
  const oct = Math.floor(deg / 7) + octaveOffset;
  return rootMidi + SCALE[idx] + 12 * oct;
}

function makeMusicState() {
  const tempo = (CFG.audio && CFG.audio.musicTempo) || 138;
  const spb = 60 / tempo; // seconds per quarter note
  return {
    running: false,
    tempo,
    spb,
    stepDur: spb / 4, // 16th notes
    nextTime: 0,
    step: 0,
    timer: null,
    lookaheadMs: 25,
    scheduleHorizon: 0.2,
    // musical state
    rootMidi: 45, // A2 base root
    barLen: 16,   // 16th steps per bar
    // choose a fresh progression occasionally
    progression: pickProgression(),
    barInProg: 0
  };
}

function pickProgression() {
  // Common minor progressions (degrees in natural minor)
  const progs = [
    [0, 5, 2, 6],   // i - VI - III - VII
    [0, 3, 6, 2],   // i - iv - VII - III
    [0, 5, 6, 4],   // i - VI - VII - v
    [0, 2, 5, 6]    // i - III - VI - VII
  ];
  return progs[(Math.random() * progs.length) | 0];
}

function currentChordDegrees(ms) {
  const deg = ms.progression[ms.barInProg % ms.progression.length];
  return [deg, deg + 2, deg + 4];
}

function scheduleMusic(ms) {
  const now = ctx.currentTime;
  while (ms.nextTime < now + ms.scheduleHorizon) {
    const t = ms.nextTime;
    const stepInBar = ms.step % ms.barLen;
    const barIdx = Math.floor(ms.step / ms.barLen);

    if (stepInBar === 0 && barIdx % 4 === 0 && Math.random() < 0.5) {
      // Occasionally change progression for variety
      ms.progression = pickProgression();
    }
    if (stepInBar === 0) {
      ms.barInProg = (ms.barInProg + 1) % ms.progression.length;
    }

    const triad = currentChordDegrees(ms);

    // Drums
    if (stepInBar === 0 || stepInBar === 8) kick(t, 0.5);
    if (stepInBar === 4 || stepInBar === 12) snare(t, 0.32);
    if (stepInBar % 2 === 0) hat(t, (stepInBar % 4 === 0) ? 0.12 : 0.10);

    // Bass (triangle) on 8ths
    if (stepInBar % 2 === 0) {
      const bassDeg = (stepInBar < 8) ? triad[0] : (Math.random() < 0.5 ? triad[0] : triad[2]);
      const bassMidi = degreeToMidi(ms.rootMidi, bassDeg - 7, 0); // keep it low
      note(t, bassMidi, ms.stepDur * 1.6, 'triangle', 0.22);
    }

    // Arpeggio (square) on 16ths
    {
      const arpIdx = (stepInBar % 8);
      const choice = [triad[0], triad[1], triad[2], triad[1], triad[0], triad[1], triad[2], triad[1]][arpIdx];
      const octaveLift = (stepInBar >= 8) ? 1 : 0;
      const arpMidi = degreeToMidi(ms.rootMidi + 12, choice, octaveLift);
      note(t, arpMidi, ms.stepDur * 0.9, 'square', 0.14);
    }

    // Occasional lead blip
    if (stepInBar === 7 && Math.random() < 0.5) {
      const leadDeg = triad[2] + 2; // a step above the fifth
      const leadMidi = degreeToMidi(ms.rootMidi + 24, leadDeg, 0);
      note(t, leadMidi, ms.stepDur * 2.5, 'square', 0.12);
    }

    ms.nextTime += ms.stepDur;
    ms.step++;
  }
}

function tickScheduler() {
  if (!musicState || !musicState.running) return;
  scheduleMusic(musicState);
}

export function startMusic() {
  if (CFG.audio && CFG.audio.musicEnabled === false) return;
  ensureContext();
  if (musicState && musicState.running) return; // already running
  if (!musicState) musicState = makeMusicState();
  // Recreate in case tempo changed
  const tempo = (CFG.audio && CFG.audio.musicTempo) || musicState.tempo || 138;
  musicState.tempo = tempo;
  musicState.spb = 60 / tempo;
  musicState.stepDur = musicState.spb / 4;
  musicState.nextTime = ctx.currentTime + 0.05;
  musicState.step = 0;
  musicState.running = true;
  // Smoothly set bus gain to configured level
  const target = (CFG.audio && CFG.audio.musicVol != null) ? CFG.audio.musicVol : 0.18;
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
  musicBus.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.25);
  if (musicState.timer) clearInterval(musicState.timer);
  musicState.timer = setInterval(tickScheduler, musicState.lookaheadMs);
}

export function stopMusic(fade = 0.4) {
  if (!musicState || !musicState.running) return;
  musicState.running = false;
  if (musicState.timer) { clearInterval(musicState.timer); musicState.timer = null; }
  // Fade out the bus quickly
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setValueAtTime(musicBus.gain.value, t);
  musicBus.gain.linearRampToValueAtTime(0.0001, t + fade);
}

// Simple gunshot: noise burst + filtered click + low thump
export function playGunshot() {
  ensureContext();
  const t0 = ctx.currentTime;

  // White noise burst
  const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.9;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 800;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(6000, t0);
  lp.frequency.exponentialRampToValueAtTime(1200, t0 + 0.12);

  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.0, t0);
  nGain.gain.linearRampToValueAtTime((CFG.audio?.gunshotVol ?? 0.9) * 0.7, t0 + 0.002);
  nGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);

  noise.connect(hp).connect(lp).connect(nGain).connect(master);
  noise.start(t0);
  noise.stop(t0 + 0.13);

  // Low thump
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, t0);
  osc.frequency.exponentialRampToValueAtTime(60, t0 + 0.12);
  const oGain = ctx.createGain();
  oGain.gain.setValueAtTime(0.0, t0);
  oGain.gain.linearRampToValueAtTime((CFG.audio?.gunshotVol ?? 0.9) * 0.3, t0 + 0.005);
  oGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
  osc.connect(oGain).connect(master);
  osc.start(t0);
  osc.stop(t0 + 0.16);
}

// Headshot: bright, short bell with slight pitch down
export function playHeadshot() {
  ensureContext();
  const t0 = ctx.currentTime;
  const baseVol = (CFG.audio?.headshotVol ?? 0.8);

  // Two detuned triangles
  const makeVoice = (freq, detune) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t0);
    o.detune.setValueAtTime(detune, t0);
    o.frequency.exponentialRampToValueAtTime(freq * 0.75, t0 + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0, t0);
    g.gain.linearRampToValueAtTime(baseVol * 0.45, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
    o.connect(g);
    return { o, g };
  };

  const v1 = makeVoice(1100, 0);
  const v2 = makeVoice(1100 * 1.5, 8);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(1500, t0);
  bp.Q.value = 3;

  v1.g.connect(bp);
  v2.g.connect(bp);
  bp.connect(master);

  v1.o.start(t0); v1.o.stop(t0 + 0.24);
  v2.o.start(t0); v2.o.stop(t0 + 0.24);

  // Tiny click to emphasize
  const click = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.01), ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
  click.buffer = buf;
  const cGain = ctx.createGain();
  cGain.gain.value = baseVol * 0.25;
  click.connect(cGain).connect(master);
  click.start(t0);
}

// Explosion: bass thump + noise burst with decay
export function playExplosion() {
  ensureContext();
  const t0 = ctx.currentTime;
  const masterVol = (CFG.audio?.master ?? 0.6);
  const base = 0.9 * masterVol;

  // Low boom
  const boom = ctx.createOscillator();
  boom.type = 'sine';
  boom.frequency.setValueAtTime(120, t0);
  boom.frequency.exponentialRampToValueAtTime(45, t0 + 0.5);
  const bGain = ctx.createGain();
  bGain.gain.setValueAtTime(0.0001, t0);
  bGain.gain.linearRampToValueAtTime(base * 0.8, t0 + 0.02);
  bGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
  boom.connect(bGain).connect(master);
  boom.start(t0); boom.stop(t0 + 0.9);

  // Noise blast (band-limited)
  const len = Math.floor(ctx.sampleRate * 0.4);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 80;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.0001, t0);
  nGain.gain.linearRampToValueAtTime(base * 0.7, t0 + 0.01);
  nGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
  noise.connect(hp).connect(lp).connect(nGain).connect(master);
  noise.start(t0); noise.stop(t0 + 0.5);
}

// Shimmery pickup chime for powerups
export function playPowerupPickup() {
  ensureContext();
  const t0 = ctx.currentTime;
  const vol = (CFG.audio?.pickupVol ?? 1.0);

  // Bell-like "gling": bright metallic ping with tiny upward gliss and sparkle
  const makeGling = (at, freq, dur, level) => {
    const o = ctx.createOscillator(); o.type = 'sine';
    const m = ctx.createOscillator(); m.type = 'sine';
    const mg = ctx.createGain(); mg.gain.value = freq * 1.15; // FM index
    m.connect(mg).connect(o.frequency);

    // Slight upward glide for a cheerful attack
    o.frequency.setValueAtTime(freq * 0.94, at);
    o.frequency.exponentialRampToValueAtTime(freq, at + 0.04);
    m.frequency.setValueAtTime(freq * 1.6, at);
    m.frequency.exponentialRampToValueAtTime(freq * 1.9, at + 0.04);

    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 12; bp.frequency.value = freq * 1.15;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(level * vol, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    o.connect(bp).connect(g).connect(master);
    o.start(at); m.start(at);
    o.stop(at + dur + 0.02); m.stop(at + dur + 0.02);
  };

  makeGling(t0 + 0.00, 1800, 0.28, 0.55);
  makeGling(t0 + 0.02, 2400, 0.22, 0.40);

  // Sparkle tail
  const len = Math.floor(ctx.sampleRate * 0.06);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = b.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = b;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
  const g2 = ctx.createGain();
  const t1 = t0 + 0.015;
  g2.gain.setValueAtTime(0.0001, t1);
  g2.gain.linearRampToValueAtTime(0.18 * vol, t1 + 0.01);
  g2.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.08);
  src.connect(hp).connect(g2).connect(master);
  src.start(t1); src.stop(t1 + 0.10);
}

// FM metal ping helper
function fmPing(t, { freq = 650, mod = 1200, index = 1.2, dur = 0.14, gain = 0.28, bpFreq = 1800, q = 8 }) {
  const o = ctx.createOscillator(); o.type = 'sine';
  const m = ctx.createOscillator(); m.type = 'sine';
  const mg = ctx.createGain(); mg.gain.value = freq * index;
  m.connect(mg).connect(o.frequency);
  o.frequency.setValueAtTime(freq, t);
  m.frequency.setValueAtTime(mod, t);

  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q; bp.frequency.value = bpFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain * (CFG.audio?.reloadVol ?? 0.7), t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  o.connect(bp).connect(g).connect(master);
  o.start(t); m.start(t);
  o.stop(t + dur + 0.02); m.stop(t + dur + 0.02);
}

function tick(t, len = 0.012, gain = 0.18) {
  const src = ctx.createBufferSource();
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
  const ch = b.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
  src.buffer = b;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000;
  const g = ctx.createGain(); g.gain.value = gain * (CFG.audio?.reloadVol ?? 0.7);
  src.connect(hp).connect(g).connect(master);
  src.start(t); src.stop(t + len + 0.005);
}

// Start-of-reload metallic cue (short, crisp)
export function playReloadStart() {
  ensureContext();
  const t0 = ctx.currentTime;
  fmPing(t0 + 0.0, { freq: 900, mod: 1800, index: 1.4, dur: 0.10, gain: 0.22, bpFreq: 2200, q: 10 });
  tick(t0 + 0.01, 0.01, 0.12);
}

// End-of-reload latch (deeper metallic clack)
export function playReloadEnd() {
  ensureContext();
  const t0 = ctx.currentTime;
  fmPing(t0, { freq: 520, mod: 900, index: 1.0, dur: 0.16, gain: 0.32, bpFreq: 1500, q: 7 });
  fmPing(t0 + 0.02, { freq: 780, mod: 1400, index: 0.9, dur: 0.12, gain: 0.18, bpFreq: 1900, q: 9 });
  tick(t0 + 0.005, 0.012, 0.2);
}

// Shotgun blast: chunkier, deeper, wider noise burst
export function playShotgunBlast() {
  ensureContext();
  const t0 = ctx.currentTime;
  const vol = (CFG.audio?.gunshotVol ?? 0.9);

  // Heavy noise burst (wider band)
  const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.18), ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.95;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;

  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(4000, t0);
  lp.frequency.exponentialRampToValueAtTime(600, t0 + 0.18);

  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.0, t0);
  nGain.gain.linearRampToValueAtTime(vol * 0.85, t0 + 0.003);
  nGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);

  noise.connect(hp).connect(lp).connect(nGain).connect(master);
  noise.start(t0); noise.stop(t0 + 0.20);

  // Deep thump (lower than rifle)
  const osc = ctx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(100, t0);
  osc.frequency.exponentialRampToValueAtTime(35, t0 + 0.2);
  const oGain = ctx.createGain();
  oGain.gain.setValueAtTime(0.0, t0);
  oGain.gain.linearRampToValueAtTime(vol * 0.5, t0 + 0.006);
  oGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
  osc.connect(oGain).connect(master);
  osc.start(t0); osc.stop(t0 + 0.25);

  // Second click for pump-action feel
  const click = ctx.createBufferSource();
  const cb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.015), ctx.sampleRate);
  const cch = cb.getChannelData(0);
  for (let i = 0; i < cch.length; i++) cch[i] = (Math.random() * 2 - 1) * (1 - i / cch.length);
  click.buffer = cb;
  const cGain = ctx.createGain(); cGain.gain.value = vol * 0.3;
  click.connect(cGain).connect(master);
  click.start(t0 + 0.06);
}

// Sniper shot: sharp crack + long echo tail
export function playSniperShot() {
  ensureContext();
  const t0 = ctx.currentTime;
  const vol = (CFG.audio?.gunshotVol ?? 0.9);

  // Sharp crack (very short, bright noise)
  const crackBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
  const cdata = crackBuf.getChannelData(0);
  for (let i = 0; i < cdata.length; i++) cdata[i] = (Math.random() * 2 - 1) * (1 - i / cdata.length);
  const crack = ctx.createBufferSource(); crack.buffer = crackBuf;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
  const cGain = ctx.createGain();
  cGain.gain.setValueAtTime(vol * 0.9, t0);
  cGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);
  crack.connect(hp).connect(cGain).connect(master);
  crack.start(t0); crack.stop(t0 + 0.08);

  // Echo tail (delayed filtered noise)
  const echoBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const edata = echoBuf.getChannelData(0);
  for (let i = 0; i < edata.length; i++) edata[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / edata.length, 2);
  const echo = ctx.createBufferSource(); echo.buffer = echoBuf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  const eGain = ctx.createGain();
  eGain.gain.setValueAtTime(0.0001, t0);
  eGain.gain.linearRampToValueAtTime(vol * 0.25, t0 + 0.05);
  eGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
  echo.connect(lp).connect(eGain).connect(master);
  echo.start(t0 + 0.03); echo.stop(t0 + 0.55);

  // Sub thump
  const osc = ctx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(60, t0);
  osc.frequency.exponentialRampToValueAtTime(25, t0 + 0.3);
  const oGain = ctx.createGain();
  oGain.gain.setValueAtTime(vol * 0.35, t0);
  oGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
  osc.connect(oGain).connect(master);
  osc.start(t0); osc.stop(t0 + 0.35);
}

// =========================================
// Ambient soundscape + War drums
// =========================================

let ambienceBus = null;
let ambienceState = null;
let warDrumsBus = null;
let warDrumsState = null;

// --- Wind (filtered noise loop) ---
function createWindLoop() {
  const len = Math.floor(ctx.sampleRate * 4); // 4-second loop
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
  const g = ctx.createGain(); g.gain.value = 0.15;

  // LFO for wind gusts
  const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.15;
  const lfoG = ctx.createGain(); lfoG.gain.value = 0.08;
  lfo.connect(lfoG).connect(g.gain);
  lfo.start();

  src.connect(lp).connect(g).connect(ambienceBus);
  src.start();

  return { src, gain: g, lp, lfo };
}

// --- Crickets (night) ---
function createCricketLoop() {
  const g = ctx.createGain(); g.gain.value = 0;
  g.connect(ambienceBus);

  let timer = null;
  function chirp() {
    if (!ambienceState || !ambienceState.running) return;
    const t = ctx.currentTime;
    // Rapid high-pitched oscillator bursts
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = 4200 + Math.random() * 800;
      const eg = ctx.createGain();
      const at = t + i * 0.06;
      eg.gain.setValueAtTime(0.0001, at);
      eg.gain.linearRampToValueAtTime(0.12, at + 0.01);
      eg.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
      o.connect(eg).connect(g);
      o.start(at); o.stop(at + 0.05);
    }
    timer = setTimeout(chirp, 1200 + Math.random() * 2000);
  }
  chirp();

  return { gain: g, stop: () => { if (timer) clearTimeout(timer); } };
}

// --- Birds (day) ---
function createBirdLoop() {
  const g = ctx.createGain(); g.gain.value = 0;
  g.connect(ambienceBus);

  let timer = null;
  function tweet() {
    if (!ambienceState || !ambienceState.running) return;
    const t = ctx.currentTime;
    const baseFreq = 1800 + Math.random() * 1200;
    // Two-tone chirp with FM
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(baseFreq, t);
    o.frequency.linearRampToValueAtTime(baseFreq * 1.3, t + 0.06);
    o.frequency.linearRampToValueAtTime(baseFreq * 0.9, t + 0.12);
    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0.0001, t);
    eg.gain.linearRampToValueAtTime(0.10, t + 0.02);
    eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(eg).connect(g);
    o.start(t); o.stop(t + 0.18);

    timer = setTimeout(tweet, 2000 + Math.random() * 4000);
  }
  tweet();

  return { gain: g, stop: () => { if (timer) clearTimeout(timer); } };
}

// --- War drums (intensify with wave count) ---
function createWarDrums() {
  warDrumsBus = ctx.createGain();
  warDrumsBus.gain.value = 0;
  warDrumsBus.connect(master);

  const baseTempo = 60; // BPM at wave 1
  const state = {
    running: false,
    timer: null,
    tempo: baseTempo,
    spb: 60 / baseTempo,
    nextTime: 0,
    step: 0,
    wave: 1
  };

  function scheduleBeats() {
    if (!state.running) return;
    const now = ctx.currentTime;
    while (state.nextTime < now + 0.3) {
      const t = state.nextTime;
      const s = state.step % 8;

      // Deep tom on 1 and 5
      if (s === 0 || s === 4) {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(80, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.6, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.connect(g).connect(warDrumsBus);
        o.start(t); o.stop(t + 0.35);
      }
      // Lighter hit on 2, 6
      if (s === 2 || s === 6) {
        const o = ctx.createOscillator(); o.type = 'triangle';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(70, t + 0.15);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.35, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g).connect(warDrumsBus);
        o.start(t); o.stop(t + 0.22);
      }
      // Rim / stick on off-beats for higher waves
      if (state.wave >= 3 && (s === 3 || s === 7)) {
        const len = Math.floor(ctx.sampleRate * 0.02);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
        const g = ctx.createGain(); g.gain.value = 0.2;
        src.connect(hp).connect(g).connect(warDrumsBus);
        src.start(t); src.stop(t + 0.03);
      }

      state.nextTime += state.spb / 2; // eighth notes
      state.step++;
    }
  }

  return { state, schedule: scheduleBeats };
}

export function startAmbience() {
  if (CFG.audio && CFG.audio.musicEnabled === false) return;
  ensureContext();
  if (ambienceState && ambienceState.running) return;

  ambienceBus = ctx.createGain();
  ambienceBus.gain.value = CFG.audio?.ambienceVol ?? 0.35;
  ambienceBus.connect(master);

  const wind = createWindLoop();
  const crickets = createCricketLoop();
  const birds = createBirdLoop();
  const drums = createWarDrums();

  drums.state.running = true;
  drums.state.nextTime = ctx.currentTime + 0.1;
  drums.state.timer = setInterval(drums.schedule, 50);

  ambienceState = {
    running: true,
    wind, crickets, birds, drums
  };
}

export function updateAmbience(timeOfDay, waveNumber) {
  if (!ambienceState || !ambienceState.running) return;

  // Day/night crossfade for crickets vs birds
  // timeOfDay ~0.25 is dawn, ~0.5 is noon, ~0.75 is dusk, ~0 is midnight
  const isNight = timeOfDay < 0.25 || timeOfDay > 0.75;
  const nightFactor = isNight ? 1.0 : Math.max(0, 1 - Math.abs(timeOfDay - 0.5) * 4);
  const dayFactor = 1 - nightFactor;

  if (ambienceState.crickets && ambienceState.crickets.gain) {
    ambienceState.crickets.gain.gain.value = nightFactor * 0.7;
  }
  if (ambienceState.birds && ambienceState.birds.gain) {
    ambienceState.birds.gain.gain.value = dayFactor * 0.5;
  }

  // War drums: intensity scales with wave
  if (ambienceState.drums && warDrumsBus) {
    const wave = Math.max(1, waveNumber || 1);
    // Volume ramps from 0.05 at wave 1 to full at wave 10+
    const maxVol = CFG.audio?.warDrumsVol ?? 0.22;
    const vol = Math.min(maxVol, 0.05 + (wave - 1) * (maxVol / 10));
    warDrumsBus.gain.value = vol;

    // Tempo increases with waves
    const maxTempo = CFG.audio?.warDrumsMaxTempo ?? 180;
    const tempo = Math.min(maxTempo, 60 + (wave - 1) * 12);
    const ds = ambienceState.drums.state;
    ds.tempo = tempo;
    ds.spb = 60 / tempo;
    ds.wave = wave;
  }
}

export function stopAmbience(fade = 0.6) {
  if (!ambienceState) return;
  ambienceState.running = false;

  if (ambienceState.crickets) ambienceState.crickets.stop();
  if (ambienceState.birds) ambienceState.birds.stop();
  if (ambienceState.drums && ambienceState.drums.state) {
    ambienceState.drums.state.running = false;
    if (ambienceState.drums.state.timer) {
      clearInterval(ambienceState.drums.state.timer);
      ambienceState.drums.state.timer = null;
    }
  }

  // Fade out
  if (ambienceBus) {
    const t = ctx.currentTime;
    ambienceBus.gain.cancelScheduledValues(t);
    ambienceBus.gain.setValueAtTime(ambienceBus.gain.value, t);
    ambienceBus.gain.linearRampToValueAtTime(0.0001, t + fade);
  }
  if (warDrumsBus) {
    const t = ctx.currentTime;
    warDrumsBus.gain.cancelScheduledValues(t);
    warDrumsBus.gain.setValueAtTime(warDrumsBus.gain.value, t);
    warDrumsBus.gain.linearRampToValueAtTime(0.0001, t + fade);
  }
  ambienceState = null;
}

// Sound for Granddquiz: sound effects and background music, all synthesised with the Web Audio API,
// so there are no audio files to host, download or license.
//
// Both effects and music are ON by default and each person can switch either off (the choice is
// remembered on that device). Browsers will not make sound until the page has had a click or tap, so the
// audio starts on the first one; until then `locked` is true and the controls say so.
//
// Music: every category has its own theme (key, scale, tempo, rhythm). Difficulty changes how busy and
// fast it plays. Blitz mode, the lobby and the final question each have their own feel, and a countdown
// layer speeds the music up and adds a pulse as time runs out.
import { useSyncExternalStore } from 'react';

// ---------- settings (remembered per device) ----------
const read = (k) => { try { return localStorage.getItem(k) !== '0'; } catch { return true; } };
const write = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* private mode: fine */ } };

let sfxOn = read('gq.sfx');
let musicOn = read('gq.music');
let role = 'phone'; // 'screen' plays loudest, phones and the host console a little softer
let ctx = null;
let master = null;
let musicBus = null;
let sfxBus = null;
let snapshot = null;
const listeners = new Set();

const ROLE_MUSIC_GAIN = { screen: 0.34, host: 0.2, phone: 0.2 };

function publish() {
  snapshot = { sfx: sfxOn, music: musicOn, locked: !ctx || ctx.state !== 'running' };
  listeners.forEach((l) => l());
}
snapshot = { sfx: sfxOn, music: musicOn, locked: true };

export function useSoundSettings() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => snapshot,
    () => snapshot
  );
}

export function setRole(next) {
  role = next;
  if (musicBus) musicBus.gain.value = ROLE_MUSIC_GAIN[role] ?? 0.2;
}

function ensureContext() {
  if (ctx || typeof window === 'undefined') return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  master = ctx.createGain();
  master.gain.value = 0.9;
  musicBus = ctx.createGain();
  musicBus.gain.value = ROLE_MUSIC_GAIN[role] ?? 0.2;
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.8;
  musicBus.connect(master);
  sfxBus.connect(master);
  master.connect(comp).connect(ctx.destination);
  ctx.addEventListener?.('statechange', () => { publish(); if (ctx.state === 'running') resumeWanted(); });
  return ctx;
}

// The first click, tap or key press unlocks audio for the whole session
function unlock() {
  const c = ensureContext();
  if (!c) return;
  const done = () => { publish(); resumeWanted(); };
  if (c.state === 'running') done();
  else c.resume().then(done).catch(() => {});
}
if (typeof window !== 'undefined') {
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach((e) => window.addEventListener(e, unlock, { passive: true }));
}

export function setSfx(on) { sfxOn = !!on; write('gq.sfx', sfxOn); if (on) unlock(); publish(); }
export function setMusic(on) {
  musicOn = !!on;
  write('gq.music', musicOn);
  if (musicOn) { unlock(); resumeWanted(); } else stopMusic(0.25, false);
  publish();
}
export const soundState = () => snapshot;

const live = () => ctx && ctx.state === 'running';

// ---------- building blocks ----------
let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

function env(g, t0, attack, peak, dur) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function osc(bus, freq, t0, dur, { type = 'sine', gain = 0.15, attack = 0.015, to = null, filter = 0 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  env(g, t0, attack, gain, dur);
  let out = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    o.connect(f);
    out = f;
  }
  out.connect(g).connect(bus);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function burst(bus, t0, dur, { gain = 0.1, hp = 0, lp = 0 } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = noise();
  const g = ctx.createGain();
  env(g, t0, 0.003, gain, dur);
  let node = s;
  if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
  node.connect(g).connect(bus);
  s.start(t0, Math.random() * 0.5);
  s.stop(t0 + dur + 0.05);
}

// ---------- sound effects ----------
const fx = (fn) => (...a) => { if (sfxOn && live()) fn(sfxBus, ctx.currentTime, ...a); };
const seq = (bus, t, notes, o) => notes.forEach(([f, at, d, g]) => osc(bus, f, t + at, d, { ...o, ...(g ? { gain: g } : {}) }));

export const cues = {
  ready: fx((b, t) => seq(b, t, [[660, 0, 0.12], [880, 0.12, 0.2]], { type: 'triangle', gain: 0.12 })),
  join: fx((b, t) => osc(b, 880, t, 0.12, { gain: 0.07 })),
  pick: fx((b, t) => osc(b, 520, t, 0.08, { type: 'triangle', gain: 0.1 })),
  start: fx((b, t) => seq(b, t, [[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.3]], { type: 'triangle', gain: 0.15 })),
  tick: fx((b, t, secondsLeft = 5) => osc(b, secondsLeft <= 2 ? 1500 : 1050, t, 0.05, { type: 'square', gain: 0.05 })),
  lock: fx((b, t) => seq(b, t, [[784, 0, 0.1], [988, 0.1, 0.22]], { type: 'triangle', gain: 0.12 })),
  timeUp: fx((b, t) => { osc(b, 190, t, 0.6, { type: 'sawtooth', gain: 0.13, to: 100 }); osc(b, 95, t, 0.6, { type: 'square', gain: 0.07 }); }),
  reveal: fx((b, t) => seq(b, t, [[523, 0, 0.16], [659, 0.1, 0.16], [784, 0.2, 0.16], [1047, 0.3, 0.45]], { type: 'triangle', gain: 0.14 })),
  // A bright rising ding, with a sparkle on top
  correct: fx((b, t) => {
    seq(b, t, [[784, 0, 0.14], [988, 0.09, 0.14], [1319, 0.18, 0.5]], { type: 'triangle', gain: 0.2 });
    seq(b, t, [[2637, 0.18, 0.3]], { type: 'sine', gain: 0.05 });
  }),
  // A low, short, falling buzz. Not harsh, but clearly "no"
  wrong: fx((b, t) => {
    osc(b, 220, t, 0.32, { type: 'sawtooth', gain: 0.13, to: 120, filter: 900 });
    osc(b, 165, t + 0.18, 0.4, { type: 'sawtooth', gain: 0.12, to: 82, filter: 800 });
  }),
  skip: fx((b, t) => osc(b, 330, t, 0.1, { type: 'triangle', gain: 0.07, to: 260 })),
  // The last question: a two-tone rising alarm, so everyone knows it is the final push
  finalQuestion: fx((b, t) => {
    for (let i = 0; i < 3; i++) seq(b, t + i * 0.34, [[660, 0, 0.16], [880, 0.16, 0.16]], { type: 'square', gain: 0.06 });
    seq(b, t + 1.05, [[1175, 0, 0.5]], { type: 'triangle', gain: 0.12 });
  }),
  // Thirty seconds left in a blitz
  warning: fx((b, t) => { seq(b, t, [[880, 0, 0.12], [880, 0.2, 0.12], [1175, 0.4, 0.3]], { type: 'square', gain: 0.06 }); }),
  // One heartbeat: two soft thumps
  heartbeat: fx((b, t) => {
    osc(b, 90, t, 0.16, { type: 'sine', gain: 0.3, to: 45 });
    osc(b, 80, t + 0.18, 0.16, { type: 'sine', gain: 0.22, to: 42 });
  }),
  // A rising whoosh into the last seconds
  riser: fx((b, t) => {
    osc(b, 200, t, 2.2, { type: 'sawtooth', gain: 0.05, to: 1600, attack: 1.8, filter: 2500 });
    burst(b, t, 2.2, { gain: 0.05, hp: 2500 });
  }),
  // The last three seconds, one big beep each
  finalBeep: fx((b, t, n = 2) => osc(b, n === 1 ? 1568 : 1175, t, n === 1 ? 0.6 : 0.16, { type: 'square', gain: n === 1 ? 0.09 : 0.07 })),
  win: fx((b, t) => seq(b, t, [[523, 0, 0.18], [659, 0.16, 0.18], [784, 0.32, 0.18], [1047, 0.48, 0.3], [784, 0.8, 0.14], [1047, 0.94, 0.14], [1319, 1.1, 0.9]], { type: 'triangle', gain: 0.18 })),
  blitzEnd: fx((b, t) => { osc(b, 440, t, 0.5, { type: 'sawtooth', gain: 0.1, to: 880 }); seq(b, t + 0.5, [[1047, 0, 0.15], [1319, 0.15, 0.15], [1568, 0.3, 0.7]], { type: 'triangle', gain: 0.15 }); }),
};

// ---------- music themes ----------
const MAJ = [0, 2, 4, 5, 7, 9, 11];
const MIN = [0, 2, 3, 5, 7, 8, 10];
const DOR = [0, 2, 3, 5, 7, 9, 10];
const MIX = [0, 2, 4, 5, 7, 9, 10];
const LYD = [0, 2, 4, 6, 7, 9, 11];
const PENT = [0, 2, 4, 7, 9];
const PHRY = [0, 1, 3, 5, 7, 8, 10];

// Arpeggio patterns: which chord tone (0 root, 1 third, 2 fifth, 3 octave) sounds on each 16th, -1 is a rest
const ARP = {
  up: [0, -1, 1, -1, 2, -1, 3, -1, 2, -1, 1, -1, 0, -1, 1, -1],
  bounce: [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 3, 2, 1, 2],
  sparse: [0, -1, -1, 2, -1, -1, 1, -1, 0, -1, -1, 2, -1, 3, -1, -1],
  drive: [0, 0, 2, 0, 1, 0, 2, 0, 0, 0, 2, 0, 3, 0, 2, 0],
  bell: [0, -1, -1, -1, 2, -1, -1, -1, 3, -1, -1, -1, 2, -1, 1, -1],
  funk: [0, -1, 0, 2, -1, 1, -1, 2, 0, -1, 0, 2, -1, 3, -1, 1],
  poly: [0, -1, 2, -1, 1, 2, -1, 1, -1, 0, 2, -1, 1, -1, 3, -1],
};

const BASS = {
  four: 'x...x...x...x...',
  eighths: 'x.x.x.x.x.x.x.x.',
  offbeat: 'x..x..x.x..x..x.',
  long: 'x.......x.......',
  funk: 'x..x.x..x..x.x..',
  walk: 'x...x...x...x.x.',
};

const DRUMS = {
  none: {},
  soft: { kick: 'x.......x.......', snare: '........x.......', hat: '' },
  four: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
  shuffle: { kick: 'x.....x.x.......', snare: '....x.......x..x', hat: 'x.xxx.xxx.xxx.xx' },
  march: { kick: 'x.......x.......', snare: '....x.......x.x.', hat: '' },
  tick: { kick: 'x.......x.......', snare: '', hat: 'x.x.x.x.x.x.x.x.' },
  afro: { kick: 'x.......x.......', snare: '', hat: '', tom: 'x..x..x...x.x...', conga: 'x.x..x.x..x..x.x' },
  rock: { kick: 'x...x..xx...x...', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx' },
};

const THEMES = {
  // The waiting room: friendly and unhurried
  lobby: { root: 60, scale: MAJ, bpm: 98, chords: [0, 5, 3, 4], lead: 'triangle', bassWave: 'sine', arp: ARP.bounce, bass: BASS.long, drums: 'soft' },
  // Blitz: fast and driving, like a stopwatch
  blitz: { root: 57, scale: MIN, bpm: 138, chords: [0, 5, 3, 6], lead: 'square', bassWave: 'sawtooth', arp: ARP.drive, bass: BASS.eighths, drums: 'four', fast: true },

  'general-knowledge': { root: 60, scale: MAJ, bpm: 108, chords: [0, 5, 3, 4], lead: 'triangle', bassWave: 'sine', arp: ARP.up, bass: BASS.four, drums: 'four' },
  'current-affairs': { root: 57, scale: MIN, bpm: 118, chords: [0, 0, 3, 4], lead: 'square', bassWave: 'sawtooth', arp: ARP.drive, bass: BASS.eighths, drums: 'tick' },
  geography: { root: 62, scale: MIX, bpm: 104, chords: [0, 3, 0, 4], lead: 'triangle', bassWave: 'sine', arp: ARP.bounce, bass: BASS.offbeat, drums: 'shuffle' },
  history: { root: 52, scale: DOR, bpm: 84, chords: [0, 3, 0, 4], lead: 'sawtooth', bassWave: 'sine', arp: ARP.sparse, bass: BASS.long, drums: 'march', pad: true, soft: true },
  'science-nature': { root: 62, scale: LYD, bpm: 100, chords: [0, 1, 0, 4], lead: 'sine', bassWave: 'sine', arp: ARP.bell, bass: BASS.long, drums: 'soft', pad: true, bubbly: true },
  sports: { root: 64, scale: MAJ, bpm: 128, chords: [0, 3, 4, 3], lead: 'square', bassWave: 'sawtooth', arp: ARP.drive, bass: BASS.four, drums: 'rock' },
  'music-entertainment': { root: 55, scale: DOR, bpm: 112, chords: [0, 3, 0, 4], lead: 'triangle', bassWave: 'sawtooth', arp: ARP.funk, bass: BASS.funk, drums: 'shuffle' },
  'zambian-culture': { root: 65, scale: PENT, bpm: 112, chords: [0, 2, 1, 3], lead: 'triangle', bassWave: 'sine', arp: ARP.poly, bass: BASS.offbeat, drums: 'afro', pluck: true },
  'riddles-logic': { root: 49, scale: PHRY, bpm: 92, chords: [0, 0, 1, 0], lead: 'triangle', bassWave: 'sine', arp: ARP.sparse, bass: BASS.walk, drums: 'tick', pluck: true, soft: true },
  'common-sense': { root: 53, scale: MAJ, bpm: 100, chords: [0, 3, 4, 0], lead: 'triangle', bassWave: 'sine', arp: ARP.up, bass: BASS.long, drums: 'soft', pluck: true },
  bible: { root: 50, scale: MAJ, bpm: 72, chords: [0, 3, 4, 0], lead: 'sine', bassWave: 'sine', arp: ARP.bell, bass: BASS.long, drums: 'none', pad: true, soft: true },
};

// A category we have never heard of still gets a stable theme of its own
const POOL = ['general-knowledge', 'geography', 'sports', 'music-entertainment', 'common-sense', 'current-affairs'];
export function themeFor(slug) {
  if (THEMES[slug]) return slug;
  let h = 0;
  for (const ch of String(slug || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return POOL[h % POOL.length];
}

const TEMPO = [0.92, 1, 1.1]; // easy, medium, hard
export const intensityOf = (difficulty) => ({ easy: 0, medium: 1, hard: 2 }[difficulty] ?? 1);

// ---------- the music player ----------
let M = null; // what is playing now
let wanted = null; // what should play once audio is allowed / music is switched on

const degreeToMidi = (th, deg) => {
  const n = th.scale.length;
  return th.root + th.scale[((deg % n) + n) % n] + 12 * Math.floor(deg / n);
};

function playStep(m, step, t) {
  const th = m.theme;
  const s = step % 16;
  const bar = Math.floor(step / 16) % 4;
  const chord = th.chords[bar];
  const lvl = Math.min(2, m.intensity);
  const tension = m.tension;
  const bus = m.bus;
  const soft = th.soft ? 0.75 : 1;
  const beat = 60 / m.bpm;

  // Bass
  if (th.bass[s] === 'x') osc(bus, mtof(degreeToMidi(th, chord) - 24), t, beat * 0.9, { type: th.bassWave, gain: 0.16 * soft, filter: 700 });

  // Pad: one long chord each bar
  if (th.pad && s === 0) {
    [0, 2, 4].forEach((d) => osc(bus, mtof(degreeToMidi(th, chord + d) - 12), t, beat * 4, { type: 'sine', gain: 0.05, attack: beat * 1.2 }));
  }

  // Lead: a plain melody on easy, a full arpeggio from medium up, an octave on top for hard
  const idx = th.arp[s];
  const full = lvl >= 1 || tension >= 1;
  if (idx >= 0 && (full || s % 8 === 0)) {
    const tones = [chord, chord + 2, chord + 4, chord + 7];
    const midi = degreeToMidi(th, tones[idx]) + (bar === 3 && s > 7 ? 12 : 0);
    const dur = th.pluck || th.bubbly ? beat * 0.45 : beat * 0.3;
    osc(bus, mtof(midi + 12), t, dur, { type: th.lead, gain: (th.pluck ? 0.16 : 0.1) * soft, attack: 0.008, filter: th.lead === 'sawtooth' ? 1800 : 0 });
    if (lvl >= 2 && s % 4 === 0) osc(bus, mtof(midi + 24), t, dur * 0.8, { type: 'triangle', gain: 0.05 });
  }

  // Drums
  const d = DRUMS[th.drums] || {};
  const hit = (pat) => pat && pat[s] === 'x';
  if (hit(d.kick)) osc(bus, 150, t, 0.14, { type: 'sine', gain: 0.32, to: 45, attack: 0.004 });
  if (hit(d.snare) && lvl >= 0) burst(bus, t, 0.12, { gain: 0.16 * soft, hp: 1500 });
  if (hit(d.tom)) osc(bus, 230, t, 0.2, { type: 'sine', gain: 0.22, to: 110, attack: 0.004 });
  if (hit(d.conga)) osc(bus, 340, t, 0.1, { type: 'sine', gain: 0.1, to: 260, attack: 0.003 });
  if (hit(d.hat) && (lvl >= 1 || tension >= 1)) burst(bus, t, 0.04, { gain: 0.06, hp: 7000 });
  // Hard questions and a ticking clock add busy hats on every 16th
  if ((lvl >= 2 || tension >= 2) && d.hat !== undefined && s % 2 === 1) burst(bus, t, 0.03, { gain: 0.035, hp: 8000 });
  if (th.drums === 'none' && (lvl >= 2 || tension >= 1) && s % 4 === 0) osc(bus, 120, t, 0.12, { type: 'sine', gain: 0.18, to: 50, attack: 0.004 });

  // The ticking clock: a heartbeat-like kick every beat, and an alarm pulse in the last seconds
  if (tension >= 1 && s % 4 === 0) osc(bus, 110, t, 0.12, { type: 'sine', gain: 0.18 + 0.06 * tension, to: 48, attack: 0.004 });
  if (tension >= 2 && s % (tension >= 3 ? 2 : 4) === 2) osc(bus, 1320, t, 0.05, { type: 'square', gain: 0.025 + 0.01 * tension });
}

function tickScheduler() {
  const m = M;
  if (!m || !live()) return;
  const now = ctx.currentTime;
  while (m.next < now + 0.35) {
    if (m.next >= now - 0.05) playStep(m, m.step, m.next);
    // The tempo can change at any time (difficulty, countdown), so work it out for each step
    m.bpm = m.theme.bpm * TEMPO[Math.min(2, m.intensity)] * (1 + 0.07 * m.tension);
    m.next += 60 / m.bpm / 4;
    m.step += 1;
  }
}

function launch(spec) {
  const c = ensureContext();
  if (!c) return;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, ctx.currentTime);
  bus.gain.exponentialRampToValueAtTime(spec.level ?? 1, ctx.currentTime + 0.4);
  bus.connect(musicBus);
  M = {
    key: spec.key,
    theme: THEMES[spec.theme] || THEMES.lobby,
    intensity: spec.intensity ?? 1,
    tension: spec.tension ?? 0,
    bus,
    step: 0,
    next: ctx.currentTime + 0.08,
    bpm: 100,
    timer: setInterval(tickScheduler, 90),
  };
  tickScheduler();
}

function resumeWanted() {
  if (wanted && musicOn && live() && !M) launch(wanted);
}

/**
 * Ask for a piece of music. `key` identifies it: asking again for the same key only updates intensity,
 * tension and level, so a countdown can speed the tune up without restarting it.
 * spec: { key, theme, intensity 0-2, tension 0-3, level 0-1 }
 */
export function playMusic(spec) {
  wanted = spec;
  if (!musicOn || !live()) return;
  if (M && M.key === spec.key) {
    M.intensity = spec.intensity ?? M.intensity;
    M.tension = spec.tension ?? 0;
    if (spec.level != null) M.bus.gain.setTargetAtTime(Math.max(spec.level, 0.0001), ctx.currentTime, 0.15);
    return;
  }
  stopMusic(0.35, false);
  launch(spec);
}

// forget=false keeps the tune queued, so switching music back on picks it up again
export function stopMusic(fade = 0.4, forget = true) {
  if (forget) wanted = null;
  if (!M) return;
  const old = M;
  M = null;
  clearInterval(old.timer);
  if (ctx) {
    old.bus.gain.cancelScheduledValues(ctx.currentTime);
    old.bus.gain.setTargetAtTime(0.0001, ctx.currentTime, fade / 3);
    setTimeout(() => { try { old.bus.disconnect(); } catch { /* already gone */ } }, fade * 1000 + 400);
  }
}

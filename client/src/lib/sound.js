// Big-screen sound cues, synthesised with the Web Audio API: no audio files to download or host.
// Browsers refuse to play sound until the page has had a click or tap, so sound starts off and is
// switched on with a button. Every cue is a silent no-op while sound is off.

let ctx = null;
let on = false;

export const soundOn = () => on;

export async function setSound(next) {
  if (next) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = ctx || new AC();
    await ctx.resume();
    on = true;
    cues.ready();
  } else {
    on = false;
  }
  return on;
}

function tone(freq, at, dur, { type = 'sine', gain = 0.16, to } = {}) {
  if (!on || !ctx) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

const run = (notes, opts) => notes.forEach(([f, at, d]) => tone(f, at, d, opts));

export const cues = {
  ready: () => run([[660, 0, 0.12], [880, 0.12, 0.2]], { type: 'triangle', gain: 0.12 }),
  join: () => tone(880, 0, 0.12, { gain: 0.07 }),
  start: () => run([[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.3]], { type: 'triangle' }),
  tick: (secondsLeft) => tone(secondsLeft <= 2 ? 1400 : 1000, 0, 0.05, { type: 'square', gain: 0.05 }),
  lock: () => run([[784, 0, 0.1], [988, 0.1, 0.22]], { type: 'triangle', gain: 0.12 }),
  timeUp: () => tone(190, 0, 0.55, { type: 'sawtooth', gain: 0.12, to: 110 }),
  reveal: () => run([[523, 0, 0.16], [659, 0.1, 0.16], [784, 0.2, 0.16], [1047, 0.3, 0.45]], { type: 'triangle' }),
  win: () =>
    run([[523, 0, 0.18], [659, 0.16, 0.18], [784, 0.32, 0.18], [1047, 0.48, 0.3], [784, 0.8, 0.14], [1047, 0.94, 0.14], [1319, 1.1, 0.8]], { type: 'triangle', gain: 0.18 }),
};

import { setMusic, setSfx, useSoundSettings } from '../lib/sound.js';

// Two switches, on by default: background music and sound effects. Each person chooses for themselves,
// and the choice is remembered on that device.
export default function SoundControls({ inline = false }) {
  const s = useSoundSettings();
  const wantsSound = s.sfx || s.music;
  return (
    <div className={`sound-controls${inline ? ' inline' : ''}`} role="group" aria-label="Sound">
      {s.locked && wantsSound && <span className="sound-hint" role="status">Tap anywhere to start sound</span>}
      <button type="button" aria-pressed={s.music} onClick={() => setMusic(!s.music)} title="Background music">
        <span aria-hidden="true">{s.music ? '♪' : '✕'}</span> Music {s.music ? 'on' : 'off'}
      </button>
      <button type="button" aria-pressed={s.sfx} onClick={() => setSfx(!s.sfx)} title="Sound effects">
        <span aria-hidden="true">{s.sfx ? '🔊' : '🔇'}</span> Effects {s.sfx ? 'on' : 'off'}
      </button>
    </div>
  );
}

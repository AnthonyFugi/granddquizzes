import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useParams } from 'react-router-dom';
import Band from '../components/Band.jsx';
import { CodeTiles } from '../components/Code.jsx';
import { Leaderboard, Option, TimeNote, TimerBar, Waiting } from '../components/Quiz.jsx';
import { useCountdown, useScreen } from '../hooks/useQuiz.js';
import { useScreenSounds } from '../hooks/useSounds.js';
import { setSound } from '../lib/sound.js';

export default function Screen() {
  const code = useParams().code.toUpperCase();
  const { phase, error, state, retry } = useScreen(code);
  const clock = useCountdown(state);
  const [sound, setSoundState] = useState(false);
  useScreenSounds(state, clock.left);

  return (
    <div className="stage">
      <Band height={28} />
      <div className="page">
        {phase === 'error' && (
          <div>
            <h1>Waiting for the quiz master</h1>
            <p className="muted" role="alert">{error}</p>
            <button className="btn" onClick={retry}>Check again</button>
          </div>
        )}
        {phase !== 'error' && !state && <Waiting>Connecting to quiz {code}</Waiting>}
        {state?.status === 'lobby' && <Lobby state={state} code={code} />}
        {state && ['question', 'locked'].includes(state.status) && <Question state={state} clock={clock} />}
        {state?.status === 'reveal' && <Reveal state={state} />}
        {state?.status === 'ended' && <Ended state={state} />}
      </div>
      <button type="button" className="sound-toggle" aria-pressed={sound} onClick={async () => setSoundState(await setSound(!sound))}>
        {sound ? 'Sound on' : 'Turn sound on'}
      </button>
    </div>
  );
}

function Lobby({ state, code }) {
  const url = `${window.location.origin}/?code=${code}`;
  return (
    <div className="stage-grid">
      <div>
        <h1>{state.title}</h1>
        <p style={{ fontSize: '1.4rem' }}>On your phone, go to <strong>{window.location.host}</strong> and enter</p>
        <CodeTiles code={code} size="big" animate />
        <div style={{ marginTop: 24 }}><TimeNote seconds={state.timeLimit} /></div>
        <div style={{ marginTop: 32 }}>
          <div className="big-count">{state.playerCount}</div>
          <p className="muted" style={{ fontSize: '1.3rem' }}>{state.playerCount === 1 ? 'player is' : 'players are'} in the room</p>
        </div>
      </div>
      <div className="stack">
        <div className="qr"><QRCodeSVG value={url} size={200} level="M" /></div>
        <p className="muted">Scan to join</p>
        {state.teams.length > 0 && (
          <div>
            <h2>Teams</h2>
            <div className="name-cloud">{state.teams.map((t) => <span key={t.id} className="chip">{t.name} ({t.size})</span>)}</div>
          </div>
        )}
        {state.players?.length > 0 && (
          <div>
            <h2>In the room</h2>
          <div className="name-cloud">{state.players.slice(0, 60).map((p) => <span key={p.nickname} className="chip">{p.nickname}</span>)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Question({ state, clock }) {
  const q = state.question;
  const locked = state.status === 'locked';
  return (
    <div>
      <div className="q-meta">
        <span style={{ fontSize: '1.3rem' }}>Question {q.index + 1} of {q.total}</span>
        <span className="chip">{q.category?.icon} {q.category?.name}</span>
        <span style={{ fontSize: '1.3rem' }} aria-live="polite">{locked ? 'Time is up' : `${state.answeredCount} of ${state.expectedCount} answered`}</span>
      </div>
      <TimerBar fraction={locked ? 0 : clock.fraction} left={clock.left} />
      <h1 className="q-text" style={{ marginTop: 28 }}>{q.text}</h1>
      <div className="options cols">
        {q.options.map((text, i) => <Option key={i} index={i} text={text} disabled />)}
      </div>
    </div>
  );
}

function Reveal({ state }) {
  const { question: q, reveal } = state;
  return (
    <div className="stage-grid" style={{ alignItems: 'start' }}>
      <div>
        <h1 className="q-text">{q.text}</h1>
        <div className="options">
          {q.options.map((text, i) => (
            <Option key={i} index={i} text={text} disabled correct={i === reveal.correctIndex} dim={i !== reveal.correctIndex} tally={reveal.tally?.[i]} tag={i === reveal.correctIndex ? 'Correct' : undefined} />
          ))}
        </div>
        {reveal.explanation && <p style={{ fontSize: '1.3rem', marginTop: 20 }}>{reveal.explanation}</p>}
      </div>
      <div>
        <h2>Leaderboard</h2>
        <Leaderboard rows={state.leaderboard || []} limit={8} prizes={state.prizes} />
      </div>
    </div>
  );
}

function Ended({ state }) {
  const winners = state.winners || [];
  return (
    <div className="stage-grid" style={{ alignItems: 'start' }}>
      <div>
        <h1>That is the quiz. Congratulations!</h1>
        {winners.length === 0 && <p className="muted" style={{ fontSize: '1.3rem' }}>Thanks for playing, everyone.</p>}
        {winners.map((w) => (
          <div key={w.key} style={{ marginBottom: 22 }}>
            <div className="muted" style={{ fontSize: '1.2rem' }}>{w.prize}</div>
            <div style={{ font: '700 clamp(1.8rem,4vw,3.2rem) var(--display)' }}>{w.name}</div>
            <div>{w.score.toLocaleString()} points</div>
          </div>
        ))}
      </div>
      <div>
        <h2>Final standings</h2>
        <Leaderboard rows={state.leaderboard || []} limit={10} prizes={state.prizes} />
      </div>
    </div>
  );
}

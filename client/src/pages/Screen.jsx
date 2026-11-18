import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useParams } from 'react-router-dom';
import Band from '../components/Band.jsx';
import { SponsorStrip, StageHeader } from '../components/Brand.jsx';
import { brandVars } from '../lib/brand.js';
import { CodeTiles } from '../components/Code.jsx';
import { Leaderboard, Option, RoundBanner, ScoreText, TimerBar, Waiting, blitzLength, unitOf } from '../components/Quiz.jsx';
import { useBlitzClock, useCountdown, useScreen } from '../hooks/useQuiz.js';
import { useScreenSounds } from '../hooks/useSounds.js';
import { setSound } from '../lib/sound.js';

// How many leaderboard rows fit under the heading on this screen, so nothing is cut off
function useFitRows(share = 0.6) {
  const calc = () => {
    const h = typeof window === 'undefined' ? 768 : window.innerHeight;
    return Math.max(3, Math.min(10, Math.floor((h * share) / Math.max(40, h * 0.085))));
  };
  const [n, setN] = useState(calc);
  useEffect(() => { const f = () => setN(calc()); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return n;
}

export default function Screen() {
  const code = useParams().code.toUpperCase();
  const { phase, error, state, retry } = useScreen(code);
  const clock = useCountdown(state);
  const blitzClock = useBlitzClock(state);
  const [sound, setSoundState] = useState(false);
  useScreenSounds(state, clock.left);
  const showJoinCorner = !!state && ['question', 'locked', 'reveal', 'blitz'].includes(state.status);

  return (
    <div className="stage" style={brandVars(state?.branding)}>
      <Band height={16} />
      {state?.branding?.accent && <div className="brand-stripe" />}
      <div className="page">
        <div className="stage-top">
          <StageHeader branding={state?.branding || {}} />
          {showJoinCorner && (
            <div className="join-corner" aria-label={`Join late: code ${code}`}>
              <div className="qr"><QRCodeSVG value={`${window.location.origin}/?code=${code}`} size={84} level="M" marginSize={0} /></div>
              <div><div className="small">Join in:</div><strong style={{ font: '700 1.3rem var(--display)', letterSpacing: '0.06em' }}>{code}</strong></div>
            </div>
          )}
        </div>
        <div className="stage-body">
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
        {state?.status === 'blitz' && <BlitzView state={state} clock={blitzClock} />}
        {state?.status === 'reveal' && <Reveal state={state} />}
        {state?.status === 'ended' && <Ended state={state} />}
        </div>
        {state && <SponsorStrip branding={state.branding} light />}
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
        <p style={{ fontSize: 'clamp(1rem, 2.6vh, 1.4rem)', margin: '0 0 1vh' }}>On your phone, go to <strong>{window.location.host}</strong> and enter</p>
        <CodeTiles code={code} size="big" animate />
        <ul className="facts" aria-label="About this quiz">
          {state.mode === 'blitz' ? (
            <>
              <li>⚡ <strong>Blitz:</strong> {blitzLength(state.blitz.seconds)} on the clock</li>
              <li>Answer as many as you can</li>
              <li><strong>1</strong> point per correct answer</li>
            </>
          ) : (
            <>
              <li><strong>{state.totalQuestions}</strong> questions</li>
              <li><strong>{state.timeLimit}</strong> seconds each</li>
              <li><strong>{state.marks}</strong> {state.marks === 1 ? 'mark' : 'marks'} per correct answer ({state.maxPossible} in all)</li>
            </>
          )}
        </ul>
        {state.rounds?.length > 1 && (
          <p className="rounds-line"><strong>{state.rounds.length} rounds:</strong> {state.rounds.map((r) => `${r.icon} ${r.name}`.trim()).join('  ·  ')}</p>
        )}
        {state.prizes?.length > 0 && (
          <p className="rounds-line"><strong>Prizes:</strong> {state.prizes.map((p) => `${p.place === 1 ? '1st' : p.place === 2 ? '2nd' : p.place === 3 ? '3rd' : `${p.place}th`} ${p.label}`).join('  ·  ')}</p>
        )}
        <div style={{ marginTop: 20 }}>
          <div className="big-count">{state.playerCount}</div>
          <p className="muted" style={{ fontSize: '1.3rem' }}>{state.playerCount === 1 ? 'player is' : 'players are'} in the room</p>
        </div>
      </div>
      <div className="stack">
        <div className="qr qr-lobby"><QRCodeSVG value={url} size={200} level="M" /></div>
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
          <div className="name-cloud">{state.players.slice(0, 24).map((p) => <span key={p.nickname} className="chip">{p.nickname}</span>)}{state.players.length > 24 && <span className="chip">+{state.players.length - 24} more</span>}</div>
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
    <div className="qview">
      <RoundBanner round={q.round} big />
      <div className="q-meta">
        <span style={{ fontSize: '1.3rem' }}>Question {q.index + 1} of {q.total}</span>
        <span style={{ fontSize: '1.3rem' }}>{state.marks} {state.marks === 1 ? 'mark' : 'marks'}</span>
        <span className="chip">{q.category?.icon} {q.category?.name}</span>
        <span style={{ fontSize: '1.3rem' }} aria-live="polite">{locked ? (state.answeredCount >= state.expectedCount && state.expectedCount > 0 ? 'Everyone has answered' : 'Time is up') : `${state.answeredCount} of ${state.expectedCount} answered`}</span>
      </div>
      <TimerBar fraction={locked ? 0 : clock.fraction} left={clock.left} />
      <h1 className="q-text">{q.text}</h1>
      <div className="options cols">
        {q.options.map((text, i) => <Option key={i} index={i} text={text} disabled />)}
      </div>
    </div>
  );
}

function BlitzView({ state, clock }) {
  const rows = useFitRows(0.62);
  return (
    <div className="stage-grid">
      <div>
        <h1>⚡ Blitz!</h1>
        <TimerBar fraction={clock.fraction} left={clock.left} />
        <p className="muted" style={{ fontSize: 'clamp(1rem, 2.6vh, 1.5rem)', margin: '1.5vh 0' }}>Answer as many questions as you can on your phone. One point for every correct answer.</p>
        <p style={{ fontSize: 'clamp(1rem, 2.6vh, 1.5rem)' }}>{state.playerCount} {state.playerCount === 1 ? 'player' : 'players'} racing</p>
      </div>
      <div>
        <h2>Live leaderboard</h2>
        <Leaderboard rows={state.leaderboard || []} limit={rows} prizes={state.prizes} unit="correct" />
      </div>
    </div>
  );
}

function Reveal({ state }) {
  const { question: q, reveal } = state;
  const rows = useFitRows(0.58);
  return (
    <div className="stage-grid reveal-grid">
      <div className="reveal-left" style={{ display: 'flex', flexDirection: 'column' }}>
        <RoundBanner round={q.round} big />
        <div className="q-meta">
          <span style={{ fontSize: '1.3rem' }}>Question {q.index + 1} of {q.total}</span>
          <span className="chip">{q.category?.icon} {q.category?.name}</span>
        </div>
        <h1 className="q-text">{q.text}</h1>
        <div className="options reveal-opts">
          {q.options.map((text, i) => (
            <Option key={i} index={i} text={text} disabled correct={i === reveal.correctIndex} dim={i !== reveal.correctIndex} tally={reveal.tally?.[i]} tag={i === reveal.correctIndex ? 'Correct' : undefined} />
          ))}
        </div>
        {reveal.explanation && <p style={{ fontSize: 'clamp(0.95rem, 2.4vh, 1.3rem)', margin: '1vh 0 0' }}>{reveal.explanation}</p>}
      </div>
      <div>
        <h2>{q.round?.last ? `Standings after round ${q.round.number}` : 'Leaderboard'}</h2>
        {state.possible > 0 && <p className="muted" style={{ margin: '-6px 0 8px', fontSize: '1.1rem' }}>Out of {state.possible} marks so far</p>}
        <Leaderboard rows={state.leaderboard || []} limit={rows} prizes={state.prizes} possible={state.possible} />
      </div>
    </div>
  );
}

function Ended({ state }) {
  const winners = (state.winners || []).slice(0, 5);
  const rows = useFitRows(0.68);
  return (
    <div className="stage-grid">
      <div>
        <h1>That is the quiz. Congratulations!</h1>
        {winners.length === 0 && <p className="muted" style={{ fontSize: '1.3rem' }}>Thanks for playing, everyone.</p>}
        {winners.map((w) => (
          <div key={w.key} style={{ marginBottom: '1.6vh' }}>
            <div className="muted" style={{ fontSize: 'clamp(0.95rem, 2.4vh, 1.2rem)' }}>{w.prize}</div>
            <div style={{ font: '700 clamp(1.4rem, min(3.4vw, 5.4vh), 3.2rem) var(--display)' }}>{w.name}</div>
            <div><ScoreText score={w.score} possible={state.possible} /> {unitOf(state)}</div>
          </div>
        ))}
      </div>
      <div>
        <h2>Final standings</h2>
        {state.possible > 0 && <p className="muted" style={{ margin: '-6px 0 8px', fontSize: '1.1rem' }}>Out of {state.possible} marks</p>}
        <Leaderboard rows={state.leaderboard || []} limit={rows} prizes={state.prizes} possible={state.possible} unit={state.mode === 'blitz' ? 'correct' : ''} />
      </div>
    </div>
  );
}

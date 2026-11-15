import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { CodeTiles } from '../components/Code.jsx';
import { Leaderboard, Option, TimerBar, Waiting } from '../components/Quiz.jsx';
import { useCountdown, useHost } from '../hooks/useQuiz.js';
import { useAuth } from '../lib/auth.jsx';
import { downloadCsv, resultsCsv, resultsFilename } from '../lib/csv.js';
import { SignIn } from './Host.jsx';

export default function HostConsole() {
  const { user, token } = useAuth();
  if (!user || !['host', 'admin'].includes(user.role)) return <Shell><SignIn user={user} /></Shell>;
  return <Console eventId={useParams().eventId} token={token} />;
}

function Console({ eventId, token }) {
  const { phase, error, state, info, meta, act, retry } = useHost(eventId, token);
  const clock = useCountdown(state);
  const [msg, setMsg] = useState('');
  const run = async (event, data) => {
    const r = await act(event, data);
    setMsg(r.ok ? '' : r.error);
  };

  if (phase === 'error') {
    return (
      <Shell>
        <h1>Could not open this event</h1>
        <p className="error" role="alert">{error}</p>
        <div className="row"><button className="btn" onClick={retry}>Try again</button><Link className="btn secondary" to="/host">Back to events</Link></div>
      </Shell>
    );
  }
  if (!state || !meta) return <Shell><Waiting>Opening the event</Waiting></Shell>;

  const st = state.status;
  const q = state.question;
  return (
    <Shell wide>
      {phase === 'connecting' && <div className="banner" role="status">Connection lost. Reconnecting...</div>}
      <div className="row between" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>{state.title}</h1>
          <span className="muted">{state.playerCount} in the room, {state.connectedCount} connected</span>
        </div>
        <div className="row">
          <CodeTiles code={meta.code} size="small" />
          <a className="btn secondary small" href={`/screen/${meta.code}`} target="_blank" rel="noreferrer">Open big screen</a>
          <a className="btn secondary small" href={`/poster/${meta.code}`} target="_blank" rel="noreferrer">QR poster</a>
        </div>
      </div>

      {state.maxPlayers && state.playerCount >= state.maxPlayers - 2 && st !== 'ended' && (
        <p className="notice" role="status">
          {state.playerCount >= state.maxPlayers ? `The room is full (${state.maxPlayers} players). Anyone else who tries to join is turned away.` : `Nearly full: ${state.playerCount} of ${state.maxPlayers} places taken.`}{' '}
          <Link to={`/host/billing?event=${eventId}`}>Upgrade this event</Link>, then reopen this console and the new limit applies at once.
        </p>
      )}
      <div className="console">
        <section aria-live="polite">
          {st === 'lobby' && (
            <div className="stack">
              <h2>Lobby</h2>
              <p>Share the code or put the big screen on a projector. Start when everyone is in. Teams lock once the first question starts.</p>
              <p className="muted">{meta.totalQuestions} questions ready, {state.timeLimit} seconds each. Every question is timed and locks automatically when the clock reaches zero.</p>
              <button className="btn" disabled={state.playerCount === 0} onClick={() => run('host:next')}>Start question 1</button>
            </div>
          )}

          {['question', 'locked', 'reveal'].includes(st) && q && (
            <div>
              <div className="q-meta">
                <span className="muted">Question {q.index + 1} of {q.total}</span>
                <span className="chip">{q.category?.icon} {q.category?.name}</span>
                <span>{st === 'question' ? `${state.answeredCount} of ${state.expectedCount} answered` : st === 'locked' ? 'Answers locked' : 'Answer revealed'}</span>
              </div>
              {st === 'question' && <TimerBar fraction={clock.fraction} left={clock.left} />}
              <h2 className="q-text">{q.text}</h2>
              <div className="options">
                {q.options.map((text, i) => (
                  <Option key={i} index={i} text={text} disabled correct={(st === 'reveal' ? state.reveal.correctIndex : info?.correctIndex) === i} tag={(st === 'reveal' ? state.reveal.correctIndex : info?.correctIndex) === i ? 'Correct' : undefined} tally={st === 'reveal' ? state.reveal.tally?.[i] : undefined} />
                ))}
              </div>
              <p className="muted small" style={{ marginTop: 10 }}>{st === 'reveal' ? state.reveal.explanation : 'The outlined answer is correct. Only you can see it until you reveal.'}</p>
              <div className="row" style={{ marginTop: 18 }}>
                {st === 'question' && <button className="btn secondary" onClick={() => run('host:lock')}>Lock answers now</button>}
                {['question', 'locked'].includes(st) && <button className="btn" onClick={() => run('host:reveal')}>Reveal answer</button>}
                {st === 'reveal' && info?.hasNext && <button className="btn" onClick={() => run('host:next')}>Next question</button>}
                {st === 'reveal' && !info?.hasNext && <button className="btn copper" onClick={() => run('host:end')}>Finish quiz and show winners</button>}
              </div>
              {st === 'reveal' && (<><h3 className="section">Leaderboard</h3><Leaderboard rows={state.leaderboard || []} limit={6} prizes={state.prizes} /></>)}
            </div>
          )}

          {st === 'ended' && (
            <div>
              <h2>Quiz finished</h2>
              {state.winners?.length > 0 && (
                <ul className="team-list">{state.winners.map((w) => <li key={w.key}><strong>{w.prize}</strong>: {w.name} ({w.score.toLocaleString()} points)</li>)}</ul>
              )}
              <Leaderboard rows={state.leaderboard || []} limit={10} prizes={state.prizes} />
              <div className="row" style={{ marginTop: 18 }}>
                <button className="btn" onClick={() => downloadCsv(resultsFilename(state.title), resultsCsv(state))}>Download results (CSV)</button>
                <Link className="btn secondary" to="/host">Back to events</Link>
              </div>
              <p className="muted small">The full list is only available now. After you leave, the server keeps just the top 10 names and scores.</p>
            </div>
          )}

          {msg && <p className="error" role="alert" style={{ marginTop: 14 }}>{msg}</p>}
          {st !== 'ended' && st !== 'lobby' && (
            <button className="btn quiet small" style={{ marginTop: 24 }} onClick={() => window.confirm('End the quiz now and show the winners?') && run('host:end')}>End quiz early</button>
          )}
        </section>

        <aside className="rail" aria-label="Players and teams">
          <h3>Teams ({state.teams.length})</h3>
          {state.teams.length === 0 && <p className="muted small">No teams yet.</p>}
          <ul className="plist">
            {state.teams.map((t) => (
              <li key={t.id} style={{ display: 'block' }}>
                <strong>{t.name}</strong> <span className="muted small">({t.size})</span>
                <div className="muted small">Leader: {t.leader}</div>
                {st === 'lobby' || t.members.length > 1 ? (
                  <select aria-label={`Leader of ${t.name}`} value={t.leader} onChange={(e) => run('host:setLeader', { teamId: t.id, playerId: e.target.value })} style={{ minHeight: 40, marginTop: 4 }}>
                    {t.members.map((m) => <option key={m}>{m}</option>)}
                  </select>
                ) : null}
              </li>
            ))}
          </ul>
          <h3 className="section">Players ({state.playerCount})</h3>
          <ul className="plist">
            {(state.players || []).map((p) => (
              <li key={p.nickname}>
                <span className={`dot ${p.connected ? '' : 'off'}`} title={p.connected ? 'Connected' : 'Disconnected'} />
                <span className="grow">{p.nickname}{p.team && <span className="muted small"> in {p.team}</span>}</span>
                <button className="btn quiet small" onClick={() => window.confirm(`Remove ${p.nickname} from the quiz?`) && run('host:kick', { nickname: p.nickname })}>Remove</button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </Shell>
  );
}

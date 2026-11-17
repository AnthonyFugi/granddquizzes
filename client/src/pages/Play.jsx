import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Band from '../components/Band.jsx';
import { CodeTiles } from '../components/Code.jsx';
import { Leaderboard, Option, RoundBanner, ScoreText, TimeNote, TimerBar, Waiting, ordinal } from '../components/Quiz.jsx';
import { useCountdown, usePlayer } from '../hooks/useQuiz.js';
import { clearPlayer } from '../lib/socket.js';
import { OrgMark, SponsorStrip } from '../components/Brand.jsx';
import { brandVars, hasBrand } from '../lib/brand.js';

export default function Play() {
  const code = useParams().code.toUpperCase();
  const nav = useNavigate();
  const { phase, error, state, me, act, retry } = usePlayer(code);
  const clock = useCountdown(state);

  if (phase === 'kicked') {
    return (
      <Frame code={code}>
        <h1>You were removed from this quiz</h1>
        <p>The quiz master removed you from the room. You can join again with a different nickname.</p>
        <button className="btn" onClick={() => nav('/')}>Back to start</button>
      </Frame>
    );
  }
  if (phase === 'error') {
    return (
      <Frame code={code}>
        <h1>Could not join</h1>
        <p className="error" role="alert">{error}</p>
        <div className="row">
          <button className="btn" onClick={retry}>Try again</button>
          <button className="btn secondary" onClick={() => { clearPlayer(code); nav('/'); }}>Change code or name</button>
        </div>
      </Frame>
    );
  }
  if (!state || !me) {
    return (
      <Frame code={code}>
        <Waiting>Joining quiz {code}</Waiting>
      </Frame>
    );
  }

  return (
    <Frame code={code} title={state.title} branding={state.branding} banner={phase === 'reconnecting' ? 'Connection lost. Reconnecting...' : ''}>
      {state.status === 'lobby' && <Lobby state={state} me={me} act={act} />}
      {['question', 'locked'].includes(state.status) && <Question state={state} me={me} act={act} clock={clock} />}
      {state.status === 'reveal' && <Reveal state={state} me={me} />}
      {state.status === 'ended' && <Ended state={state} me={me} onLeave={() => { clearPlayer(code); nav('/'); }} />}
    </Frame>
  );
}

function Frame({ code, title, banner, branding, children }) {
  return (
    <div style={brandVars(branding)}>
      <Band />
      {branding?.accent && <div className="brand-stripe" />}
      {banner && <div className="banner" role="status">{banner}</div>}
      <main className="page">
        {hasBrand(branding) && <div style={{ marginBottom: 12 }}><OrgMark branding={branding} size={40} /></div>}
        <div className="row between" style={{ marginBottom: 18 }}>
          <span className="muted small">{title || 'Granddquiz'}</span>
          <CodeTiles code={code} size="small" />
        </div>
        {children}
        {branding && <SponsorStrip branding={branding} />}
        {branding?.poweredBy && <p className="powered-note">Quiz night powered by <strong>Granddquiz</strong></p>}
      </main>
    </div>
  );
}

const meKeyOf = (me) => (me.teamId ? `t:${me.teamId}` : `p:${me.playerId}`);

function Lobby({ state, me, act }) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const run = async (event, data) => {
    const r = await act(event, data);
    setErr(r.ok ? '' : r.error);
    return r;
  };
  const team = state.teams.find((t) => t.id === me.teamId);

  return (
    <div className="stack">
      <h1>You are in, {me.nickname}.</h1>
      <Waiting>Waiting for the quiz master to start. {state.playerCount} {state.playerCount === 1 ? 'player is' : 'players are'} here.</Waiting>
      <TimeNote seconds={state.timeLimit} />
      {err && <p className="error" role="alert">{err}</p>}

      {team ? (
        <section>
          <h2>{team.name}</h2>
          <p className="muted">{me.isLeader ? 'You are the team leader, so you pick the answer for everyone.' : `${team.leader} is the team leader and picks the answer for everyone.`}</p>
          <ul className="team-list">
            {team.members.map((m) => (
              <li key={m} className="row between">
                <span>{m}{m === team.leader && <span className="prize">leader</span>}</span>
                {me.isLeader && m !== me.nickname && (
                  <button className="btn quiet small" onClick={() => run('team:transferLeader', { playerNickname: m })}>Make leader</button>
                )}
              </li>
            ))}
          </ul>
          <button className="btn secondary" style={{ marginTop: 14 }} onClick={() => run('team:leave')}>Leave team</button>
        </section>
      ) : (
        <section>
          <h2>Play with a team</h2>
          <p className="muted">Create a team and you become its leader, who submits one answer for the group. Or join a team below. Playing solo is fine too.</p>
          <form
            className="row"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await run('team:create', { name });
              if (r.ok) setName('');
            }}
          >
            <input className="grow" aria-label="Team name" placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
            <button className="btn copper" disabled={name.trim().length < 2}>Create team</button>
          </form>
          {state.teams.length > 0 && (
            <ul className="team-list" style={{ marginTop: 14 }}>
              {state.teams.map((t) => (
                <li key={t.id} className="row between">
                  <span><strong>{t.name}</strong><br /><span className="muted small">{t.size} {t.size === 1 ? 'member' : 'members'}, led by {t.leader}</span></span>
                  <button className="btn secondary small" disabled={t.full} onClick={() => run('team:join', { teamId: t.id })}>{t.full ? 'Full' : 'Join'}</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Question({ state, me, act, clock }) {
  const q = state.question;
  const locked = state.status === 'locked';
  const [picked, setPicked] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { setPicked(null); setErr(''); }, [q.index]);

  const chosen = me.choice ?? picked;
  const canTap = me.canAnswer && picked == null && !locked;
  const choose = async (i) => {
    if (!canTap) return;
    setPicked(i);
    const r = await act('answer:submit', { choice: i });
    if (!r.ok) { setPicked(null); setErr(r.error); }
  };

  let note = '';
  if (locked) note = 'Time is up. Waiting for the answer.';
  else if (chosen != null) note = me.teamId ? 'Answer locked in for your team.' : 'Answer locked in.';
  else if (me.teamId && !me.isLeader) note = `${me.leaderName} answers for ${me.teamName}.`;

  return (
    <div>
      <RoundBanner round={q.round} />
      <div className="q-meta">
        <span className="muted">Question {q.index + 1} of {q.total}</span>
        <span className="chip">{q.category?.icon} {q.category?.name}</span>
      </div>
      {!locked && <TimerBar fraction={clock.fraction} left={clock.left} />}
      <h1 className="q-text">{q.text}</h1>
      <div className="options">
        {q.options.map((text, i) => (
          <Option key={i} index={i} text={text} onClick={() => choose(i)} disabled={!canTap} picked={chosen === i} dim={chosen != null && chosen !== i} />
        ))}
      </div>
      <p aria-live="polite" style={{ marginTop: 16 }}><strong>{note}</strong></p>
      {err && <p className="error" role="alert">{err}</p>}
      {me.teamId && !me.isLeader && !me.leaderConnected && !locked && (
        <button className="btn secondary" onClick={() => act('team:claimLeader')}>Your leader is offline. Take over as leader</button>
      )}
    </div>
  );
}

function Reveal({ state, me }) {
  const { reveal, question: q } = state;
  const res = me.result;
  const good = res?.answered && res.correct;
  const title = good ? 'Correct' : res?.answered ? 'Not this one' : 'No answer in time';
  return (
    <div>
      <div className={`verdict ${good ? 'good' : 'bad'}`} role="status" aria-live="polite">
        <h1 style={{ marginBottom: 4 }}>{title}</h1>
        {good && <div className="points">+{res.points.toLocaleString()} {res.points === 1 ? 'mark' : 'marks'}</div>}
        {me.teamId && <p className="muted small" style={{ margin: 0 }}>This is the answer {me.teamName} gave.</p>}
        {me.rank && <p style={{ margin: '8px 0 0' }}>You are {ordinal(me.rank)} of {me.of} with <strong><ScoreText score={me.score} possible={me.possible} /></strong> marks.</p>}
      </div>
      <h2 className="q-text" style={{ fontSize: '1.15rem' }}>{q.text}</h2>
      <div className="options">
        {q.options.map((text, i) => (
          <Option key={i} index={i} text={text} disabled correct={i === reveal.correctIndex} picked={res?.choice === i} dim={i !== reveal.correctIndex && res?.choice !== i} tally={reveal.tally?.[i]} tag={i === reveal.correctIndex ? 'Correct' : res?.choice === i ? (me.teamId ? 'Your team' : 'Your answer') : undefined} />
        ))}
      </div>
      {reveal.explanation && <p style={{ marginTop: 16 }}>{reveal.explanation}</p>}
      <h2 className="section">{q.round?.last ? `Standings after round ${q.round.number}` : 'Leaderboard'}</h2>
      <Leaderboard rows={state.leaderboard || []} meKey={meKeyOf(me)} limit={5} prizes={state.prizes} possible={state.possible} />
      <Waiting>Waiting for the next question.</Waiting>
    </div>
  );
}

function Ended({ state, me, onLeave }) {
  const mine = (state.winners || []).find((w) => w.key === meKeyOf(me));
  return (
    <div>
      <h1>That is the quiz.</h1>
      {mine ? (
        <div className="verdict good"><h2 style={{ marginBottom: 4 }}>You won a prize.</h2><p style={{ margin: 0 }}>{mine.prize} for finishing {ordinal(mine.rank)}. Find the quiz master to collect it.</p></div>
      ) : me.rank ? (
        <p>You finished {ordinal(me.rank)} of {me.of} with <strong><ScoreText score={me.score} possible={me.possible} /></strong> marks. Thanks for playing.</p>
      ) : null}
      <h2>Final standings</h2>
      <Leaderboard rows={state.leaderboard || []} meKey={meKeyOf(me)} limit={10} prizes={state.prizes} possible={state.possible} />
      <p className="muted small" style={{ marginTop: 18 }}>Only the top 10 nicknames and scores are kept, for a limited time, then deleted automatically. Registered players can sign up for the next event.</p>
      <button className="btn secondary" onClick={onLeave}>Done</button>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { CodeTiles } from '../components/Code.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { downloadCsv, resultsCsv, resultsFilename } from '../lib/csv.js';
import { useConfig } from '../hooks/useConfig.js';
import BrandingForm, { brandingBody, brandingFrom, emptyBranding } from '../components/BrandingForm.jsx';

export default function Host() {
  const { user } = useAuth();
  const isHost = user && ['host', 'admin'].includes(user.role);
  return <Shell wide={isHost}>{isHost ? <Events /> : <SignIn user={user} />}</Shell>;
}

export function SignIn({ user, title = 'Quiz master sign in' }) {
  const { login, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const cfg = useConfig();
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await login(email, password); setErr(''); } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return (
    <div style={{ maxWidth: 440 }}>
      <h1>{title}</h1>
      {user && <p className="error">You are signed in as a player ({user.email}). Sign out to use a quiz master account. <button className="btn quiet" onClick={logout}>Sign out</button></p>}
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn" disabled={busy}>Sign in</button>
        <p style={{ marginTop: 14 }}><Link to="/host/forgot">Forgot your password?</Link></p>
      </form>
      {title === 'Quiz master sign in' && <p style={{ marginTop: 18 }}>New here? <Link to="/host/signup">Request a quiz master account</Link>. FugiPay approves each new account.</p>}
    </div>
  );
}

function Events() {
  const nav = useNavigate();
  const { user } = useAuth();
  const dayLeft = user?.accessUntil ? Math.ceil((new Date(user.accessUntil) - Date.now()) / 86400000) : null;
  const [events, setEvents] = useState(null);
  const [cats, setCats] = useState([]);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');
  const load = () => api('/events/mine').then((r) => { setEvents(r); setErr(''); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); api('/categories').then(setCats).catch(() => {}); }, []);

  const remove = async (ev) => {
    if (!window.confirm(`Delete "${ev.title}" and its registrations?`)) return;
    try { setErr(''); await api(`/events/${ev._id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); }
  };

  return (
    <div>
      <div className="row between">
        <h1 style={{ marginBottom: 0 }}>Your events</h1>
        {!creating && !user?.expired && <button className="btn copper" onClick={() => setCreating(true)}>New event</button>}
      </div>
      {user?.expired && <p className="notice bad" role="alert">Your access ended on {new Date(user.accessUntil).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}. You can still view and download past results. To run events again, buy a plan on the <Link to="/host/billing">Plans</Link> page or <Link to="/contact">contact FugiPay</Link> (+260 777 210 641).</p>}
      {!user?.expired && dayLeft !== null && dayLeft <= 7 && <p className="notice" role="status">Your access ends in {dayLeft <= 1 ? 'a day' : `${dayLeft} days`}. A plan on the <Link to="/host/billing">Plans</Link> page keeps it going.</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {creating && <CreateEvent cats={cats} onCancel={() => setCreating(false)} onCreated={(ev) => nav(`/host/${ev._id}`)} />}
      <div className="section">
        {events === null && <p className="muted">Loading events...</p>}
        {events?.length === 0 && !creating && <p>No events yet. Create one, share its join code, and open the console when your guests arrive.</p>}
        {events?.map((ev) => <EventRow key={ev._id} ev={ev} onDelete={() => remove(ev)} onChanged={load} />)}
      </div>
    </div>
  );
}

function EventRow({ ev, onDelete, onChanged }) {
  const [regs, setRegs] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState(false);
  const [open, setOpen] = useState(false);
  const toggle = async () => {
    if (!open && regs === null) setRegs(await api(`/events/${ev._id}/registrations`).catch(() => []));
    setOpen(!open);
  };
  return (
    <div className="event">
      <div className="row between">
        <div>
          <h3 style={{ marginBottom: 4 }}>{ev.title} <span className={`status ${ev.status}`}>{ev.status}</span> <span className={`plan-badge ${ev.entitlements?.plan === 'free' ? '' : 'paid'}`}>{ev.entitlements ? `${ev.entitlements.planName}, up to ${ev.entitlements.maxPlayers} players` : ''}</span></h3>
          <div className="muted small">
            {ev.mode === 'blitz' ? `⚡ Blitz: ${Math.round((ev.blitzSeconds || 120) / 6) / 10} min, ${ev.questionCount} question pool, 1 point per correct answer` : `${ev.questionCount} questions, ${ev.timeLimit}s each, ${ev.marks || 10} marks per question (${ev.questionCount * (ev.marks || 10)} in all)`}
            {ev.categories?.length ? `, ${ev.categories.map((c) => c.name).join(', ')}${ev.categories.length > 1 && ev.rounds !== false ? ' (one round each)' : ''}` : ', all categories'}
            {ev.scheduledFor ? `. Scheduled ${new Date(ev.scheduledFor).toLocaleString()}` : ''}
          </div>
        </div>
        <CodeTiles code={ev.joinCode} size="small" />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        {ev.status !== 'ended' && <Link className="btn small" to={`/host/${ev._id}`}>{ev.status === 'live' ? 'Return to console' : 'Open console'}</Link>}
        <button className="btn secondary small" onClick={toggle}>Registrations ({ev.registrations})</button>
        {ev.status !== 'ended' && <Link className="btn secondary small" to={`/poster/${ev.joinCode}`}>QR poster</Link>}
        {ev.status !== 'ended' && <button className="btn secondary small" onClick={() => { setEditingQuiz(!editingQuiz); setEditing(false); }}>Edit quiz</button>}
        {ev.status !== 'ended' && <button className="btn secondary small" onClick={() => { setEditing(!editing); setEditingQuiz(false); }}>Look and sponsors</button>}
        {ev.status !== 'ended' && ev.entitlements?.via !== 'subscription' && ev.entitlements?.maxPlayers < 300 && <Link className="btn copper small" to={`/host/billing?event=${ev._id}`}>Upgrade</Link>}
        <button className="btn danger small" onClick={onDelete}>Delete</button>
      </div>
      {editingQuiz && <EditEvent ev={ev} onSaved={() => { setEditingQuiz(false); onChanged(); }} onCancel={() => setEditingQuiz(false)} />}
      {editing && <EditBranding ev={ev} onSaved={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />}
      {open && (
        <div style={{ marginTop: 10 }}>
          {regs?.length ? (
            <div className="scroll-x"><table className="table"><thead><tr><th>Name</th><th>Team</th><th>Phone</th><th>Email</th></tr></thead>
              <tbody>{regs.map((r, i) => <tr key={i}><td>{r.name}</td><td>{r.teamName || 'Solo'}</td><td>{r.phone}</td><td>{r.email}</td></tr>)}</tbody></table></div>
          ) : <p className="muted">Nobody has registered yet.</p>}
        </div>
      )}
      {ev.status === 'ended' && ev.results?.length > 0 && (
        <div className="row" style={{ marginTop: 10 }}>
          <span className="small">Results: {ev.results.slice(0, 3).map((r) => `${r.rank}. ${r.name} (${ev.possible ? `${r.score} / ${ev.possible}` : r.score})`).join('   ')}</span>
          <button className="btn quiet small" onClick={() => downloadCsv(resultsFilename(ev.title), resultsCsv({ prizes: ev.prizes, leaderboard: ev.results, possible: ev.possible }))}>Download top {ev.results.length} (CSV)</button>
        </div>
      )}
    </div>
  );
}

const toLocalInput = (d) => { if (!d) return ''; const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

function EditEvent({ ev, onSaved, onCancel }) {
  const [cats, setCats] = useState([]);
  useEffect(() => { api('/categories').then(setCats).catch(() => {}); }, []);
  const pz = (n) => ev.prizes?.find((p) => p.place === n)?.label || '';
  return (
    <CreateEvent
      cats={cats}
      editing={ev}
      initial={{ title: ev.title, mode: ev.mode || 'classic', blitzSeconds: ev.blitzSeconds || 120, questionCount: ev.questionCount, timeLimit: ev.timeLimit, difficulty: ev.difficulty || 'mixed', marks: ev.marks || 10, rounds: ev.rounds !== false, scheduledFor: toLocalInput(ev.scheduledFor), p1: pz(1), p2: pz(2), p3: pz(3) }}
      initialPicked={(ev.categories || []).map((c) => c._id || c)}
      onCancel={onCancel}
      onCreated={onSaved}
    />
  );
}

function CreateEvent({ cats, onCancel, onCreated, editing, initial, initialPicked }) {
  const [f, setF] = useState(initial || { title: '', mode: 'classic', blitzSeconds: 120, questionCount: 15, timeLimit: 20, difficulty: 'hard', marks: 10, rounds: true, scheduledFor: '', p1: '', p2: '', p3: '' });
  const [picked, setPicked] = useState(new Set(initialPicked || []));
  const [brand, setBrand] = useState(emptyBranding);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (id) => { const s = new Set(picked); s.has(id) ? s.delete(id) : s.add(id); setPicked(s); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const ev = await api(editing ? `/events/${editing._id}` : '/events', {
        method: editing ? 'PUT' : 'POST',
        body: {
          title: f.title, mode: f.mode, blitzSeconds: Number(f.blitzSeconds) || 120, questionCount: Number(f.questionCount), timeLimit: Number(f.timeLimit), difficulty: f.difficulty, marks: Number(f.marks) || 10, rounds: !!f.rounds,
          categories: [...picked], scheduledFor: f.scheduledFor ? new Date(f.scheduledFor).toISOString() : undefined, ...(editing ? {} : { branding: brandingBody(brand) }),
          prizes: [f.p1, f.p2, f.p3].map((label, i) => ({ place: i + 1, label })).filter((p) => p.label.trim()),
        },
      });
      onCreated(ev);
    } catch (x) { setErr(x.message); setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="section" style={{ maxWidth: 680 }}>
      <h2>{editing ? 'Edit quiz' : 'New event'}</h2>
      <div className="field">
        <span className="label">Quiz style</span>
        <div className="row" role="group" aria-label="Quiz style">
          <button type="button" className={`chip ${f.mode !== 'blitz' ? 'on' : ''}`} aria-pressed={f.mode !== 'blitz'} onClick={() => setF({ ...f, mode: 'classic', questionCount: f.mode === 'blitz' ? 15 : f.questionCount })}>Classic: one question at a time</button>
          <button type="button" className={`chip ${f.mode === 'blitz' ? 'on' : ''}`} aria-pressed={f.mode === 'blitz'} onClick={() => setF({ ...f, mode: 'blitz', questionCount: f.mode === 'blitz' ? f.questionCount : 60 })}>⚡ Blitz: race the clock</button>
        </div>
        <span className="muted small">{f.mode === 'blitz' ? 'Everyone plays at once on their own phone, answering as many questions as they can before the time runs out. Score = number of correct answers.' : 'The quiz master moves through the questions together with the room, with a timer on each.'}</span>
      </div>
      <div className="field"><label htmlFor="t">Event name</label><input id="t" value={f.title} onChange={set('title')} maxLength={100} placeholder="Friday quiz night" required /></div>
      <div className="field">
        <span className="label">Categories</span>
        <span className="muted small">Pick any number. Pick none for a mixed bag across everything. With several, the quiz can play one category at a time, in the order you tap them.</span>
        <div className="row">
          {cats.map((c) => (
            <button type="button" key={c._id} className={`chip ${picked.has(c._id) ? 'on' : ''}`} aria-pressed={picked.has(c._id)} onClick={() => toggle(c._id)}>
              {c.icon} {c.name} ({c.questionCount})
            </button>
          ))}
        </div>
      </div>
      {picked.size > 1 && f.mode !== 'blitz' && (
        <label className="check"><input type="checkbox" checked={!!f.rounds} onChange={(e) => setF({ ...f, rounds: e.target.checked })} /> Play in rounds: one category at a time, with a round title on the screen and the standings after each round. Untick to mix the categories together.</label>
      )}
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="field grow"><label htmlFor="n">{f.mode === 'blitz' ? 'Question pool' : 'Questions'}</label><input id="n" type="number" min="3" max={f.mode === 'blitz' ? 300 : 100} value={f.questionCount} onChange={set('questionCount')} /></div>
        {f.mode === 'blitz'
          ? <div className="field grow"><label htmlFor="bs">Blitz length (seconds)</label><input id="bs" type="number" min="30" max="900" value={f.blitzSeconds} onChange={set('blitzSeconds')} /></div>
          : <div className="field grow"><label htmlFor="s">Timer (seconds)</label><input id="s" type="number" min="5" max="120" value={f.timeLimit} onChange={set('timeLimit')} /></div>}
        <div className="field grow"><label htmlFor="d">Difficulty</label>
          <select id="d" value={f.difficulty} onChange={set('difficulty')}><option value="hard">Hard (adult level)</option><option value="challenging">Medium and hard</option><option value="medium">Medium</option><option value="mixed">Mixed (easy to hard)</option><option value="easy">Easy</option></select></div>
      </div>
      {f.mode === 'blitz' && (
        <div className="field">
          <span className="label">Blitz length</span>
          <div className="presets" role="group" aria-label="Blitz length presets">{[60, 120, 180, 300, 600].map((n) => <button type="button" key={n} className={`chip ${Number(f.blitzSeconds) === n ? 'on' : ''}`} aria-pressed={Number(f.blitzSeconds) === n} onClick={() => setF({ ...f, blitzSeconds: n })}>{n / 60} min</button>)}</div>
          <span className="muted small">Every player gets the same questions in their own random order, so the pool should be bigger than the most anyone can answer in time (about {Math.ceil((Number(f.blitzSeconds) || 120) / 6)} questions in {Math.round((Number(f.blitzSeconds) || 120) / 60 * 10) / 10} minutes is a fast player). Skipping a question costs nothing. Ties go to the player with fewer wrong answers, then the faster correct answers. A team's score is its members' correct answers added together.</span>
        </div>
      )}
      {f.mode !== 'blitz' && <div className="field">
        <span className="label">Timer presets</span>
        <div className="presets" role="group" aria-label="Timer presets">{[10, 20, 30, 45, 60].map((n) => <button type="button" key={n} className={`chip ${Number(f.timeLimit) === n ? 'on' : ''}`} aria-pressed={Number(f.timeLimit) === n} onClick={() => setF({ ...f, timeLimit: n })}>{n}s</button>)}</div>
        <span className="muted small">Every question is timed (5 to 120 seconds). Answers lock automatically when the clock reaches zero.</span>
      </div>}
      {f.mode !== 'blitz' && <div className="field"><label htmlFor="mk">Marks for each correct answer</label>
        <input id="mk" type="number" min="1" max="100" value={f.marks} onChange={set('marks')} style={{ maxWidth: 140 }} />
        <span className="muted small">Every question is worth the same. The quiz is out of {(Number(f.questionCount) || 0) * (Number(f.marks) || 0)} marks in all. If two players tie, the faster correct answers win.</span></div>}
      <div className="field"><span className="label">Prizes (optional)</span>
        <input aria-label="First prize" placeholder="1st place prize" value={f.p1} onChange={set('p1')} />
        <input aria-label="Second prize" placeholder="2nd place prize" value={f.p2} onChange={set('p2')} />
        <input aria-label="Third prize" placeholder="3rd place prize" value={f.p3} onChange={set('p3')} />
      </div>
      {!editing && (
        <details className="field" style={{ marginBottom: 16 }}>
          <summary style={{ fontWeight: 600, cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>Your logo, colour and sponsors (optional)</summary>
          <BrandingForm value={brand} onChange={setBrand} />
        </details>
      )}
      <div className="field"><label htmlFor="when">Scheduled for (optional)</label><input id="when" type="datetime-local" min={toLocalInput(new Date())} value={f.scheduledFor} onChange={set('scheduledFor')} /><span className="muted small">The waiting room opens 15 minutes before this time. At this time the quiz starts by itself once a player has joined, unless you have opened the console and taken over. Need more time? Edit the quiz and move it to a later time. Leave it empty to start it yourself.</span></div>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="row"><button className="btn" disabled={busy}>{editing ? 'Save changes' : 'Create event'}</button><button type="button" className="btn secondary" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function EditBranding({ ev, onSaved, onCancel }) {
  const [v, setV] = useState(() => brandingFrom(ev.branding));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api(`/events/${ev._id}/branding`, { method: 'PUT', body: brandingBody(v) }); onSaved(); } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <div className="section" style={{ maxWidth: 680 }}>
      <BrandingForm value={v} onChange={setV} entitlements={ev.entitlements} />
      {err && <p className="error" role="alert">{err}</p>}
      <div className="row"><button className="btn" disabled={busy} onClick={save}>Save</button><button className="btn secondary" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

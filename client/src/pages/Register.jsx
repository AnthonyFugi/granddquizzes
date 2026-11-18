import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { CodeInput, CODE_LENGTH } from '../components/Code.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

// Optional. Guests never need this: it is for people who want to sign up for a future event.
export default function Register() {
  const { user, register, login, logout } = useAuth();
  const [code, setCode] = useState('');
  const [event, setEvent] = useState(null);
  const [mode, setMode] = useState('register');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [teamName, setTeamName] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    setEvent(null);
    if (code.length !== CODE_LENGTH) return;
    api(`/events/by-code/${code}`).then((ev) => { setEvent(ev); setErr(''); }).catch((e) => setErr(e.message));
  }, [code]);

  const submitAccount = async (e) => {
    e.preventDefault();
    try {
      if (mode === 'register') await register({ name: f.name, email: f.email, phone: f.phone, password: f.password });
      else await login(f.email, f.password);
      setErr('');
    } catch (x) { setErr(x.message); }
  };
  const signUp = async (e) => {
    e.preventDefault();
    try {
      await api(`/events/by-code/${code}/register`, { method: 'POST', body: { teamName } });
      setDone(event.title);
      setErr('');
    } catch (x) { setErr(x.message); }
  };

  if (done) {
    return (
      <Shell>
        <h1>You are registered.</h1>
        <p>{teamName ? `${teamName} is` : 'You are'} on the list for {done}. On the day, join with the code from the big screen, and create the team again in the lobby.</p>
        <p className="muted small">Your account stays so you can register for later events. This registration is removed automatically after the event.</p>
        <Link className="btn" to="/">Back to start</Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1>Register for an event</h1>
      <p className="muted">Registering is optional and only for planning ahead. On the night anyone can still join with the code, no account needed.</p>
      <div className="field"><label htmlFor="join-code">Event code</label><CodeInput value={code} onChange={setCode} /></div>
      {err && <p className="error" role="alert">{err}</p>}
      {event && (
        <section className="stack">
          <h2>{event.title}</h2>
          <p className="muted">{event.scheduledFor ? `Scheduled ${new Date(event.scheduledFor).toLocaleString()}.` : 'No date set yet.'}</p>
          {event.prizes?.length > 0 && <p>Prizes: {event.prizes.map((p) => `${p.place}. ${p.label}`).join(', ')}</p>}
          {!user ? (
            <form onSubmit={submitAccount}>
              <div className="row" style={{ marginBottom: 12 }}>
                <button type="button" className={`chip ${mode === 'register' ? 'on' : ''}`} onClick={() => setMode('register')}>Create account</button>
                <button type="button" className={`chip ${mode === 'login' ? 'on' : ''}`} onClick={() => setMode('login')}>I have an account</button>
              </div>
              {mode === 'register' && <div className="field"><label htmlFor="rn">Full name</label><input id="rn" value={f.name} onChange={set('name')} required /></div>}
              <div className="field"><label htmlFor="re">Email</label><input id="re" type="email" autoComplete="username" value={f.email} onChange={set('email')} required /></div>
              {mode === 'register' && <div className="field"><label htmlFor="rp">Phone (optional)</label><input id="rp" type="tel" value={f.phone} onChange={set('phone')} /></div>}
              <div className="field"><label htmlFor="rw">Password (8 or more characters)</label><input id="rw" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={f.password} onChange={set('password')} required /></div>
              <button className="btn">{mode === 'register' ? 'Create account' : 'Sign in'}</button>
              {mode === 'login' && <p style={{ marginTop: 14 }}><Link to="/host/forgot">Forgot your password?</Link></p>}
            </form>
          ) : (
            <form onSubmit={signUp}>
              <p>Signed in as {user.name}. <button type="button" className="btn quiet small" onClick={logout}>Not you?</button></p>
              <div className="field"><label htmlFor="tn">Team name (leave empty to play solo)</label><input id="tn" value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={24} /></div>
              <button className="btn">Register</button>
            </form>
          )}
        </section>
      )}
    </Shell>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useConfig } from '../hooks/useConfig.js';

export default function HostSignup() {
  const { register } = useAuth();
  const cfg = useConfig();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await register({ ...f, role: 'host' }); nav('/host'); } catch (x) { setErr(x.message); setBusy(false); }
  };

  return (
    <Shell>
      <div style={{ maxWidth: 460 }}>
        <h1>Run your own quiz night</h1>
        <p className="muted">Create a quiz master account. It is free to try with up to 10 players. Upgrade any time for bigger rooms, your own logo and sponsors.</p>
        {cfg && !cfg.hostSignup ? (
          <p className="notice">Quiz master sign-up is closed right now. Contact FugiPay to get an account.</p>
        ) : (
          <form onSubmit={submit}>
            <div className="field"><label htmlFor="su-name">Your name</label><input id="su-name" autoComplete="name" value={f.name} onChange={set('name')} required minLength={2} /></div>
            <div className="field"><label htmlFor="su-email">Email</label><input id="su-email" type="email" autoComplete="email" value={f.email} onChange={set('email')} required /></div>
            <div className="field"><label htmlFor="su-phone">Phone (for payment receipts)</label><input id="su-phone" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} placeholder="+260 97 000 0000" /></div>
            <div className="field"><label htmlFor="su-pw">Password (8 or more characters)</label><input id="su-pw" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} required minLength={8} /></div>
            {err && <p className="error" role="alert">{err}</p>}
            <button className="btn" disabled={busy}>Create account</button>
          </form>
        )}
        <p className="small" style={{ marginTop: 18 }}>Already have an account? <Link to="/host">Sign in</Link></p>
        <p className="muted small">Your guests never need an account. Only quiz masters sign up.</p>
      </div>
    </Shell>
  );
}

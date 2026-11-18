import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { api } from '../lib/api.js';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { const r = await api('/auth/forgot', { method: 'POST', body: { email } }); setDone(r.message); } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return (
    <Shell>
      <div style={{ maxWidth: 440 }}>
        <h1>Forgot your password?</h1>
        {done ? (
          <>
            <p role="status">{done}</p>
            <p className="muted">Nothing in your inbox after a few minutes? Check spam, or <Link to="/contact">contact FugiPay</Link> and we will help.</p>
            <Link className="btn secondary" to="/host">Back to sign in</Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="muted">Enter the email address of your account and we will send you a link to choose a new password.</p>
            <div className="field"><label htmlFor="fe">Email</label><input id="fe" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            {err && <p className="error" role="alert">{err}</p>}
            <div className="row"><button className="btn" disabled={busy}>Send reset link</button><Link className="btn secondary" to="/host">Back</Link></div>
          </form>
        )}
      </div>
    </Shell>
  );
}

export function ResetPassword() {
  const { token } = useParams();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) { setErr('The two passwords do not match'); return; }
    setBusy(true); setErr('');
    try { await api('/auth/reset', { method: 'POST', body: { token, password: pw } }); setDone(true); } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return (
    <Shell>
      <div style={{ maxWidth: 440 }}>
        <h1>Choose a new password</h1>
        {done ? (
          <>
            <p role="status">Your password has been changed.</p>
            <button className="btn" onClick={() => nav('/host')}>Go to sign in</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="field"><label htmlFor="np">New password (at least 8 characters)</label><input id="np" type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
            <div className="field"><label htmlFor="np2">Type it again</label><input id="np2" type="password" autoComplete="new-password" minLength={8} value={pw2} onChange={(e) => setPw2(e.target.value)} required /></div>
            {err && <p className="error" role="alert">{err} {err.includes('expired') && <Link to="/host/forgot">Get a new link</Link>}</p>}
            <button className="btn" disabled={busy}>Change password</button>
          </form>
        )}
      </div>
    </Shell>
  );
}

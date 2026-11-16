import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Band from '../components/Band.jsx';
import Logo from '../components/Logo.jsx';
import { CodeInput, CODE_LENGTH } from '../components/Code.jsx';
import { clearPlayer, readPlayer } from '../lib/socket.js';
import { api } from '../lib/api.js';
import { OrgMark } from '../components/Brand.jsx';
import { brandVars, hasBrand } from '../lib/brand.js';

export default function Join() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [code, setCode] = useState((params.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH));
  const [nick, setNick] = useState(sessionStorage.getItem('gq:nick') || '');
  const [ev, setEv] = useState(null);
  useEffect(() => {
    setEv(null);
    if (code.length !== CODE_LENGTH) return;
    let live = true;
    api(`/events/by-code/${code}`).then((e) => live && setEv(e)).catch(() => {});
    return () => { live = false; };
  }, [code]);
  const ready = code.length === CODE_LENGTH && nick.trim().length >= 2;

  const submit = (e) => {
    e.preventDefault();
    if (!ready) return;
    const name = nick.trim();
    sessionStorage.setItem('gq:nick', name);
    // Same nickname on the same quiz = rejoin as the same player; a new nickname starts fresh
    const saved = readPlayer(code);
    if (saved && saved.nickname.toLowerCase() !== name.toLowerCase()) clearPlayer(code);
    nav(`/play/${code}`);
  };

  return (
    <>
      <Band height={26} />
      <main className="page">
        <div style={{ margin: '14px 0 28px' }}><Logo size={44} /></div>
        <h1>Got a code? Join the quiz.</h1>
        <p className="muted">Enter the five characters shown on the big screen.</p>
        <form onSubmit={submit} className="stack" style={{ marginTop: 24 }}>
          <div className="field">
            <label htmlFor="join-code">Join code</label>
            <CodeInput value={code} onChange={setCode} />
          </div>
          {ev && (
            <div className="found" style={brandVars(ev.branding)} role="status">
              {hasBrand(ev.branding) && <OrgMark branding={ev.branding} size={36} />}
              <span><strong>{ev.title}</strong>{ev.status === 'ended' ? ' (finished)' : ''}</span>
            </div>
          )}
          <div className="field">
            <label htmlFor="nick">Your nickname</label>
            <input id="nick" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} autoComplete="off" placeholder="What should we call you?" />
          </div>
          <button className="btn block" disabled={!ready}>Join quiz</button>
        </form>
        <p className="muted small" style={{ marginTop: 18 }}>No account needed. If you finish in the top 10, your nickname and score are kept for a limited time so the host can see the results, then deleted automatically. Nothing else is saved unless you register.</p>
        <hr className="divider" />
        <p>Playing in a coming event with your group? <Link to="/register">Register your team</Link>.</p>
        <p className="small"><Link to="/host">Quiz master sign in</Link> · <Link to="/contact">Contact us</Link></p>
      </main>
    </>
  );
}

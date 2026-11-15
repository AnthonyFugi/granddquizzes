import { useEffect, useState } from 'react';
import Shell from '../components/Shell.jsx';
import { SignIn } from './Host.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

export default function AdminHosts() {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Shell><SignIn user={user} title="Admin sign in" /></Shell>;
  return <Shell wide><List me={user} /></Shell>;
}

const d = (x) => (x ? new Date(x).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function List({ me }) {
  const [rows, setRows] = useState(null);
  const [plans, setPlans] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [pick, setPick] = useState({}); // id -> { plan, days }
  const load = () => api('/hosts').then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); api('/billing/plans').then((p) => setPlans(p.plans.filter((x) => x.kind === 'subscription'))).catch(() => {}); }, []);

  const act = async (fn, ok) => { try { await fn(); setErr(''); setMsg(ok); load(); } catch (x) { setMsg(''); setErr(x.message); } };
  const grant = (h) => {
    const p = pick[h.id] || {};
    return act(() => api(`/hosts/${h.id}/grant`, { method: 'POST', body: { planKey: p.plan || plans[0]?.key, days: p.days ? Number(p.days) : undefined } }), `Plan given to ${h.name}.`);
  };

  return (
    <div>
      <h1>Quiz masters</h1>
      <p className="muted">Give a pilot venue a free trial, record a bank-transfer payment as a plan, or switch an account off.</p>
      {err && <p className="error" role="alert">{err}</p>}
      {msg && <p className="notice ok" role="status">{msg}</p>}
      {rows === null ? <p className="muted">Loading...</p> : (
        <div className="scroll-x"><table className="table">
          <thead><tr><th>Name</th><th>Contact</th><th>Events</th><th>Plan</th><th>Give a plan</th><th></th></tr></thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id} style={h.active ? undefined : { opacity: 0.55 }}>
                <td><strong>{h.name}</strong><div className="muted small">Joined {d(h.createdAt)}{h.role === 'admin' ? ' · admin' : ''}</div></td>
                <td className="small">{h.email}<br />{h.phone}</td>
                <td>{h.events}{h.lastEventAt && <div className="muted small">last {d(h.lastEventAt)}</div>}</td>
                <td>{h.subscription ? <><strong>{plans.find((p) => p.key === h.subscription.plan)?.name || h.subscription.plan}</strong><div className="muted small">until {d(h.subscription.until)}</div></> : <span className="muted">Free</span>}</td>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    <select aria-label={`Plan for ${h.name}`} style={{ minHeight: 40, width: 'auto' }} value={pick[h.id]?.plan || plans[0]?.key || ''} onChange={(e) => setPick({ ...pick, [h.id]: { ...pick[h.id], plan: e.target.value } })}>
                      {plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                    </select>
                    <input aria-label={`Days for ${h.name}`} type="number" min="1" max="400" placeholder="days" style={{ minHeight: 40, width: 84 }} value={pick[h.id]?.days || ''} onChange={(e) => setPick({ ...pick, [h.id]: { ...pick[h.id], days: e.target.value } })} />
                    <button className="btn small" onClick={() => grant(h)}>Give</button>
                    {h.subscription && <button className="btn quiet small" onClick={() => window.confirm(`Remove ${h.name}'s plan?`) && act(() => api(`/hosts/${h.id}/revoke`, { method: 'POST', body: {} }), 'Plan removed.')}>Remove</button>}
                  </div>
                </td>
                <td>{h.id !== me.id && <button className={`btn small ${h.active ? 'danger' : 'secondary'}`} onClick={() => act(() => api(`/hosts/${h.id}`, { method: 'PATCH', body: { active: !h.active } }), h.active ? 'Account switched off.' : 'Account switched on.')}>{h.active ? 'Switch off' : 'Switch on'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import Shell from '../components/Shell.jsx';
import { SignIn } from './Host.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

const TOPIC = { demo: 'Demo', pricing: 'Pricing', support: 'Support', account: 'Account', other: 'Other' };

export default function AdminMessages() {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Shell><SignIn user={user} title="Admin sign in" /></Shell>;
  return <Shell wide><List /></Shell>;
}

function List() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const load = () => api('/contact').then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const act = async (fn) => { try { await fn(); load(); } catch (x) { setErr(x.message); } };
  const fresh = (rows || []).filter((m) => m.status === 'new').length;
  return (
    <div>
      <h1>Messages</h1>
      <p className="muted">Sent from the Contact page. {rows ? `${fresh} waiting for a reply.` : ''} Messages are deleted after 180 days.</p>
      {err && <p className="error" role="alert">{err}</p>}
      {rows?.length === 0 && <p>No messages yet.</p>}
      {rows?.map((m) => (
        <div key={m.id} className="event" style={{ opacity: m.status === 'done' ? 0.6 : 1 }}>
          <div className="row between">
            <div><strong>{m.name}</strong> <span className="status scheduled">{TOPIC[m.topic]}</span> {m.status === 'new' && <span className="status live">new</span>}
              <div className="muted small">{new Date(m.createdAt).toLocaleString()}</div></div>
            <div className="row" style={{ gap: 8 }}>
              {m.email && <a className="btn small" href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your Granddquiz message')}`}>Email</a>}
              {m.phone && <a className="btn secondary small" href={`https://wa.me/${m.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>}
              <button className="btn quiet small" onClick={() => act(() => api(`/contact/${m.id}`, { method: 'PATCH', body: { status: m.status === 'new' ? 'done' : 'new' } }))}>{m.status === 'new' ? 'Mark done' : 'Reopen'}</button>
              <button className="btn danger small" onClick={() => window.confirm('Delete this message?') && act(() => api(`/contact/${m.id}`, { method: 'DELETE' }))}>Delete</button>
            </div>
          </div>
          <p style={{ whiteSpace: 'pre-wrap', margin: '10px 0 4px' }}>{m.message}</p>
          <div className="small muted">{[m.email, m.phone].filter(Boolean).join(' · ')}</div>
        </div>
      ))}
    </div>
  );
}

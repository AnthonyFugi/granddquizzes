import { useState } from 'react';
import Shell from '../components/Shell.jsx';
import { api } from '../lib/api.js';

export const CONTACT = { phone: '+260 777 210 641', tel: '+260777210641', wa: '260777210641', email: 'business@fugipay.com' };

const topics = [['demo', 'I want a demo'], ['pricing', 'Pricing and plans'], ['support', 'Help with an event'], ['account', 'My quiz master account'], ['other', 'Something else']];

export default function Contact() {
  const [f, setF] = useState({ name: '', email: '', phone: '', topic: 'demo', message: '', website: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await api('/contact', { method: 'POST', body: f }); setSent(true); } catch (x) { setErr(x.message); }
    setBusy(false);
  };

  return (
    <Shell>
      <div style={{ maxWidth: 560 }}>
        <h1>Contact FugiPay</h1>
        <p className="muted">Questions, a demo for your event, or help with a quiz. We reply as soon as we can, usually the same working day.</p>
        <div className="row" style={{ margin: '14px 0 22px' }}>
          <a className="btn" href={`https://wa.me/${CONTACT.wa}?text=${encodeURIComponent('Hello FugiPay, I have a question about Granddquiz.')}`} target="_blank" rel="noreferrer">WhatsApp us</a>
          <a className="btn secondary" href={`tel:${CONTACT.tel}`}>Call {CONTACT.phone}</a>
          <a className="btn secondary" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
        </div>
        {sent ? (
          <p className="notice ok" role="status">Thank you, {f.name.split(' ')[0]}. Your message has reached FugiPay and we will reply on {f.email || f.phone}.</p>
        ) : (
          <form onSubmit={submit}>
            <h2 style={{ fontSize: '1.2rem' }}>Or send a message</h2>
            <div className="field"><label htmlFor="cn">Your name</label><input id="cn" value={f.name} onChange={set('name')} maxLength={80} required autoComplete="name" /></div>
            <div className="field"><label htmlFor="ce">Email</label><input id="ce" type="email" value={f.email} onChange={set('email')} maxLength={120} autoComplete="email" /></div>
            <div className="field"><label htmlFor="cp">Phone or WhatsApp</label><input id="cp" type="tel" value={f.phone} onChange={set('phone')} maxLength={30} autoComplete="tel" /><span className="muted small">Give at least an email or a phone number.</span></div>
            <div className="field"><label htmlFor="ct">What is it about?</label>
              <select id="ct" value={f.topic} onChange={set('topic')}>{topics.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="field"><label htmlFor="cm">Message</label><textarea id="cm" rows={5} value={f.message} onChange={set('message')} maxLength={2000} required /></div>
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}><label>Leave this empty<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></label></div>
            {err && <p className="error" role="alert">{err}</p>}
            <button className="btn" disabled={busy}>{busy ? 'Sending...' : 'Send message'}</button>
          </form>
        )}
      </div>
    </Shell>
  );
}

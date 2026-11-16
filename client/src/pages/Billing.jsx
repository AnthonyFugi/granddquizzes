import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { SignIn } from './Host.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { money } from '../lib/brand.js';

export default function Billing() {
  const { user } = useAuth();
  if (!user || !['host', 'admin'].includes(user.role)) return <Shell><SignIn user={user} /></Shell>;
  return <Shell wide><Plans /></Shell>;
}

const when = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const STATUS_TEXT = { successful: 'Paid', pending: 'Waiting', failed: 'Failed', cancelled: 'Cancelled' };

function Plans() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [me, setMe] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState(params.get('event') || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null); // { status, text }
  const poll = useRef(null);

  const load = () => Promise.all([api('/billing/plans'), api('/billing/me'), api('/events/mine')])
    .then(([p, m, e]) => { setData(p); setMe(m); setEvents(e.filter((x) => x.status !== 'ended')); })
    .catch((x) => setErr(x.message));
  useEffect(() => { load(); }, []);

  // Coming back from the payment page: confirm the result, waiting a little if the bank is slow
  const ref = params.get('ref');
  const returned = params.get('status');
  useEffect(() => {
    if (!ref) return undefined;
    let tries = 0;
    const check = async () => {
      try {
        const p = await api(`/billing/payments/${encodeURIComponent(ref)}`);
        if (p.status === 'successful') { setConfirm({ status: 'ok', text: 'Payment received. Your plan is active.' }); load(); return; }
        if (['failed', 'cancelled'].includes(p.status) || returned === 'cancelled') { setConfirm({ status: 'bad', text: p.status === 'failed' ? 'The payment did not go through. You have not been charged for a plan.' : 'Payment cancelled. Nothing was charged.' }); return; }
        setConfirm({ status: 'wait', text: 'Waiting for the payment to be confirmed. This can take a minute with mobile money.' });
        if (++tries < 20) poll.current = setTimeout(check, 3000);
        else setConfirm({ status: 'bad', text: 'We have not received confirmation yet. If money left your account, it will be applied automatically within a few minutes, or contact FugiPay with reference ' + ref });
      } catch { setConfirm({ status: 'bad', text: 'Could not check that payment. Refresh this page in a minute.' }); }
    };
    check();
    return () => clearTimeout(poll.current);
  }, [ref]);

  const buy = async (plan) => {
    setErr('');
    setBusy(plan.key);
    try {
      const { link } = await api('/billing/checkout', { method: 'POST', body: { planKey: plan.key, eventId: plan.kind === 'event' ? eventId : undefined } });
      window.location.assign(link);
    } catch (x) { setErr(x.message); setBusy(''); }
  };

  if (!data || !me) return <div><h1>Plans</h1>{err ? <p className="error" role="alert">{err}</p> : <p className="muted">Loading plans...</p>}</div>;
  const cur = data.currency;
  const passes = data.plans.filter((p) => p.kind === 'event');
  const subs = data.plans.filter((p) => p.kind === 'subscription');
  const chosen = events.find((e) => e._id === eventId);

  return (
    <div>
      <h1>Plans and billing</h1>
      {confirm && <p className={`notice ${confirm.status}`} role="status">{confirm.text} <button className="btn quiet small" onClick={() => { setConfirm(null); setParams({}); }}>Dismiss</button></p>}
      {err && <p className="error" role="alert">{err}</p>}
      {!data.paymentsEnabled && <p className="notice">Online payment is not switched on yet. <Link to="/contact">Contact FugiPay</Link> to pay by mobile money or bank transfer and we will activate your plan.</p>}

      <div className="current">
        {me.subscription
          ? <p><strong>{data.plans.find((p) => p.key === me.subscription.plan)?.name || me.subscription.plan}</strong> is active until {when(me.subscription.until)}. Every event you run is covered.</p>
          : <p><strong>Free try-out.</strong> Up to 10 players per event, with the Granddquiz badge. Pay per event, or subscribe if you run quiz nights regularly.</p>}
      </div>

      <h2 className="section">Pay for one event</h2>
      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="which">Which event is it for?</label>
        <select id="which" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">Choose an event</option>
          {events.map((e) => <option key={e._id} value={e._id}>{e.title} ({e.joinCode}) - up to {e.entitlements?.maxPlayers} players now</option>)}
        </select>
        {events.length === 0 && <span className="muted small">Create an event first, then come back to upgrade it. <Link to="/host">Your events</Link></span>}
      </div>
      <div className="plan-grid">
        {passes.map((p) => <PlanCard key={p.key} plan={p} currency={cur} busy={busy === p.key} disabled={!data.paymentsEnabled || !eventId || (chosen?.entitlements?.maxPlayers >= p.maxPlayers)} hint={!eventId ? 'Choose an event first' : chosen?.entitlements?.maxPlayers >= p.maxPlayers ? 'Already included' : ''} onBuy={() => buy(p)} />)}
      </div>

      <h2 className="section">Run quiz nights all the time</h2>
      <div className="plan-grid">
        {subs.map((p) => <PlanCard key={p.key} plan={p} currency={cur} busy={busy === p.key} disabled={!data.paymentsEnabled} featured={p.key === 'venue_month'} onBuy={() => buy(p)} />)}
      </div>
      <p className="muted small">Pay with mobile money (MTN, Airtel) or card on the secure Flutterwave page. We never see or store your card or wallet details. A subscription does not renew by itself: pay again when it ends, and the days are added to what is left.</p>

      {me.payments.length > 0 && (
        <>
          <h2 className="section">Payments</h2>
          <div className="scroll-x"><table className="table"><thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead>
            <tbody>{me.payments.map((p) => <tr key={p.txRef}><td>{when(p.createdAt)}</td><td>{data.plans.find((x) => x.key === p.planKey)?.name || p.planKey}</td><td>{money(p.amount, p.currency)}</td><td>{STATUS_TEXT[p.status] || p.status}</td><td className="small">{p.txRef}</td></tr>)}</tbody></table></div>
        </>
      )}
    </div>
  );
}

function PlanCard({ plan, currency, onBuy, busy, disabled, hint, featured }) {
  return (
    <div className={`plan ${featured ? 'featured' : ''}`}>
      {featured && <span className="ribbon">Most popular for venues</span>}
      <h3>{plan.name}</h3>
      <div className="price">{money(plan.price, currency)}{plan.kind === 'subscription' && <span className="per"> / {plan.days === 365 ? 'year' : '30 days'}</span>}</div>
      <p className="small" style={{ margin: '6px 0 10px' }}>{plan.blurb}</p>
      <ul className="small ticks">
        <li>Up to {plan.maxPlayers} players{plan.kind === 'subscription' ? ' per event' : ''}</li>
        <li>Your logo, name and colour</li>
        <li>{plan.sponsors} sponsor slot{plan.sponsors === 1 ? '' : 's'}</li>
        <li>{plan.whiteLabel ? 'No Granddquiz badge' : 'Small Granddquiz badge'}</li>
      </ul>
      <button className="btn block" disabled={disabled || busy} onClick={onBuy}>{busy ? 'Opening payment...' : `Pay ${money(plan.price, currency)}`}</button>
      {hint && <p className="muted small" style={{ margin: '6px 0 0' }}>{hint}</p>}
    </div>
  );
}

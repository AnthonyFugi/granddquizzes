// Full-stack billing test: real server + real MongoDB + a FAKE Flutterwave on localhost (so it never touches
// the real payment service or real money).   Needs MongoDB:  npm run test:billing
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { io as ioc } from 'socket.io-client';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017').replace(/\/$/, '');
const dbName = `granddquiz_billing_${Date.now()}`;
const port = 5800 + Math.floor(Math.random() * 300);
const fakePort = port + 400;
const API = `http://localhost:${port}`;
const CLIENT = 'https://granddquiz.web.app';
const HASH = 'whsec-integration';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✓ ${name}`); };

// ---- fake Flutterwave
const txs = new Map(); // tx_ref -> { id, amount, currency, status }
let nextId = 9000;
const seenAuth = new Set();
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    seenAuth.add(req.headers.authorization);
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === '/v3/payments') {
      const b = JSON.parse(body);
      assert.ok(b.tx_ref && b.amount && b.currency && b.redirect_url && b.customer?.email, 'checkout body is complete');
      txs.set(b.tx_ref, { tx_ref: b.tx_ref, amount: b.amount, currency: b.currency, status: 'pending', redirect: b.redirect_url, meta: b.meta, title: b.customizations?.title });
      return send(200, { status: 'success', message: 'Hosted Link', data: { link: `http://pay.fake/${b.tx_ref}` } });
    }
    const byId = url.pathname.match(/^\/v3\/transactions\/(\d+)\/verify$/);
    if (req.method === 'GET' && byId) {
      const t = [...txs.values()].find((x) => String(x.id) === byId[1]);
      return t ? send(200, { status: 'success', data: t }) : send(404, { status: 'error', message: 'No transaction' });
    }
    if (req.method === 'GET' && url.pathname === '/v3/transactions/verify_by_reference') {
      const t = txs.get(url.searchParams.get('tx_ref'));
      return t && t.id ? send(200, { status: 'success', data: t }) : send(404, { status: 'error', message: 'No transaction' });
    }
    send(404, { status: 'error' });
  });
});
await new Promise((r) => fake.listen(fakePort, r));
const pay = (txRef, over = {}) => { const t = txs.get(txRef); Object.assign(t, { id: t.id || ++nextId, status: 'successful' }, over); return t; };

// ---- real server
const child = spawn('node', ['src/server.js'], {
  cwd: serverDir,
  env: {
    ...process.env, PORT: String(port), MONGODB_URI: `${base}/${dbName}`, JWT_SECRET: 'integration-secret',
    ADMIN_EMAIL: 'admin@test.dev', ADMIN_PASSWORD: 'TestPass123', ADMIN_NAME: 'Test Admin', AUTO_SEED: 'true',
    ALLOW_HOST_SIGNUP: '', CLIENT_ORIGIN: CLIENT, CLIENT_PUBLIC_URL: CLIENT, API_PUBLIC_URL: API, NODE_ENV: 'test',
    FLW_SECRET_KEY: 'FLWSECK_TEST-fake', FLW_SECRET_HASH: HASH, FLW_BASE_URL: `http://localhost:${fakePort}`, PLAN_PRICES: '',
  },
});
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));
const cleanup = async () => { child.kill(); fake.close(); try { await mongoose.connection.dropDatabase(); } catch {} await mongoose.disconnect().catch(() => {}); };
const fail = async (e) => { console.error('\nFAILED:', e.stack || e.message || e, '\n--- server log ---\n' + log.slice(-1500)); await cleanup(); process.exit(1); };
process.on('unhandledRejection', fail);
for (let i = 0; i < 100 && !/ready/.test(log); i++) await sleep(150);
if (!/ready/.test(log)) await fail(new Error('server did not start'));
await mongoose.connect(`${base}/${dbName}`);

const call = async (method, url, body, token, extra = {}) => {
  const res = await fetch(API + url, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, body: ct.includes('json') ? await res.json().catch(() => ({})) : null };
};
const connect = async () => { const s = ioc(API, { transports: ['websocket'] }); const c = { s, state: null }; s.on('state', (x) => (c.state = x)); await new Promise((r) => s.on('connect', r)); return c; };
const emit = (c, e, d) => new Promise((r) => c.s.emit(e, d, r));
const webhook = (payload, hash = HASH) => call('POST', '/api/billing/webhook', payload, null, hash ? { 'verif-hash': hash } : {});
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

try {
  console.log('Sign-up, plans and branding');
  const cfg = (await call('GET', '/api/config')).body;
  assert.equal(cfg.hostSignup, true); assert.equal(cfg.paymentsEnabled, true); assert.equal(cfg.currency, 'ZMW');
  ok('config: sign-up on by default, payments on, currency ZMW');
  const plans = (await call('GET', '/api/billing/plans')).body;
  assert.equal(plans.plans.length, 6); assert.ok(plans.plans.find((p) => p.key === 'event_medium'));
  ok('plans are public');

  const su = await call('POST', '/api/auth/register', { name: 'Venue Owner', email: 'owner@venue.test', password: 'password123', phone: '+260971000000', role: 'host' });
  assert.equal(su.status, 201); assert.equal(su.body.pending, true); assert.equal(su.body.token, undefined);
  const su2 = await call('POST', '/api/auth/register', { name: 'Other Host', email: 'other@venue.test', password: 'password123', role: 'host' });
  assert.equal(su2.body.pending, true);
  assert.equal((await call('POST', '/api/auth/login', { email: 'owner@venue.test', password: 'password123' })).status, 403);
  const admin0 = (await call('POST', '/api/auth/login', { email: 'admin@test.dev', password: 'TestPass123' })).body;
  const pend = (await call('GET', '/api/hosts', null, admin0.token)).body.filter((h) => h.status === 'pending');
  assert.equal(pend.length, 2);
  for (const h of pend) assert.equal((await call('PATCH', `/api/hosts/${h.id}`, { status: 'approved' }, admin0.token)).status, 200);
  const host = (await call('POST', '/api/auth/login', { email: 'owner@venue.test', password: 'password123' })).body;
  const host2 = (await call('POST', '/api/auth/login', { email: 'other@venue.test', password: 'password123' })).body;
  assert.equal(host.user.role, 'host');
  ok('a new quiz master waits for approval, cannot sign in, and can once the admin approves');

  const cats = (await call('GET', '/api/categories')).body;
  const mk = (title, extra = {}) => call('POST', '/api/events', { title, questionCount: 5, timeLimit: 10, categories: [cats[0]._id], branding: { orgName: 'Hot Spot Lounge', tagline: 'Thursday nights', accent: '#cf6a1f', sponsors: ['Mosi', 'Zamtel'], logo: pixel }, ...extra }, host.token);
  const evRes = await mk('Thursday quiz');
  assert.equal(evRes.status, 201); const ev = evRes.body;
  assert.ok(!JSON.stringify(ev).includes('base64'), 'create response has no logo data');
  const bad = await call('POST', '/api/events', { title: 'Bad logo', questionCount: 5, categories: [cats[0]._id], branding: { logo: 'data:image/svg+xml;base64,PHN2Zz4=' } }, host.token);
  assert.equal(bad.status, 400);
  ok('event saved with branding; a bad logo is refused');

  const mine = (await call('GET', '/api/events/mine', null, host.token)).body;
  assert.equal(mine[0].entitlements.maxPlayers, 10); assert.equal(mine[0].branding.hasLogo, true); assert.equal(mine[0].branding.logo, undefined);
  ok('event list shows the free limits and never ships the logo image');

  const pub = (await call('GET', `/api/events/by-code/${ev.joinCode}`)).body;
  assert.deepEqual(pub.branding, { poweredBy: true });
  assert.equal((await call('GET', `/api/events/by-code/${ev.joinCode}/logo`)).status, 404);
  ok('free event: guests see no custom branding and no logo');

  console.log('Free player cap over real sockets');
  const hostSock = await connect();
  assert.equal((await emit(hostSock, 'host:open', { token: host.token, eventId: ev._id })).ok, true);
  const players = [];
  for (let i = 0; i < 10; i++) { const p = await connect(); assert.equal((await emit(p, 'player:join', { code: ev.joinCode, nickname: `Player${i}` })).ok, true); players.push(p); }
  const extra = await connect();
  const full = await emit(extra, 'player:join', { code: ev.joinCode, nickname: 'Eleventh' });
  assert.equal(full.ok, false); assert.match(full.error, /full \(10 players\)/);
  assert.equal(hostSock.state.maxPlayers, 10);
  ok('the 11th player is turned away; the host sees the cap');

  console.log('Paying for an event pass');
  assert.equal((await call('POST', '/api/billing/checkout', { planKey: 'event_medium', eventId: ev._id })).status, 401);
  assert.equal((await call('POST', '/api/billing/checkout', { planKey: 'event_medium' }, host.token)).status, 404);
  assert.equal((await call('POST', '/api/billing/checkout', { planKey: 'event_medium', eventId: ev._id }, host2.token)).status, 404);
  assert.equal((await call('POST', '/api/billing/checkout', { planKey: 'nonsense', eventId: ev._id }, host.token)).status, 400);
  ok('checkout needs sign-in, an event of your own, and a real plan');

  const co1 = await call('POST', '/api/billing/checkout', { planKey: 'event_medium', eventId: ev._id }, host.token);
  assert.equal(co1.status, 201); assert.match(co1.body.link, /^http:\/\/pay\.fake\/gq_/);
  const tx1 = txs.get(co1.body.txRef);
  assert.equal(tx1.amount, 400); assert.equal(tx1.currency, 'ZMW'); assert.equal(tx1.redirect, `${API}/api/billing/callback`);
  assert.equal(tx1.meta.event, ev._id); assert.ok([...seenAuth].includes('Bearer FLWSECK_TEST-fake'));
  ok('checkout asks Flutterwave for the right amount (K400, ZMW) and return address, signed with the secret key');

  // a customer who tampers with the return link: claims success but Flutterwave has no record
  let cb = await call('GET', `/api/billing/callback?status=successful&tx_ref=${co1.body.txRef}&transaction_id=1`);
  assert.equal(cb.status, 302); assert.match(cb.headers.get('location'), new RegExp(`^${CLIENT}/host/billing\\?status=pending`));
  assert.equal((await call('GET', '/api/events/mine', null, host.token)).body[0].entitlements.maxPlayers, 10);
  ok('a forged "successful" return link grants nothing');

  // paid too little
  pay(co1.body.txRef, { amount: 100 });
  cb = await call('GET', `/api/billing/callback?status=successful&tx_ref=${co1.body.txRef}&transaction_id=${tx1.id}`);
  assert.match(cb.headers.get('location'), /status=pending/);
  assert.equal((await call('GET', '/api/events/mine', null, host.token)).body[0].entitlements.maxPlayers, 10);
  ok('an underpayment grants nothing');

  // pays properly
  pay(co1.body.txRef, { amount: 400 });
  cb = await call('GET', `/api/billing/callback?status=successful&tx_ref=${co1.body.txRef}&transaction_id=${tx1.id}`);
  assert.match(cb.headers.get('location'), new RegExp(`^${CLIENT}/host/billing\\?status=successful&ref=${co1.body.txRef}`));
  const after = (await call('GET', '/api/events/mine', null, host.token)).body[0];
  assert.equal(after.tier, 'event_medium'); assert.equal(after.entitlements.maxPlayers, 100); assert.equal(after.entitlements.branding, true);
  assert.equal((await call('GET', `/api/billing/payments/${co1.body.txRef}`, null, host.token)).body.status, 'successful');
  assert.equal((await call('GET', `/api/billing/payments/${co1.body.txRef}`, null, host2.token)).status, 404);
  ok('a verified payment upgrades the event; other quiz masters cannot see it');

  const pub2 = (await call('GET', `/api/events/by-code/${ev.joinCode}`)).body;
  assert.equal(pub2.branding.orgName, 'Hot Spot Lounge'); assert.deepEqual(pub2.branding.sponsors, ['Mosi', 'Zamtel']); assert.equal(pub2.branding.accent, '#cf6a1f');
  assert.equal(pub2.branding.logoUrl, `/api/events/by-code/${ev.joinCode}/logo`); assert.equal(pub2.branding.poweredBy, true);
  const logoRes = await fetch(`${API}${pub2.branding.logoUrl}`);
  assert.equal(logoRes.status, 200); assert.equal(logoRes.headers.get('content-type'), 'image/png'); assert.equal(logoRes.headers.get('x-content-type-options'), 'nosniff');
  assert.ok((await logoRes.arrayBuffer()).byteLength > 20);
  ok('paid event now shows its branding to guests and serves the logo as a plain image');

  // upgrade takes effect mid-event once the host console is opened again
  assert.equal((await emit(extra, 'player:join', { code: ev.joinCode, nickname: 'Eleventh' })).ok, false);
  assert.equal((await emit(hostSock, 'host:open', { token: host.token, eventId: ev._id })).ok, true);
  assert.equal((await emit(extra, 'player:join', { code: ev.joinCode, nickname: 'Eleventh' })).ok, true);
  assert.equal(hostSock.state.maxPlayers, 100);
  ok('reopening the console after paying lifts the cap, with the same live game');

  // replay of the same payment changes nothing; webhook for it is a no-op
  const wh = await webhook({ event: 'charge.completed', data: { tx_ref: co1.body.txRef, id: tx1.id, status: 'successful' } });
  assert.equal(wh.status, 200);
  assert.equal((await mongoose.connection.db.collection('payments').countDocuments({ txRef: co1.body.txRef, status: 'successful' })), 1);
  ok('replaying a paid return link or webhook does nothing twice');

  console.log('Subscription, webhook and double delivery');
  const co2 = await call('POST', '/api/billing/checkout', { planKey: 'venue_month' }, host.token);
  assert.equal(co2.status, 201);
  assert.equal(txs.get(co2.body.txRef).amount, 600);
  assert.equal((await webhook({ event: 'charge.completed', data: { tx_ref: co2.body.txRef, id: 1 } }, 'wrong-hash')).status, 401);
  assert.equal((await webhook({ event: 'charge.completed', data: { tx_ref: co2.body.txRef, id: 1 } }, null)).status, 401);
  assert.equal((await call('GET', '/api/auth/me', null, host.token)).body.user.subscription, null);
  ok('a webhook with a wrong or missing hash is refused and grants nothing');

  const t2 = pay(co2.body.txRef, { amount: 600 });
  const payload = { event: 'charge.completed', data: { tx_ref: co2.body.txRef, id: t2.id, status: 'successful' } };
  const [w1, w2] = await Promise.all([webhook(payload), webhook(payload)]);
  assert.equal(w1.status, 200); assert.equal(w2.status, 200);
  await call('GET', `/api/billing/callback?status=successful&tx_ref=${co2.body.txRef}&transaction_id=${t2.id}`);
  const sub = (await call('GET', '/api/auth/me', null, host.token)).body.user.subscription;
  assert.equal(sub.plan, 'venue_month');
  const days = (new Date(sub.until) - Date.now()) / 86400000;
  assert.ok(days > 29.9 && days < 30.1, `30 days, got ${days}`);
  ok('webhook + webhook + browser return all at once still grant exactly 30 days');

  const evB = (await mk('Second quiz')).body;
  const mine2 = (await call('GET', '/api/events/mine', null, host.token)).body;
  assert.equal(mine2.find((e) => e._id === evB._id).entitlements.maxPlayers, 100); assert.equal(mine2.find((e) => e._id === evB._id).entitlements.via, 'subscription');
  assert.equal((await call('POST', '/api/billing/checkout', { planKey: 'event_small', eventId: evB._id }, host.token)).status, 400);
  ok('a subscription covers every event, and a smaller pass is not sold on top of it');

  const t3 = txs.get((await call('POST', '/api/billing/checkout', { planKey: 'venue_month' }, host.token)).body.txRef);
  pay(t3.tx_ref, { amount: 600 });
  await webhook({ event: 'charge.completed', data: { tx_ref: t3.tx_ref, id: t3.id } });
  const days2 = (new Date((await call('GET', '/api/auth/me', null, host.token)).body.user.subscription.until) - Date.now()) / 86400000;
  assert.ok(days2 > 59.9 && days2 < 60.1, `60 days, got ${days2}`);
  ok('paying again early adds 30 more days on top');

  const cancelled = await call('POST', '/api/billing/checkout', { planKey: 'pro_month' }, host.token);
  cb = await call('GET', `/api/billing/callback?status=cancelled&tx_ref=${cancelled.body.txRef}`);
  assert.match(cb.headers.get('location'), /status=cancelled/);
  assert.equal((await call('GET', `/api/billing/payments/${cancelled.body.txRef}`, null, host.token)).body.status, 'cancelled');
  assert.equal((await call('GET', '/api/billing/callback?status=successful&tx_ref=nope&transaction_id=5')).headers.get('location').includes('status=unknown'), true);
  ok('cancelled and unknown returns are handled without granting anything');

  console.log('Admin: quiz masters and grants');
  const admin = (await call('POST', '/api/auth/login', { email: 'admin@test.dev', password: 'TestPass123' })).body;
  assert.equal((await call('GET', '/api/hosts', null, host.token)).status, 403);
  const list = (await call('GET', '/api/hosts', null, admin.token)).body;
  const row = list.find((h) => h.email === 'owner@venue.test');
  assert.equal(row.events, 2); assert.equal(row.subscription.plan, 'venue_month');
  assert.equal(list.find((h) => h.email === 'other@venue.test').subscription, null);
  ok('only an admin sees the quiz master list, with plan and event counts');

  const other = list.find((h) => h.email === 'other@venue.test');
  assert.equal((await call('POST', `/api/hosts/${other.id}/grant`, { planKey: 'event_small' }, admin.token)).status, 400);
  const g = await call('POST', `/api/hosts/${other.id}/grant`, { planKey: 'pro_month', days: 14 }, admin.token);
  assert.equal(g.status, 200);
  const otherNow = (await call('GET', '/api/auth/me', null, host2.token)).body.user.subscription;
  assert.equal(otherNow.plan, 'pro_month'); assert.ok(Math.abs((new Date(otherNow.until) - Date.now()) / 86400000 - 14) < 0.1);
  await call('POST', `/api/hosts/${other.id}/revoke`, {}, admin.token);
  assert.equal((await call('GET', '/api/auth/me', null, host2.token)).body.user.subscription, null);
  ok('admin can give a pilot venue 14 days of Pro, and take it back');

  assert.equal((await call('PATCH', `/api/hosts/${other.id}`, { active: false }, admin.token)).status, 200);
  assert.equal((await call('GET', '/api/auth/me', null, host2.token)).status, 403);
  assert.equal((await call('POST', '/api/auth/login', { email: 'other@venue.test', password: 'password123' })).status, 403);
  assert.equal((await call('PATCH', `/api/hosts/${admin.user.id}`, { active: false }, admin.token)).status, 400);
  await call('PATCH', `/api/hosts/${other.id}`, { active: true }, admin.token);
  assert.equal((await call('POST', '/api/auth/login', { email: 'other@venue.test', password: 'password123' })).status, 200);
  ok('a switched-off account cannot sign in or use its token; admins cannot lock themselves out');

  console.log('Editing branding on a live event');
  const put = await call('PUT', `/api/events/${ev._id}/branding`, { orgName: 'New Name', sponsors: ['Only One'], accent: '#3b3fa6' }, host.token);
  assert.equal(put.status, 200); assert.equal(put.body.branding.orgName, 'New Name'); assert.equal(put.body.branding.hasLogo, true);
  await until(() => hostSock.state?.branding?.orgName === 'New Name');
  assert.ok(hostSock.state.branding.logoUrl);
  assert.equal((await call('PUT', `/api/events/${ev._id}/branding`, { orgName: 'x' }, host2.token)).status, 404);
  assert.equal((await call('PUT', `/api/events/${ev._id}/branding`, { logo: '' }, host.token)).body.branding.hasLogo, false);
  assert.equal((await fetch(`${API}/api/events/by-code/${ev.joinCode}/logo`)).status, 404);
  ok('branding edits reach the live screen at once; removing the logo removes the image; others cannot edit');

  // ----- time-limited access -----
  const adm = (await call('POST', '/api/auth/login', { email: 'admin@test.dev', password: 'TestPass123' })).body;
  const hostRow = (await call('GET', '/api/hosts', null, adm.token)).body.find((h) => h.email === 'other@venue.test');
  assert.ok(hostRow.accessUntil, 'approval sets an end date'); assert.equal(hostRow.expired, false);
  const accessDays = Math.round((new Date(hostRow.accessUntil) - Date.now()) / 86400000); assert.ok(accessDays >= 29 && accessDays <= 30, `default 30 days, got ${accessDays}`);
  await mongoose.connection.collection('users').updateOne({ email: 'other@venue.test' }, { $set: { accessUntil: new Date(Date.now() - 86400000) } });
  assert.equal((await call('GET', '/api/events/mine', null, host2.token)).status, 200);
  assert.equal((await call('POST', '/api/events', { title: 'Late quiz', questionCount: 5, timeLimit: 10, categories: [cats[0]._id] }, host2.token)).status, 403);
  assert.equal((await call('GET', '/api/auth/me', null, host2.token)).body.user.expired, true);
  assert.equal((await call('POST', `/api/hosts/${hostRow.id}/extend`, { days: 10 }, adm.token)).status, 200);
  assert.equal((await call('POST', '/api/events', { title: 'Back again', questionCount: 5, timeLimit: 10, categories: [cats[0]._id] }, host2.token)).status, 201);
  assert.equal((await call('POST', `/api/hosts/${adm.user.id}/extend`, { days: 10 }, adm.token)).status, 400);
  ok('quiz master access ends on its date (view only), an admin can extend it, admins never expire');

  console.log(`\n${passed} checks passed`);
  await cleanup();
  process.exit(0);
} catch (e) {
  await fail(e);
}

async function until(fn, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return; await sleep(25); } throw new Error('timed out waiting for live update'); }

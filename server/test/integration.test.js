// Full-stack test against a REAL MongoDB: boots the real server on a throwaway database, then exercises
// seeding, sign-in and roles, events, registration, the admin question bank, a live game over sockets,
// and the saved results / auto-delete fields.
//   Needs a MongoDB on this machine:  npm run test:db
//   Another MongoDB:                  TEST_MONGODB_URI=mongodb://host:27017 npm run test:db
// It never reads your .env database settings and always drops its own database at the end.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { io as ioc } from 'socket.io-client';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017').replace(/\/$/, '');
const dbName = `granddquiz_test_${Date.now()}`;
const port = 5400 + Math.floor(Math.random() * 400);
const API = `http://localhost:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✓ ${name}`); };

// ---- boot the real server
const child = spawn('node', ['src/server.js'], {
  cwd: serverDir,
  env: {
    ...process.env, PORT: String(port), MONGODB_URI: `${base}/${dbName}`, JWT_SECRET: 'integration-secret',
    ADMIN_EMAIL: 'admin@test.dev', ADMIN_PASSWORD: 'TestPass123', ADMIN_NAME: 'Test Admin',
    AUTO_SEED: 'true', ALLOW_HOST_SIGNUP: 'false', RETENTION_DAYS: '1', CLIENT_ORIGIN: '', NODE_ENV: 'test',
  },
});
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));
const cleanup = async () => {
  child.kill();
  try { await mongoose.connection.dropDatabase(); } catch {}
  await mongoose.disconnect().catch(() => {});
};
const fail = async (e) => { console.error('\nFAILED:', e.message || e, '\n--- server log ---\n' + log.slice(-1500)); await cleanup(); process.exit(1); };
process.on('unhandledRejection', fail);

for (let i = 0; i < 100 && !/ready/.test(log); i++) await sleep(150);
if (!/ready/.test(log)) await fail(new Error('server did not start'));
await mongoose.connect(`${base}/${dbName}`);

const call = async (method, url, body, token) => {
  const res = await fetch(API + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

try {
  console.log('Startup, seed and accounts');
  assert.equal((await call('GET', '/api/health')).body.ok, true);
  const cats = (await call('GET', '/api/categories')).body;
  assert.equal(cats.length, 10); assert.equal(cats.reduce((n, c) => n + c.questionCount, 0), 217);
  ok('server booted, seeded 10 categories / 217 questions');
  assert.match((await fetch(API + '/')).headers.get('content-type'), /html/);
  ok('GET / returns a page, not a bare 404');

  assert.equal((await call('POST', '/api/auth/login', { email: 'admin@test.dev', password: 'wrong' })).status, 401);
  const admin = (await call('POST', '/api/auth/login', { email: 'ADMIN@test.dev', password: 'TestPass123' })).body;
  assert.ok(admin.token); assert.equal(admin.user.role, 'admin');
  ok('admin created from env can sign in (wrong password refused)');

  assert.equal((await call('POST', '/api/auth/register', { name: 'Sneaky', email: 's@t.dev', password: 'longenough1', role: 'host' })).status, 403);
  const hostAcc = { name: 'Host One', email: 'host1@test.dev', password: 'HostPass123' };
  assert.equal((await call('POST', '/api/auth/hosts', hostAcc, admin.token)).status, 201);
  assert.equal((await call('POST', '/api/auth/hosts', hostAcc, admin.token)).status, 409);
  const host = (await call('POST', '/api/auth/login', hostAcc)).body;
  assert.equal(host.user.role, 'host');
  await call('POST', '/api/auth/hosts', { name: 'Host Two', email: 'host2@test.dev', password: 'HostPass456' }, admin.token);
  const host2 = (await call('POST', '/api/auth/login', { email: 'host2@test.dev', password: 'HostPass456' })).body;
  ok('quiz masters are admin-created only; duplicates refused');

  const player = (await call('POST', '/api/auth/register', { name: 'Pat Player', email: 'pat@test.dev', password: 'PlayerPass1', phone: '0977000000' })).body;
  assert.equal(player.user.role, 'player'); assert.equal(player.user.passwordHash, undefined);
  assert.equal((await call('POST', '/api/events', { title: 'Nope' }, player.token)).status, 403);
  assert.equal((await call('GET', '/api/questions', null, host.token)).status, 403);
  assert.equal((await call('GET', '/api/questions', null, null)).status, 401);
  ok('roles enforced: players cannot host, hosts cannot edit the question bank, anonymous refused');

  console.log('Events and registration');
  const geo = cats.find((c) => c.slug === 'geography'), sci = cats.find((c) => c.slug === 'science-nature');
  const tooMany = await call('POST', '/api/events', { title: 'Too big', categories: [geo._id], questionCount: 60 }, host.token);
  assert.equal(tooMany.status, 400); assert.match(tooMany.body.error, /Only \d+ questions/);
  const created = await call('POST', '/api/events', { title: 'Integration quiz', categories: [geo._id, sci._id], questionCount: 5, timeLimit: 10, prizes: [{ place: 1, label: 'Hamper' }] }, host.token);
  assert.equal(created.status, 201); const ev = created.body;
  assert.equal(ev.joinCode.length, 5); assert.equal(ev.status, 'scheduled');
  ok('event created with a 5-character code; oversized request refused with a clear message');

  const info = (await call('GET', `/api/events/by-code/${ev.joinCode.toLowerCase()}`)).body;
  assert.equal(info.title, 'Integration quiz'); assert.equal(info.live, false);
  assert.equal((await call('POST', `/api/events/by-code/${ev.joinCode}/register`, { teamName: 'Lions' })).status, 401);
  assert.equal((await call('POST', `/api/events/by-code/${ev.joinCode}/register`, { teamName: 'Lions' }, player.token)).status, 201);
  assert.equal((await call('POST', `/api/events/by-code/${ev.joinCode}/register`, { teamName: 'Lions FC' }, player.token)).status, 201); // upsert, not duplicate
  const regs = (await call('GET', `/api/events/${ev._id}/registrations`, null, host.token)).body;
  assert.equal(regs.length, 1); assert.equal(regs[0].name, 'Pat Player'); assert.equal(regs[0].teamName, 'Lions FC');
  assert.equal((await call('GET', `/api/events/${ev._id}/registrations`, null, host2.token)).status, 404);
  ok('registration needs an account, re-registering updates instead of duplicating, other hosts cannot see it');

  console.log('Admin question bank');
  const added = await call('POST', '/api/questions', { category: geo._id, text: 'Integration test question?', options: ['A1', 'B2', 'C3', 'D4'], correctIndex: 2, difficulty: 'easy' }, admin.token);
  assert.equal(added.status, 201);
  assert.equal((await call('POST', '/api/questions', { category: geo._id, text: 'Integration test question?', options: ['A1', 'B2', 'C3', 'D4'], correctIndex: 2, difficulty: 'easy' }, admin.token)).status, 409);
  const imp = (await call('POST', '/api/questions/import', [
    { category: 'sports', text: 'Imported question one?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, difficulty: 'medium' },
    { category: 'nonsense', text: 'Bad category?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, difficulty: 'medium' },
  ], admin.token)).body;
  assert.equal(imp.added, 1); assert.equal(imp.skipped.length, 1);
  const found = (await call('GET', '/api/questions?q=integration%20test', null, admin.token)).body;
  assert.equal(found.total, 1);
  assert.equal((await call('PUT', `/api/questions/${added.body._id}`, { active: false }, admin.token)).status, 200);
  assert.equal((await call('DELETE', `/api/questions/${added.body._id}`, null, admin.token)).status, 200);
  ok('add, duplicate refused, bulk import (bad row skipped), search, hide, delete');

  console.log('Live game on the real database');
  const connect = async () => { const s = ioc(API, { transports: ['websocket'] }); const c = { s, state: null, info: null }; s.on('state', (x) => (c.state = x)); s.on('hostInfo', (x) => (c.info = x)); await new Promise((r) => s.on('connect', r)); return c; };
  const emit = (c, e, d) => new Promise((r) => c.s.emit(e, d, r));
  const until = async (label, fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return; await sleep(25); } throw new Error('timed out: ' + label); };

  const intruder = await connect();
  assert.equal((await emit(intruder, 'host:open', { token: host2.token, eventId: ev._id })).ok, false);
  assert.equal((await emit(intruder, 'host:open', { token: 'garbage', eventId: ev._id })).ok, false);
  const hostSock = await connect();
  const opened = await emit(hostSock, 'host:open', { token: host.token, eventId: ev._id });
  assert.equal(opened.ok, true); assert.equal(opened.totalQuestions, 5);
  assert.equal((await call('GET', `/api/events/by-code/${ev.joinCode}`)).body.live, true);
  ok("only the event's own quiz master can open it; the lobby then shows as live");

  const alice = await connect(), bob = await connect();
  assert.equal((await emit(alice, 'player:join', { code: ev.joinCode, nickname: 'Alice' })).ok, true);
  assert.equal((await emit(bob, 'player:join', { code: ev.joinCode, nickname: 'Bob' })).ok, true);
  const seen = new Set();
  for (let q = 0; q < 5; q++) {
    assert.equal((await emit(hostSock, 'host:next', {})).ok, true);
    await until(`question ${q + 1}`, () => alice.state?.status === 'question' && alice.state.question.index === q && hostSock.info?.correctIndex != null);
    const text = alice.state.question.text; assert.ok(!seen.has(text), 'no repeated question'); seen.add(text);
    const right = hostSock.info.correctIndex;
    await emit(alice, 'answer:submit', { choice: right });
    await emit(bob, 'answer:submit', { choice: (right + 1) % 4 });
    await until('locked', () => hostSock.state?.status === 'locked');
    await emit(hostSock, 'host:reveal', {});
    await until('reveal', () => alice.state?.status === 'reveal');
  }
  assert.equal(seen.size, 5);
  assert.equal(hostSock.state.leaderboard[0].name, 'Alice');
  await emit(hostSock, 'host:end', {});
  await until('ended', () => alice.state?.status === 'ended');
  assert.equal(alice.state.winners[0].name, 'Alice'); assert.equal(alice.state.winners[0].prize, 'Hamper');
  ok('5 questions drawn from the real bank without repeats, scored, winner and prize announced');

  await sleep(400); // persistEnd runs just after the 'ended' broadcast
  const saved = await mongoose.connection.db.collection('events').findOne({ joinCode: ev.joinCode });
  assert.equal(saved.status, 'ended'); assert.equal(saved.results.length, 2); assert.equal(saved.results[0].name, 'Alice');
  assert.ok(saved.purgeAt > new Date() && saved.purgeAt < new Date(Date.now() + 2 * 86400000), 'purgeAt about 1 day ahead');
  const reg = await mongoose.connection.db.collection('registrations').findOne({ event: saved._id });
  assert.ok(reg.purgeAt, 'registration gets a purge date when the event ends');
  const ttl = async (c) => (await mongoose.connection.db.collection(c).indexes()).some((i) => i.expireAfterSeconds === 0 && i.key.purgeAt === 1);
  assert.ok(await ttl('events') && await ttl('registrations'), 'TTL auto-delete indexes exist');
  // Guests are never saved as accounts: their nicknames may appear ONLY in the event's top-10 results
  for (const name of await mongoose.connection.db.listCollections().toArray()) {
    if (name.name === 'events') continue;
    const docs = JSON.stringify(await mongoose.connection.db.collection(name.name).find().toArray());
    assert.ok(!docs.includes('"Bob"') && !docs.includes('"Alice"'), `guest nickname leaked into ${name.name}`);
  }
  assert.equal(await mongoose.connection.db.collection('users').countDocuments({ name: { $in: ['Alice', 'Bob'] } }), 0);
  ok('results saved (top 10 nicknames + scores), purge dates set, TTL indexes exist, guests never saved as accounts');
  assert.equal((await emit(await connect(), 'player:join', { code: ev.joinCode, nickname: 'Late' })).ok, false);
  assert.equal((await emit(await connect(), 'host:open', { token: host.token, eventId: ev._id })).ok, false);
  ok('finished events cannot be reopened or joined');

  console.log(`\nALL ${passed} CHECKS PASSED (real MongoDB ${(await mongoose.connection.db.admin().serverInfo()).version})`);
  await cleanup();
  process.exit(0);
} catch (e) {
  await fail(e);
}

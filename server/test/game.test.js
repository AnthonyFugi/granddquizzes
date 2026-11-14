// End-to-end test of the live quiz engine over real sockets, with the database replaced by fakes.
// Run: npm test
import http from 'node:http';
import assert from 'node:assert/strict';
import { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';
import { registerSockets } from '../src/sockets/index.js';
import { SessionStore } from '../src/services/sessionStore.js';
import { UserError } from '../src/services/errors.js';
import { toLive } from '../src/services/questionPicker.js';
import { loadSeed } from '../seed/seedRunner.js';
import { shuffle } from '../src/services/questionPicker.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (text, options, correctIndex) => ({
  id: text, text, options, correctIndex, explanation: 'because', difficulty: 'easy', category: { name: 'Test', icon: 'T' },
});
const questions = [
  q('Q1', ['A', 'B', 'C', 'D'], 1),
  q('Q2', ['A', 'B', 'C', 'D'], 0),
  q('Q3', ['A', 'B', 'C', 'D'], 2),
];

let markedLive = false;
let persisted = null;
const deps = {
  store: new SessionStore(),
  async authorizeHost(token) {
    if (token !== 'host-token') throw new UserError('Please sign in again');
    return { id: 'ev1', title: 'Test Quiz', joinCode: 'ABC234', categories: [], questionCount: 3, timeLimit: 1, difficulty: 'mixed', prizes: [{ place: 1, label: 'Hamper' }] };
  },
  async loadQuestions() { return questions; },
  async markLive() { markedLive = true; },
  async persistEnd(s) { persisted = s.finalStandings; },
};

const server = http.createServer();
const io = new Server(server, { cors: { origin: true } });
registerSockets(io, deps);
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}`;

async function client() {
  const s = ioc(url, { transports: ['websocket'] });
  const c = { s, state: null, me: null, hostInfo: null };
  s.on('state', (x) => (c.state = x));
  s.on('me', (x) => (c.me = x));
  s.on('hostInfo', (x) => (c.hostInfo = x));
  await new Promise((r) => s.on('connect', r));
  return c;
}
const call = (c, ev, data) => new Promise((r) => c.s.emit(ev, data, r));
async function until(label, fn, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return;
    await sleep(20);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✓ ${name}`); };

console.log('Live engine');
const host = await client();
let r = await call(host, 'host:open', { token: 'wrong', eventId: 'ev1' });
assert.equal(r.ok, false); ok('host with a bad token is rejected');
r = await call(host, 'host:open', { token: 'host-token', eventId: 'ev1' });
assert.equal(r.ok, true); assert.equal(r.code, 'ABC234'); assert.equal(r.totalQuestions, 3);
assert.ok(markedLive); ok('host opens the event, session created in memory');

r = await call(host, 'host:next', {});
assert.equal(r.ok, false); ok('cannot start with no players');

const alice = await client(), bob = await client(), cara = await client();
r = await call(alice, 'player:join', { code: 'abc234', nickname: 'Alice' });
assert.equal(r.ok, true); const aliceId = r.playerId;
assert.equal((await call(bob, 'player:join', { code: 'ABC234', nickname: 'Bob' })).ok, true);
r = await call(cara, 'player:join', { code: 'ABC234', nickname: 'Cara' });
const caraId = r.playerId;
r = await call(await client(), 'player:join', { code: 'ABC234', nickname: 'ALICE' });
assert.equal(r.ok, false); ok('duplicate nickname rejected (case-insensitive)');
r = await call(await client(), 'player:join', { code: 'NOPE22', nickname: 'Zed' });
assert.equal(r.ok, false); ok('unknown join code rejected');

assert.equal((await call(alice, 'team:create', { name: 'Lions' })).ok, true);
await until('team visible', () => bob.state?.teams?.length === 1);
assert.equal((await call(bob, 'team:join', { teamId: bob.state.teams[0].id })).ok, true);
await until('Bob in team', () => bob.me?.teamName === 'Lions');
assert.equal(bob.me.isLeader, false); assert.equal(alice.me.isLeader, true);
await until('player list', () => host.state?.players?.length === 3);
assert.deepEqual(host.state.players.map((p) => p.nickname).sort(), ['Alice', 'Bob', 'Cara']);
assert.ok(host.state.players.every((p) => p.id === undefined && p.playerId === undefined)); // no secrets leak
assert.equal(host.state.timeLimit, 1); assert.equal(alice.state.timeLimit, 1);
ok('team created by Alice (leader), Bob joined, Cara plays solo; time limit shown in the lobby');

assert.equal((await call(alice, 'host:next', {})).ok, false); ok('players cannot use host controls');

// ---- Question 1: team answers once through its leader, Cara answers solo
assert.equal((await call(host, 'host:next', {})).ok, true);
await until('question 1 live', () => cara.state?.status === 'question' && cara.state.question.index === 0);
assert.equal(cara.state.question.correctIndex, undefined);
assert.equal(cara.state.reveal, undefined); ok('players never receive the answer while the question is open');
await until('host sees answer', () => host.hostInfo?.correctIndex === 1);
r = await call(bob, 'answer:submit', { choice: 1 });
assert.equal(r.ok, false); assert.match(r.error, /team leader/); ok('team member cannot answer, only the leader');
assert.equal((await call(cara, 'answer:submit', { choice: 1 })).ok, true);
assert.equal((await call(cara, 'answer:submit', { choice: 2 })).ok, false); ok('second answer from same player is refused');
assert.equal((await call(alice, 'answer:submit', { choice: 1 })).ok, true);
await until('auto lock when everyone answered', () => host.state?.status === 'locked');
assert.equal((await call(host, 'host:reveal', {})).ok, true);
await until('reveal', () => cara.state?.status === 'reveal');
assert.equal(cara.state.reveal.correctIndex, 1);
assert.deepEqual(cara.state.reveal.tally, [0, 2, 0, 0]);
await until('scores', () => cara.me?.result && bob.me?.result);
assert.equal(cara.me.result.correct, true); assert.equal(bob.me.result.correct, true);
assert.ok(cara.me.score >= 500 && cara.me.score <= 1000); assert.equal(bob.me.score, alice.me.score);
ok('both correct: 500-1000 points, team members share the team score');

// ---- Question 2: nobody answers, timer locks it
await call(host, 'host:next', {});
await until('timeout lock', () => host.state?.status === 'locked', 3000);
r = await call(cara, 'answer:submit', { choice: 0 });
assert.equal(r.ok, false); ok('timer locks the question, late answers refused');
const before = cara.me.score;
await call(host, 'host:reveal', {});
await until('reveal 2', () => cara.state?.status === 'reveal' && cara.state.question.index === 1);
await until('me updated', () => cara.me?.result?.answered === false);
assert.equal(cara.me.score, before); ok('no answer = 0 points');

// ---- Question 3: Alice wrong, Cara right
await call(host, 'host:next', {});
await until('q3', () => cara.state?.status === 'question' && cara.state.question.index === 2);
await call(alice, 'answer:submit', { choice: 0 });
await call(cara, 'answer:submit', { choice: 2 });
await until('q3 locked', () => host.state?.status === 'locked');
await call(host, 'host:reveal', {});
await until('reveal 3', () => cara.state?.status === 'reveal' && cara.state.question.index === 2);
const lb = cara.state.leaderboard;
assert.equal(lb[0].name, 'Cara'); assert.equal(lb[0].rank, 1); assert.equal(lb[1].name, 'Lions');
ok('leaderboard ranks Cara first, team Lions second');
assert.equal((await call(host, 'host:next', {})).ok, false); ok('no question after the last one');

// ---- Reconnect: phone drops and comes back with its playerId
const scoreBefore = cara.me.score;
cara.s.disconnect();
await until('Cara shown disconnected', () => host.state?.connectedCount === 2, 3000);
const cara2 = await client();
assert.equal((await call(cara2, 'player:join', { code: 'ABC234', nickname: 'ignored', playerId: caraId })).ok, true);
await until('Cara restored', () => cara2.me?.score === scoreBefore);
ok('reconnecting phone keeps its identity and score');

// ---- End
assert.equal((await call(host, 'host:end', {})).ok, true);
await until('ended', () => cara2.state?.status === 'ended');
assert.equal(cara2.state.winners.length, 1);
assert.equal(cara2.state.winners[0].name, 'Cara'); assert.equal(cara2.state.winners[0].prize, 'Hamper');
await until('persist', () => persisted);
assert.equal(persisted[0].name, 'Cara');
assert.equal((await call(await client(), 'player:join', { code: 'ABC234', nickname: 'Late' })).ok, false);
ok('winner + prize announced, results handed to persistence, late joiners refused');

// ---- Seed data / picker consistency
console.log('Seed data');
const { bank } = loadSeed();
let checked = 0;
for (const [slug, list] of Object.entries(bank)) {
  for (const [text, correct, wrong, difficulty] of list) {
    const options = shuffle([correct, ...wrong]);
    const stored = { _id: 'x', text, options, correctIndex: options.indexOf(correct), difficulty };
    for (let i = 0; i < 3; i++) {
      const live = toLive(stored, { name: slug, icon: '' });
      assert.equal(live.options[live.correctIndex], correct, `${slug}: ${text}`);
    }
    checked++;
  }
}
ok(`${checked} seed questions keep the right answer through both shuffles`);

console.log(`\nALL ${passed} CHECKS PASSED`);
io.close(); server.close();
process.exit(0);

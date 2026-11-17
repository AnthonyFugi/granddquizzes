import http from 'node:http';
import assert from 'node:assert/strict';
import { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';
import { GameSession } from '../src/services/GameSession.js';
import { allocate, difficultyMatch } from '../src/services/questionPicker.js';
import { cleanMarks } from '../src/services/scoring.js';
import { registerSockets } from '../src/sockets/index.js';
import { SessionStore } from '../src/services/sessionStore.js';
import { UserError } from '../src/services/errors.js';

let n = 0;
const ok = (name) => { n += 1; console.log(`  ✓ ${name}`); };
const mk = (text, round) => ({ id: text, text, options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: '', difficulty: 'hard', category: { name: round?.name || 'X', icon: '' }, ...(round ? { round } : {}) });
const sess = (qs, marks) => { const s = new GameSession({ code: 'ABCDE', eventId: 'e', title: 't', questions: qs, timeLimit: 10, marks }); s.onChange = () => {}; return s; };

console.log('Marks and totals');
{
  const s = sess([mk('1'), mk('2'), mk('3')], 5);
  const a = s.join({ nickname: 'Ann', socketId: 'a' }); const b = s.join({ nickname: 'Bob', socketId: 'b' });
  s.next(); s.submit(a.id, 0); s.submit(b.id, 0); s.reveal();
  assert.equal(a.score, 5); assert.equal(b.score, 5); assert.equal(s.possibleScore(), 5);
  ok('a correct answer earns the same marks however fast it was');
  s.next(); s.submit(a.id, 1); s.reveal();
  assert.equal(a.score, 5); assert.equal(s.possibleScore(), 10); assert.equal(s.publicState().maxPossible, 15);
  ok('wrong or missing answers earn 0 and the possible total grows each question');
  assert.equal(cleanMarks(0), 1); assert.equal(cleanMarks(500), 100); assert.equal(cleanMarks('x'), 10); assert.equal(cleanMarks(7), 7);
  ok('marks per question is kept between 1 and 100, default 10');
}
{
  const s = sess([mk('1'), mk('2')], 10);
  const slow = s.join({ nickname: 'Slow', socketId: 'a' }); const fast = s.join({ nickname: 'Fast', socketId: 'b' });
  s.next();
  s.answers.set(`p:${slow.id}`, { choice: 0, elapsedMs: 9000, by: slow.id });
  s.answers.set(`p:${fast.id}`, { choice: 0, elapsedMs: 2000, by: fast.id });
  s.reveal();
  const st = s.standings();
  assert.equal(st[0].name, 'Fast'); assert.equal(st[0].rank, 1); assert.equal(st[1].rank, 2);
  ok('equal marks: the faster total time ranks higher');
}

console.log('Rounds');
{
  const R = (i, name) => ({ index: i, name, icon: '' });
  const s = sess([mk('b1', R(0, 'Bible')), mk('b2', R(0, 'Bible')), mk('g1', R(1, 'Geography')), mk('g2', R(1, 'Geography')), mk('g3', R(1, 'Geography'))], 10);
  assert.deepEqual(s.roundOf(0), { number: 1, of: 2, name: 'Bible', icon: '', position: 1, size: 2, last: false });
  assert.equal(s.roundOf(1).last, true); assert.equal(s.roundOf(2).number, 2); assert.equal(s.roundOf(4).size, 3);
  assert.deepEqual(s.roundList().map((r) => [r.name, r.size]), [['Bible', 2], ['Geography', 3]]);
  ok('round number, position, size and last-question flag');
  assert.equal(sess([mk('x')]).roundOf(0), null); ok('a quiz without rounds shows no round');
  assert.deepEqual(allocate(10, [20, 20, 20]), [4, 3, 3]);
  assert.deepEqual(allocate(10, [2, 20, 20]), [2, 4, 4]);
  assert.deepEqual(allocate(10, [1, 1, 1]), [1, 1, 1]);
  ok('questions are split evenly; a short category gives its share to the others');
  assert.deepEqual(difficultyMatch('challenging'), { difficulty: { $in: ['medium', 'hard'] } });
  assert.deepEqual(difficultyMatch('mixed'), {}); assert.deepEqual(difficultyMatch('easy'), { difficulty: 'easy' });
  ok('challenging means medium and hard only');
}

console.log('Reset and restart');
const questions = [mk('Q1'), mk('Q2'), mk('Q3')];
let loads = 0; let reopened = 0;
const deps = {
  store: new SessionStore(),
  async authorizeHost(t) { if (t !== 'h') throw new UserError('no'); return { id: 'ev', title: 'T', joinCode: 'ABC234', categories: [], questionCount: 3, timeLimit: 5, marks: 10, prizes: [] }; },
  async loadQuestions() { loads += 1; return [mk('N1'), mk('N2'), mk('N3')]; },
  async markLive() { reopened += 1; },
  async persistEnd() {},
};
const server = http.createServer(); const io = new Server(server, { cors: { origin: true } }); registerSockets(io, deps);
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const client = async () => { const s = ioc(url, { transports: ['websocket'] }); const c = { s, state: null }; s.on('state', (x) => (c.state = x)); await new Promise((r) => s.on('connect', r)); return c; };
const call = (c, ev, d) => new Promise((r) => c.s.emit(ev, d, r));
const until = async (f) => { for (let i = 0; i < 150; i++) { if (f()) return; await sleep(20); } throw new Error('timeout'); };
const host = await client(); const p1 = await client();
await call(host, 'host:open', { token: 'h', eventId: 'ev' });
await call(p1, 'player:join', { code: 'ABC234', nickname: 'Zed' });
await call(host, 'host:next', {});
await until(() => p1.state?.status === 'question');
await call(p1, 'answer:submit', { choice: 0 });
await call(host, 'host:reveal', {});
await until(() => p1.state?.status === 'reveal');
assert.equal(p1.state.leaderboard[0].score, 10);
const r1 = await call(host, 'host:reset', {});
assert.equal(r1.ok, true);
await until(() => p1.state?.status === 'lobby');
assert.equal(p1.state.playerCount, 1); assert.equal(p1.state.possible, 0); assert.equal(loads >= 2, true);
ok('reset: back to the waiting room, players kept, scores and totals cleared, fresh questions loaded');
await call(host, 'host:next', {});
await until(() => p1.state?.status === 'question');
await call(p1, 'answer:submit', { choice: 0 });
await call(host, 'host:reveal', {});
await until(() => p1.state?.status === 'reveal');
const firstText = p1.state.question.text;
const r2 = await call(host, 'host:restart', {});
assert.equal(r2.ok, true);
await until(() => p1.state?.status === 'question' && p1.state.question.index === 0);
assert.equal(p1.state.question.text, 'N1'); assert.equal(p1.state.possible, 0); assert.equal(firstText, 'N1');
ok('restart: question 1 again straight away, same questions, scores cleared');
await call(host, 'host:end', {});
await until(() => p1.state?.status === 'ended');
const before = reopened;
const r3 = await call(host, 'host:restart', {});
assert.equal(r3.ok, true); assert.equal(reopened, before + 1);
await until(() => p1.state?.status === 'question');
ok('a finished quiz can be played again');
console.log(`\n${n} checks passed`);
process.exit(0);

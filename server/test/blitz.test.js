import assert from 'node:assert/strict';
import { GameSession } from '../src/services/GameSession.js';
import { autopilotStep } from '../src/services/autopilot.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const qs = Array.from({ length: 6 }, (_, i) => ({ _id: `q${i}`, text: `Q${i}`, options: ['a', 'b', 'c', 'd'], correctIndex: i % 4 }));
const make = () => {
  const s = new GameSession({ code: 'BLITZ', eventId: 'e', title: 't', questions: qs, mode: 'blitz', blitzSeconds: 60 });
  s.onChange = () => {};
  return s;
};
const answerRight = (s, p) => { const v = s.blitzView(p); const i = qs.findIndex((q) => q.text === v.question.text); return s.blitzAnswer(p.id, qs[i].correctIndex); };
const answerWrong = (s, p) => { const v = s.blitzView(p); const i = qs.findIndex((q) => q.text === v.question.text); return s.blitzAnswer(p.id, (qs[i].correctIndex + 1) % 4); };

console.log('Blitz mode');
ok('blitz cannot be started as a normal quiz, and needs a player', () => {
  const s = make();
  assert.throws(() => s.next(), /blitz/i);
  assert.throws(() => s.begin(), /at least one player/);
});
ok('starting gives every player the same questions in their own order, with no answer in the view', () => {
  const s = make();
  const a = s.join({ nickname: 'Ann', socketId: 'a' });
  const b = s.join({ nickname: 'Ben', socketId: 'b' });
  s.begin();
  assert.equal(s.status, 'blitz');
  for (const p of [a, b]) {
    const v = s.blitzView(p);
    assert.equal(v.total, 6);
    assert.ok(v.question.text);
    assert.equal(v.question.correctIndex, undefined);
    assert.equal(JSON.stringify(v).includes('correctIndex'), false);
    assert.deepEqual([...p.order].sort(), [0, 1, 2, 3, 4, 5]);
  }
});
ok('score is the number of correct answers; wrong and skipped answers add nothing', () => {
  const s = make();
  const a = s.join({ nickname: 'Ann', socketId: 'a' });
  s.begin();
  assert.equal(answerRight(s, a).correct, true);
  assert.equal(answerWrong(s, a).correct, false);
  const r = s.blitzAnswer(a.id, -1);
  assert.equal(r.skipped, true);
  answerRight(s, a);
  const v = s.blitzView(a);
  assert.deepEqual([v.correct, v.wrong, v.skipped, v.pos], [2, 1, 1, 4]);
  assert.equal(s.standings()[0].score, 2);
});
ok('players move on by themselves and run out of questions', () => {
  const s = make();
  const a = s.join({ nickname: 'Ann', socketId: 'a' });
  s.begin();
  for (let i = 0; i < 6; i++) answerRight(s, a);
  const v = s.blitzView(a);
  assert.equal(v.done, true);
  assert.equal(v.question, null);
  assert.throws(() => s.blitzAnswer(a.id, 0), /every question/);
});
ok('ranking: more correct first, then fewer wrong answers', () => {
  const s = make();
  const a = s.join({ nickname: 'Ann', socketId: 'a' });
  const b = s.join({ nickname: 'Ben', socketId: 'b' });
  const c = s.join({ nickname: 'Cy', socketId: 'c' });
  s.begin();
  answerRight(s, a); answerRight(s, a); answerWrong(s, a);
  answerRight(s, b); answerRight(s, b);
  answerRight(s, c);
  const st = s.standings();
  assert.deepEqual(st.map((r) => r.name), ['Ben', 'Ann', 'Cy']);
  assert.deepEqual(st.map((r) => r.rank), [1, 2, 3]);
});
ok('a team scores the total of its members', () => {
  const s = make();
  const a = s.join({ nickname: 'Ann', socketId: 'a' });
  const b = s.join({ nickname: 'Ben', socketId: 'b' });
  const c = s.join({ nickname: 'Cy', socketId: 'c' });
  const t = s.createTeam(a.id, 'Lions');
  s.joinTeam(b.id, t.id);
  s.begin();
  answerRight(s, a); answerRight(s, b); answerRight(s, b);
  answerRight(s, c); answerRight(s, c);
  const st = s.standings();
  assert.equal(st[0].name, 'Lions');
  assert.equal(st[0].score, 3);
});
ok('answers after the clock are refused and the quiz ends with final standings', () => {
  const s = make();
  const a = s.join({ nickname: 'Ann', socketId: 'a' });
  s.begin();
  answerRight(s, a);
  s.endsAt = Date.now() - 1000;
  assert.throws(() => s.blitzAnswer(a.id, 0), /Time is up/);
  s.end();
  assert.equal(s.status, 'ended');
  assert.equal(s.finalStandings[0].score, 1);
  assert.equal(s.publicState().winners.length, 0);
});
ok('a player who joins late still gets questions and the same end time', () => {
  const s = make();
  s.join({ nickname: 'Ann', socketId: 'a' });
  s.begin();
  const late = s.join({ nickname: 'Late', socketId: 'l' });
  const v = s.blitzView(late);
  assert.ok(v.question);
  assert.equal(v.endsAt, s.endsAt);
});
ok('public state carries the blitz clock and a live leaderboard; no possible total', () => {
  const s = make();
  const a = s.join({ nickname: 'Ann', socketId: 'a' });
  s.begin();
  answerRight(s, a);
  const st = s.publicState();
  assert.equal(st.mode, 'blitz');
  assert.equal(st.blitz.seconds, 60);
  assert.equal(st.leaderboard[0].score, 1);
  assert.equal(st.possible, 0);
  assert.equal(st.question, null);
});
ok('autopilot starts a scheduled blitz and ends it when time runs out', () => {
  const s = make();
  s.auto = true; s.startAt = 1_000_000;
  s.join({ nickname: 'Ann', socketId: 'a' });
  assert.equal(autopilotStep(s, 1_001_000), 'changed');
  assert.equal(s.status, 'blitz');
  assert.equal(autopilotStep(s, 1_001_500), null);
  assert.equal(autopilotStep(s, s.endsAt + 10), 'ended');
  assert.equal(s.status, 'ended');
});
ok('reset and restart clear a blitz and play again', () => {
  const s = make();
  const a = s.join({ nickname: 'Ann', socketId: 'a' });
  s.begin(); answerRight(s, a); s.end();
  s.resetTo();
  assert.equal(s.status, 'lobby');
  assert.equal(a.correct, 0);
  s.begin();
  assert.equal(s.blitzView(a).pos, 0);
  assert.equal(s.blitzView(a).correct, 0);
});
console.log(`\n${n} checks passed`);
// the timer test needs real time: run it separately so a failure is visible
const t = new GameSession({ code: 'TIMER', eventId: 'e', title: 't', questions: qs, mode: 'blitz', blitzSeconds: 30 });
t.blitzSeconds = 0.2; t.onChange = () => {}; let fired = false; t.onTimeUp = () => { fired = true; };
t.join({ nickname: 'Zed', socketId: 'z' }); t.begin();
setTimeout(() => { assert.equal(t.status, 'ended'); assert.equal(fired, true); console.log('  ✓ the timer ends the blitz by itself and saves the result'); }, 500);

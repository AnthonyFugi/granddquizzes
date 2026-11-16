import assert from 'node:assert/strict';
import { GameSession } from '../src/services/GameSession.js';
import { autopilotStep, AUTO_REVEAL_MS } from '../src/services/autopilot.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const qs = [0, 1, 2].map((i) => ({ _id: `q${i}`, text: `Q${i}`, options: ['a', 'b', 'c', 'd'], correctIndex: 0 }));
const make = (startAt) => {
  const s = new GameSession({ code: 'ABCDE', eventId: 'e1', title: 't', questions: qs, timeLimit: 10 });
  s.onChange = () => {};
  s.auto = true; s.startAt = startAt;
  return s;
};
console.log('Autopilot');
const T = 1_000_000;

ok('does nothing before the start time', () => {
  const s = make(T); s.join({ nickname: 'Ann', socketId: 'x' });
  assert.equal(autopilotStep(s, T - 1000), null);
  assert.equal(s.status, 'lobby');
});
ok('does not start with nobody in the room', () => {
  const s = make(T);
  assert.equal(autopilotStep(s, T + 5000), null);
  assert.equal(s.status, 'lobby');
});
ok('starts at the scheduled time when players are waiting', () => {
  const s = make(T); s.join({ nickname: 'Ann', socketId: 'x' });
  assert.equal(autopilotStep(s, T + 1000), 'changed');
  assert.equal(s.status, 'question');
});
ok('first player arriving late gets a short wait for friends', () => {
  const s = make(T);
  s.join({ nickname: 'Ann', socketId: 'x' });
  assert.equal(autopilotStep(s, T + 60000), null);
  assert.equal(s.status, 'lobby');
  assert.equal(autopilotStep(s, T + 81000), 'changed');
  assert.equal(s.status, 'question');
});
ok('reveals when everyone answered, then moves on, then ends with the final standings', () => {
  const s = make(T); const p = s.join({ nickname: 'Ann', socketId: 'x' });
  let now = T + 1000;
  autopilotStep(s, now);
  for (let i = 0; i < 3; i++) {
    s.submit(p.id, 0);
    assert.equal(autopilotStep(s, now), 'changed');
    assert.equal(s.status, 'reveal');
    assert.equal(autopilotStep(s, now + 1000), null);
    now += AUTO_REVEAL_MS + 10;
    const r = autopilotStep(s, now);
    if (i < 2) { assert.equal(r, 'changed'); assert.equal(s.status, 'question'); } else { assert.equal(r, 'ended'); }
  }
  assert.equal(s.status, 'ended');
  assert.ok(s.finalStandings[0].score > 0);
});
ok('a locked question (timer ran out) is revealed', () => {
  const s = make(T); s.join({ nickname: 'Ann', socketId: 'x' });
  autopilotStep(s, T + 1000);
  s.status = 'locked';
  assert.equal(autopilotStep(s, T + 20000), 'changed');
  assert.equal(s.status, 'reveal');
});
ok('does nothing once the quiz master has taken over', () => {
  const s = make(T); s.join({ nickname: 'Ann', socketId: 'x' });
  s.auto = false;
  assert.equal(autopilotStep(s, T + 5000), null);
  assert.equal(s.status, 'lobby');
});
console.log(`\n${n} checks passed`);

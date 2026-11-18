import assert from 'node:assert/strict';
import { newResetToken, hashToken, RESET_MINUTES } from '../src/services/passwordReset.js';
let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
console.log('Password reset');
ok('a token is long, random and only its hash is kept', () => {
  const a = newResetToken(); const b = newResetToken();
  assert.equal(a.token.length, 64);
  assert.notEqual(a.token, b.token);
  assert.equal(a.hash, hashToken(a.token));
  assert.notEqual(a.hash, a.token);
});
ok('a wrong or empty token never matches', () => {
  const a = newResetToken();
  assert.notEqual(hashToken('x'), a.hash);
  assert.notEqual(hashToken(''), a.hash);
  assert.notEqual(hashToken(undefined), a.hash);
});
ok('it expires after the set time', () => {
  const t = 1_000_000; const a = newResetToken(t);
  assert.equal(a.expires.getTime(), t + RESET_MINUTES * 60000);
});
console.log(`\n${n} checks passed`);

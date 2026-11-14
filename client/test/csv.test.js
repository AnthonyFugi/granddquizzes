import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, resultsCsv, fileSlug } from '../src/lib/csv.js';

test('quotes cells that contain commas, quotes or line breaks', () => {
  assert.equal(csvCell('Smith, John'), '"Smith, John"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('a\nb'), '"a\nb"');
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell(null), '');
});

test('defuses spreadsheet formulas typed as nicknames', () => {
  for (const evil of ['=1+1', '+cmd', '-2+3', '@SUM(A1)', '=HYPERLINK("http://x","click")']) {
    assert.ok(csvCell(evil).replace(/^"/, '').startsWith("'"), evil);
  }
  assert.equal(csvCell(-5), '-5'); // real numbers are left alone
});

test('builds the results sheet with teams, members and prizes', () => {
  const csv = resultsCsv({
    prizes: [{ place: 1, label: 'Hamper' }, { place: 2, label: 'Voucher' }],
    teams: [{ id: 't1', members: ['Alice', 'Bob'] }],
    leaderboard: [
      { rank: 1, name: 'Lions', kind: 'team', id: 't1', score: 1933 },
      { rank: 2, name: 'Cara', kind: 'solo', id: 'p1', score: 984 },
      { rank: 3, name: 'Dee', kind: 'solo', id: 'p2', score: 0 },
    ],
  });
  assert.ok(csv.startsWith('\uFEFF'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0].replace('\uFEFF', ''), 'Rank,Name,Type,Members,Points,Prize');
  assert.equal(lines[1], '1,Lions,Team,Alice; Bob,1933,Hamper');
  assert.equal(lines[2], '2,Cara,Solo,,984,Voucher');
  assert.equal(lines[3], '3,Dee,Solo,,0,');
});

test('file names are safe', () => {
  assert.equal(fileSlug('Friday Quiz Night!'), 'friday-quiz-night');
  assert.equal(fileSlug('../../etc/passwd'), 'etc-passwd');
  assert.equal(fileSlug(''), 'quiz');
});

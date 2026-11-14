// Checks the seed files without needing a database. Run: npm run validate
import fs from 'node:fs';

const read = (n) => JSON.parse(fs.readFileSync(new URL(`../seed/data/${n}`, import.meta.url), 'utf8'));
const categories = read('categories.json');
const bank = read('questions.json');
const slugs = new Set(categories.map((c) => c.slug));
const DIFF = new Set(['easy', 'medium', 'hard']);
const errors = [];
const seenText = new Map();
const counts = {};

for (const slug of Object.keys(bank)) if (!slugs.has(slug)) errors.push(`Unknown category slug: ${slug}`);

for (const c of categories) {
  const list = bank[c.slug] || [];
  counts[c.slug] = { easy: 0, medium: 0, hard: 0, total: list.length };
  list.forEach((row, i) => {
    const where = `${c.slug}[${i}]`;
    if (!Array.isArray(row) || row.length < 4) return errors.push(`${where}: expected [text, correct, [wrong x3], difficulty]`);
    const [text, correct, wrong, difficulty, explanation = ''] = row;
    if (typeof text !== 'string' || !text.trim() || text.length > 400) errors.push(`${where}: bad question text`);
    if (typeof correct !== 'string' || !Array.isArray(wrong) || wrong.length !== 3) return errors.push(`${where}: need 1 correct + 3 wrong answers`);
    const opts = [correct, ...wrong];
    if (opts.some((o) => typeof o !== 'string' || !o.trim() || o.length > 120)) errors.push(`${where}: option empty or over 120 chars`);
    if (new Set(opts.map((o) => o.trim().toLowerCase())).size !== 4) errors.push(`${where}: duplicate options`);
    if (opts.some((o) => /all of the above|none of the above/i.test(o))) errors.push(`${where}: avoid all/none of the above`);
    if (!DIFF.has(difficulty)) errors.push(`${where}: difficulty must be easy|medium|hard`);
    if (String(explanation).length > 400) errors.push(`${where}: explanation too long`);
    const norm = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seenText.has(norm)) errors.push(`${where}: duplicate question (also ${seenText.get(norm)})`);
    seenText.set(norm, where);
    if (DIFF.has(difficulty)) counts[c.slug][difficulty] += 1;
  });
  if (list.length < 15) errors.push(`${c.slug}: only ${list.length} questions (minimum 15)`);
}

console.table(counts);
const total = Object.values(counts).reduce((n, c) => n + c.total, 0);
console.log(`Categories: ${categories.length}   Questions: ${total}`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n - ${errors.join('\n - ')}`);
  process.exit(1);
}
console.log('Seed data OK');

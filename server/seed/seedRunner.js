import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { Category } from '../src/models/Category.js';
import { Question, makeKey } from '../src/models/Question.js';
import { User } from '../src/models/User.js';
import { Setting } from '../src/models/Setting.js';
import { shuffle } from '../src/services/questionPicker.js';

// Raise this whenever categories or questions are added to the seed files. On the next start the server adds
// whatever is missing (existing questions are never changed), once per version.
export const SEED_VERSION = 5;

const read = (name) => JSON.parse(fs.readFileSync(new URL(`./data/${name}`, import.meta.url), 'utf8'));

export function loadSeed() {
  return { categories: read('categories.json'), bank: read('questions.json') };
}

/**
 * Idempotent: safe to run on every deploy. Existing categories and questions are left untouched
 * (so edits made by the admin survive). With reset=true the seed questions are deleted and
 * re-inserted (options reshuffled); questions the admin added themselves are never touched.
 */
export async function runSeed({ reset = false, log = console.log } = {}) {
  const { categories, bank } = loadSeed();

  const catIds = new Map();
  for (const c of categories) {
    const doc = await Category.findOneAndUpdate(
      { slug: c.slug },
      { $setOnInsert: { name: c.name, description: c.description, icon: c.icon, order: c.order } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    catIds.set(c.slug, doc._id);
  }

  const rows = [];
  for (const [slug, list] of Object.entries(bank)) {
    const categoryId = catIds.get(slug);
    if (!categoryId) throw new Error(`questions.json uses unknown category "${slug}"`);
    for (const [text, correct, wrong, difficulty, explanation = ''] of list) {
      const options = shuffle([correct, ...wrong]);
      rows.push({
        key: makeKey(String(categoryId), text),
        doc: { category: categoryId, text, options, correctIndex: options.indexOf(correct), difficulty, explanation, active: true },
      });
    }
  }

  if (reset) await Question.deleteMany({ key: { $in: rows.map((r) => r.key) } });

  const res = await Question.bulkWrite(
    rows.map((r) => ({
      updateOne: { filter: { key: r.key }, update: { $setOnInsert: r.doc }, upsert: true },
    })),
    { ordered: false }
  );

  const summary = { categories: categories.length, questionsInSeed: rows.length, inserted: res.upsertedCount };
  log(`Seed done: ${summary.categories} categories, ${summary.inserted} new questions (${summary.questionsInSeed} in seed file)`);
  return summary;
}

// Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if that account does not exist yet.
export async function ensureAdmin({ log = console.log } = {}) {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || !password) return null;
  if (password.length < 8) {
    log('ADMIN_PASSWORD must be at least 8 characters - admin not created');
    return null;
  }
  const existing = await User.findOne({ email });
  if (existing) return existing;
  const user = await User.create({
    name: process.env.ADMIN_NAME || 'Quiz Admin',
    email,
    role: 'admin',
    passwordHash: await bcrypt.hash(password, 10),
  });
  log(`Admin account created for ${email}`);
  return user;
}

// Called on server start: fills an empty database so the first deployment works straight away.
export async function bootstrap() {
  try {
    if (process.env.AUTO_SEED !== 'false') {
      const row = await Setting.findOne({ key: 'seedVersion' }).lean();
      const empty = (await Question.estimatedDocumentCount()) === 0;
      if (empty || (row?.value ?? 0) < SEED_VERSION) {
        await runSeed();
        await Setting.updateOne({ key: 'seedVersion' }, { $set: { value: SEED_VERSION } }, { upsert: true });
      }
    }
    await ensureAdmin();
  } catch (e) {
    console.error('Bootstrap (seed/admin) failed:', e.message);
  }
}

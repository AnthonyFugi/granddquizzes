import { Category } from '../models/Category.js';
import { Question } from '../models/Question.js';

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Turn a stored question into the in-memory form used live: shuffle the options, track the new answer position.
export function toLive(q, cat, round) {
  const order = shuffle(q.options.map((_, i) => i));
  return {
    id: String(q._id || q.id || ''),
    text: q.text,
    options: order.map((i) => q.options[i]),
    correctIndex: order.indexOf(q.correctIndex),
    explanation: q.explanation || '',
    difficulty: q.difficulty,
    category: { name: cat?.name || '', icon: cat?.icon || '', slug: cat?.slug || '' },
    ...(round ? { round } : {}),
  };
}

// 'challenging' = medium and hard only
export function difficultyMatch(difficulty) {
  if (difficulty === 'challenging') return { difficulty: { $in: ['medium', 'hard'] } };
  if (difficulty && difficulty !== 'mixed') return { difficulty };
  return {};
}

// Split `count` questions across categories as evenly as possible. A category that has too few questions
// gives its share to the others. `available` is how many questions each category can offer.
export function allocate(count, available) {
  const n = available.length;
  const sizes = new Array(n).fill(0);
  let left = Math.min(count, available.reduce((a, b) => a + b, 0));
  while (left > 0) {
    let gave = 0;
    for (let i = 0; i < n && left > 0; i++) {
      if (sizes[i] < available[i]) { sizes[i] += 1; left -= 1; gave += 1; }
    }
    if (!gave) break;
  }
  return sizes;
}

// Pick `count` questions. With rounds, the quiz plays one category after another, in the order given.
// Without, questions from the chosen categories are mixed together. No repeats either way.
export async function pickQuestions({ categoryIds = [], count = 10, difficulty = 'mixed', rounds = false }) {
  const cats = categoryIds.length
    ? await Category.find({ _id: { $in: categoryIds } })
    : await Category.find();
  if (!cats.length) return [];
  const catMap = new Map(cats.map((c) => [String(c._id), c]));
  const base = { active: true, ...difficultyMatch(difficulty) };

  if (rounds && categoryIds.length > 1) {
    const ordered = categoryIds.map((id) => catMap.get(String(id))).filter(Boolean);
    const counts = await Promise.all(ordered.map((c) => Question.countDocuments({ ...base, category: c._id })));
    const sizes = allocate(count, counts);
    const out = [];
    let roundNo = 0;
    for (let i = 0; i < ordered.length; i++) {
      if (!sizes[i]) continue;
      const cat = ordered[i];
      const docs = await Question.aggregate([{ $match: { ...base, category: cat._id } }, { $sample: { size: sizes[i] } }]);
      const round = { index: roundNo++, name: cat.name, icon: cat.icon || '' };
      out.push(...shuffle(docs).map((d) => toLive(d, cat, round)));
    }
    return out;
  }

  const per = Math.floor(count / cats.length);
  let extra = count % cats.length;
  const picked = [];
  for (const cat of shuffle(cats)) {
    const size = per + (extra-- > 0 ? 1 : 0);
    if (!size) continue;
    const docs = await Question.aggregate([
      { $match: { ...base, category: cat._id } },
      { $sample: { size } },
    ]);
    picked.push(...docs);
  }
  // A category may be short on questions; top up from the others
  if (picked.length < count) {
    const docs = await Question.aggregate([
      { $match: { ...base, category: { $in: cats.map((c) => c._id) }, _id: { $nin: picked.map((d) => d._id) } } },
      { $sample: { size: count - picked.length } },
    ]);
    picked.push(...docs);
  }
  return shuffle(picked).map((d) => toLive(d, catMap.get(String(d.category))));
}

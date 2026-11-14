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
export function toLive(q, cat) {
  const order = shuffle(q.options.map((_, i) => i));
  return {
    id: String(q._id || q.id || ''),
    text: q.text,
    options: order.map((i) => q.options[i]),
    correctIndex: order.indexOf(q.correctIndex),
    explanation: q.explanation || '',
    difficulty: q.difficulty,
    category: { name: cat?.name || '', icon: cat?.icon || '' },
  };
}

// Pick `count` questions spread evenly across the chosen categories, no repeats.
export async function pickQuestions({ categoryIds = [], count = 10, difficulty = 'mixed' }) {
  const cats = categoryIds.length
    ? await Category.find({ _id: { $in: categoryIds } })
    : await Category.find();
  if (!cats.length) return [];
  const catMap = new Map(cats.map((c) => [String(c._id), c]));
  const base = { active: true };
  if (difficulty !== 'mixed') base.difficulty = difficulty;

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

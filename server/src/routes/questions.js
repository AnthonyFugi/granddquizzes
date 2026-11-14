import { Router } from 'express';
import { Category } from '../models/Category.js';
import { Question } from '../models/Question.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { wrap } from '../middleware/errors.js';
import { UserError } from '../services/errors.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

const fields = ({ category, text, options, correctIndex, difficulty, explanation, active }) => ({
  category,
  text,
  options,
  correctIndex,
  difficulty,
  explanation,
  active,
});

router.get(
  '/',
  wrap(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 25);
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty;
    if (req.query.q) filter.text = { $regex: String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const [items, total] = await Promise.all([
      Question.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('category', 'name icon').lean(),
      Question.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  })
);

router.post(
  '/',
  wrap(async (req, res) => {
    const q = await Question.create(fields(req.body));
    res.status(201).json(q);
  })
);

router.put(
  '/:id',
  wrap(async (req, res) => {
    const q = await Question.findById(req.params.id);
    if (!q) throw new UserError('Question not found', 404);
    Object.assign(q, Object.fromEntries(Object.entries(fields(req.body)).filter(([, v]) => v !== undefined)));
    await q.save();
    res.json(q);
  })
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    await Question.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  })
);

// Bulk import: [{ category: "geography", text, options, correctIndex, difficulty, explanation }]
router.post(
  '/import',
  wrap(async (req, res) => {
    const rows = Array.isArray(req.body) ? req.body : req.body.questions;
    if (!Array.isArray(rows) || !rows.length) throw new UserError('Send a JSON array of questions');
    const cats = new Map((await Category.find()).map((c) => [c.slug, c]));
    let added = 0;
    const skipped = [];
    for (const [i, r] of rows.entries()) {
      const cat = cats.get(String(r.category || '').toLowerCase());
      if (!cat) {
        skipped.push({ row: i + 1, reason: `Unknown category "${r.category}"` });
        continue;
      }
      try {
        await Question.create({ ...fields(r), category: cat._id });
        added += 1;
      } catch (e) {
        skipped.push({ row: i + 1, reason: e.code === 11000 ? 'Duplicate question' : e.message });
      }
    }
    res.json({ added, skipped });
  })
);

export default router;

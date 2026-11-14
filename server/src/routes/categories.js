import { Router } from 'express';
import { Category } from '../models/Category.js';
import { Question } from '../models/Question.js';
import { wrap } from '../middleware/errors.js';

const router = Router();

router.get(
  '/',
  wrap(async (req, res) => {
    const [cats, counts] = await Promise.all([
      Category.find().sort({ order: 1, name: 1 }).lean(),
      Question.aggregate([{ $match: { active: true } }, { $group: { _id: '$category', n: { $sum: 1 } } }]),
    ]);
    const map = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json(cats.map((c) => ({ ...c, questionCount: map.get(String(c._id)) || 0 })));
  })
);

export default router;

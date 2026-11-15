import { Router } from 'express';
import { User } from '../models/User.js';
import { Event } from '../models/Event.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { wrap } from '../middleware/errors.js';
import { UserError } from '../services/errors.js';
import { extendSubscription, getPlan } from '../services/plans.js';

// Admin only: see quiz masters, switch accounts off, and give a plan to a pilot venue or a customer who paid
// by bank transfer or mobile money outside the app.
const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get(
  '/',
  wrap(async (req, res) => {
    const hosts = await User.find({ role: { $in: ['host', 'admin'] } }).sort({ createdAt: -1 }).limit(300).lean();
    const counts = await Event.aggregate([{ $group: { _id: '$host', n: { $sum: 1 }, last: { $max: '$createdAt' } } }]);
    const by = new Map(counts.map((c) => [String(c._id), c]));
    const now = Date.now();
    res.json(
      hosts.map((h) => {
        const c = by.get(String(h._id));
        const live = h.subscription?.until && new Date(h.subscription.until).getTime() > now;
        return {
          id: h._id, name: h.name, email: h.email, phone: h.phone, role: h.role, active: h.active !== false, createdAt: h.createdAt,
          subscription: live ? { plan: h.subscription.plan, until: h.subscription.until } : null,
          events: c?.n || 0, lastEventAt: c?.last || null,
        };
      })
    );
  })
);

const target = async (id) => {
  const u = await User.findById(id);
  if (!u || !['host', 'admin'].includes(u.role)) throw new UserError('Quiz master not found', 404);
  return u;
};

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const u = await target(req.params.id);
    if (typeof req.body.active === 'boolean') {
      if (String(u._id) === String(req.user._id) && !req.body.active) throw new UserError('You cannot switch off your own account');
      u.active = req.body.active;
    }
    await u.save();
    res.json({ ok: true, active: u.active });
  })
);

router.post(
  '/:id/grant',
  wrap(async (req, res) => {
    const u = await target(req.params.id);
    const plan = getPlan(String(req.body.planKey || ''));
    if (!plan || plan.kind !== 'subscription') throw new UserError('Choose a venue or pro plan to grant');
    const days = Math.min(400, Math.max(1, Number(req.body.days) || plan.days));
    u.subscription = extendSubscription(u.subscription, { ...plan, days });
    await u.save();
    res.json({ ok: true, subscription: u.subscription });
  })
);

router.post(
  '/:id/revoke',
  wrap(async (req, res) => {
    const u = await target(req.params.id);
    u.subscription = undefined;
    await u.save();
    res.json({ ok: true });
  })
);

export default router;

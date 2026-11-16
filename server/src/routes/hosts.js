import { Router } from 'express';
import { User, accessExpired, extendAccess } from '../models/User.js';
import { Event } from '../models/Event.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { wrap } from '../middleware/errors.js';
import { UserError } from '../services/errors.js';
import { extendSubscription, getPlan } from '../services/plans.js';
import { notify } from '../services/mailer.js';

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
          id: h._id, name: h.name, email: h.email, phone: h.phone, role: h.role, active: h.active !== false, status: h.status || 'approved', accessUntil: h.accessUntil || null, expired: accessExpired(h), createdAt: h.createdAt,
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
    if (['approved', 'rejected'].includes(req.body.status)) {
      if (String(u._id) === String(req.user._id)) throw new UserError('You cannot change your own approval');
      u.status = req.body.status;
      if (req.body.status === 'approved') {
        u.active = true;
        // Approval opens a period of access (default 30 days). Admins have no end date.
        if (u.role === 'host') u.accessUntil = extendAccess(null, Math.min(400, Math.max(1, Number(req.body.days) || 30)));
      }
    }
    if (typeof req.body.active === 'boolean') {
      if (String(u._id) === String(req.user._id) && !req.body.active) throw new UserError('You cannot switch off your own account');
      u.active = req.body.active;
    }
    await u.save();
    if (['approved', 'rejected'].includes(req.body.status) && u.role === 'host') {
      const first = String(u.name).split(' ')[0];
      if (req.body.status === 'approved') {
        const until = u.accessUntil ? new Date(u.accessUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
        notify({ to: u.email, subject: 'Your Granddquiz account is approved', text: `Hello ${first},\n\nYour quiz master account on Granddquiz has been approved. You can sign in now and create your first event:\nhttps://granddquiz.web.app/host\n${until ? `\nYour access runs until ${until}. You can renew with a plan on the Plans page, or contact us.\n` : ''}\nNeed help? Reply to this email or WhatsApp +260 777 210 641.\n\nFugiPay Technology Limited` });
      } else {
        notify({ to: u.email, subject: 'About your Granddquiz account request', text: `Hello ${first},\n\nThank you for your interest in Granddquiz. We are not able to approve your quiz master account at the moment. If you think this is a mistake, or you would like to discuss it, reply to this email or WhatsApp +260 777 210 641.\n\nFugiPay Technology Limited` });
      }
    }
    res.json({ ok: true, active: u.active, status: u.status || 'approved' });
  })
);

// Add days of access (renewal). Counts from the current end date if it has not passed yet.
router.post(
  '/:id/extend',
  wrap(async (req, res) => {
    const u = await target(req.params.id);
    if (u.role !== 'host') throw new UserError('Admins do not expire');
    const days = Math.min(400, Math.max(1, Number(req.body.days) || 30));
    u.accessUntil = extendAccess(u.accessUntil, days);
    await u.save();
    res.json({ ok: true, accessUntil: u.accessUntil });
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
    if (u.role === 'host' && (!u.accessUntil || new Date(u.accessUntil) < u.subscription.until)) u.accessUntil = u.subscription.until;
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

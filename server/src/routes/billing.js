import { Router } from 'express';
import crypto from 'node:crypto';
import { Event } from '../models/Event.js';
import { Payment } from '../models/Payment.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { wrap } from '../middleware/errors.js';
import { UserError } from '../services/errors.js';
import { config } from '../config/env.js';
import { entitlementsFor, getPlan, listPlans } from '../services/plans.js';
import { createPaymentLink, paymentsEnabled, webhookIsGenuine } from '../services/flutterwave.js';
import { settleByReference } from '../services/billing.js';
import { eventEntitlements } from '../services/entitlements.js';

const router = Router();
const clientBase = () => config.clientPublicUrl; // '' = same origin as the API
const apiBase = (req) => config.apiPublicUrl || `${req.protocol}://${req.get('host')}`;

// ----- public -----
router.get('/plans', (req, res) => {
  res.json({ plans: listPlans(), currency: config.currency, paymentsEnabled: paymentsEnabled() });
});

// Flutterwave sends the customer's browser back here after checkout. We never trust the query string:
// the payment is confirmed with Flutterwave before anything is granted.
router.get(
  '/callback',
  wrap(async (req, res) => {
    const txRef = String(req.query.tx_ref || '');
    const back = (status) => res.redirect(`${clientBase()}/host/billing?status=${encodeURIComponent(status)}&ref=${encodeURIComponent(txRef)}`);
    if (!txRef) return back('unknown');
    if (req.query.status === 'cancelled') {
      await Payment.updateOne({ txRef, appliedAt: null }, { status: 'cancelled' });
      return back('cancelled');
    }
    try {
      const r = await settleByReference(txRef, req.query.transaction_id ? String(req.query.transaction_id) : undefined);
      return back(r.status);
    } catch (e) {
      console.error('[billing] callback verify failed', txRef, e.message);
      return back('pending'); // the webhook will finish the job if the check failed just now
    }
  })
);

// Flutterwave calls this when a payment completes, even if the customer closed the tab.
router.post(
  '/webhook',
  wrap(async (req, res) => {
    if (!webhookIsGenuine(req.headers, req.rawBody)) return res.status(401).json({ error: 'Bad signature' });
    const { event, data } = req.body || {};
    if (event === 'charge.completed' && data?.tx_ref) {
      await settleByReference(String(data.tx_ref), data.id ? String(data.id) : undefined);
    }
    res.json({ ok: true });
  })
);

// ----- quiz masters -----
router.use(requireAuth, requireRole('host', 'admin'));

router.get(
  '/me',
  wrap(async (req, res) => {
    const ent = entitlementsFor({ eventTier: 'free', host: req.user });
    const payments = await Payment.find({ host: req.user._id }).sort({ createdAt: -1 }).limit(20).lean();
    res.json({
      entitlements: ent,
      subscription: req.user.toSafe().subscription,
      payments: payments.map((p) => ({ txRef: p.txRef, planKey: p.planKey, amount: p.amount, currency: p.currency, status: p.status, event: p.event, createdAt: p.createdAt, paidAt: p.paidAt })),
    });
  })
);

router.get(
  '/payments/:txRef',
  wrap(async (req, res) => {
    const p = await Payment.findOne({ txRef: req.params.txRef });
    if (!p || (req.user.role !== 'admin' && String(p.host) !== String(req.user._id))) throw new UserError('Payment not found', 404);
    res.json({ txRef: p.txRef, status: p.status, planKey: p.planKey, amount: p.amount, currency: p.currency });
  })
);

router.post(
  '/checkout',
  wrap(async (req, res) => {
    const plan = getPlan(String(req.body.planKey || ''));
    if (!plan) throw new UserError('Choose a plan');
    if (!paymentsEnabled()) throw new UserError('Online payments are not switched on yet. Contact FugiPay to pay by mobile money or bank transfer', 503);

    let event = null;
    if (plan.kind === 'event') {
      event = await Event.findById(req.body.eventId).catch(() => null);
      if (!event || (req.user.role !== 'admin' && String(event.host) !== String(req.user._id))) throw new UserError('Choose which event this pass is for', 404);
      if (event.status === 'ended') throw new UserError('That event has already ended');
      const have = await eventEntitlements(event);
      if (have.maxPlayers >= plan.maxPlayers) throw new UserError(`That event already allows ${have.maxPlayers} players (${have.planName}). Pick a bigger pass`);
    }

    const txRef = `gq_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
    await Payment.create({ txRef, host: req.user._id, event: event?._id, planKey: plan.key, amount: plan.price, currency: config.currency });
    const link = await createPaymentLink({
      txRef,
      amount: plan.price,
      currency: config.currency,
      redirectUrl: `${apiBase(req)}/api/billing/callback`,
      customer: { email: req.user.email, name: req.user.name, phone: req.user.phone },
      meta: { host: String(req.user._id), plan: plan.key, ...(event ? { event: String(event._id) } : {}) },
      title: 'Granddquiz',
      description: event ? `${plan.name} for "${event.title}"` : plan.name,
      logo: clientBase() ? `${clientBase()}/logo-512.png` : undefined,
    });
    res.status(201).json({ link, txRef });
  })
);

export default router;

import { Payment } from '../models/Payment.js';
import { Event } from '../models/Event.js';
import { User } from '../models/User.js';
import { extendSubscription, getPlan } from './plans.js';
import { matchesPayment, verifyTransaction } from './flutterwave.js';

/** Grants what a payment bought. Safe to call twice: only the first call does anything. */
export async function applyPayment(txRef, flwTransactionId) {
  const claimed = await Payment.findOneAndUpdate(
    { txRef, appliedAt: null },
    { $set: { appliedAt: new Date(), paidAt: new Date(), status: 'successful', flwTransactionId: flwTransactionId ? String(flwTransactionId) : undefined } },
    { new: true }
  );
  if (!claimed) return { applied: false, payment: await Payment.findOne({ txRef }) };
  try {
    const plan = getPlan(claimed.planKey);
    if (!plan) throw new Error(`Unknown plan ${claimed.planKey}`);
    if (plan.kind === 'event') {
      await Event.updateOne({ _id: claimed.event }, { tier: plan.key, paidAt: new Date() });
    } else {
      const host = await User.findById(claimed.host);
      const subscription = extendSubscription(host.subscription, plan);
      const set = { subscription };
      // A paid plan also keeps the quiz master's access open for as long as the plan runs
      if (host.role === 'host') set.accessUntil = host.accessUntil && new Date(host.accessUntil) > subscription.until ? host.accessUntil : subscription.until;
      await User.updateOne({ _id: host._id }, set);
    }
  } catch (e) {
    await Payment.updateOne({ _id: claimed._id }, { $unset: { appliedAt: 1 } }); // allow a retry
    throw e;
  }
  return { applied: true, payment: claimed };
}

/**
 * Confirms a payment with Flutterwave and grants the plan if it is genuine.
 * Used by both the browser return and the webhook, so either one is enough.
 */
export async function settleByReference(txRef, transactionId) {
  const payment = await Payment.findOne({ txRef });
  if (!payment) return { status: 'unknown' };
  if (payment.appliedAt) return { status: 'successful', payment };
  const tx = await verifyTransaction({ id: transactionId, txRef });
  if (matchesPayment(tx, payment)) {
    const { payment: p } = await applyPayment(txRef, tx.id);
    return { status: 'successful', payment: p };
  }
  const state = String(tx?.status || '').toLowerCase();
  if (['failed', 'cancelled'].includes(state)) {
    await Payment.updateOne({ txRef, appliedAt: null }, { status: state });
    return { status: state, payment };
  }
  return { status: 'pending', payment };
}

// Thin client for Flutterwave API v3 (hosted "Standard" checkout). Nothing here trusts the browser:
// every payment is confirmed by asking Flutterwave directly before a plan is granted.
import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { UserError } from './errors.js';

export const paymentsEnabled = () => !!config.flutterwave.secretKey;

async function flw(path, { method = 'GET', body } = {}) {
  if (!paymentsEnabled()) throw new UserError('Online payments are not switched on yet. Contact FugiPay to pay by mobile money or bank transfer', 503);
  let res;
  try {
    res = await fetch(`${config.flutterwave.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${config.flutterwave.secretKey}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    console.error('[flutterwave] request failed', path, e.message);
    throw new UserError('Could not reach the payment provider. Try again in a moment', 502);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === 'error') {
    console.error('[flutterwave] error', path, res.status, data.message);
    throw new UserError('The payment provider refused that request. Try again, or contact FugiPay', 502);
  }
  return data;
}

/** Starts a hosted checkout and returns the link to send the customer to. */
export async function createPaymentLink({ txRef, amount, currency, redirectUrl, customer, meta, title, description, logo }) {
  const data = await flw('/v3/payments', {
    method: 'POST',
    body: {
      tx_ref: txRef,
      amount,
      currency,
      redirect_url: redirectUrl,
      customer: { email: customer.email, name: customer.name, ...(customer.phone ? { phonenumber: customer.phone } : {}) },
      meta,
      customizations: { title, description, ...(logo ? { logo } : {}) },
    },
  });
  const link = data?.data?.link;
  if (!link) throw new UserError('The payment provider did not return a checkout link', 502);
  return link;
}

/** Asks Flutterwave what really happened. Returns the transaction record, or null if it does not exist. */
export async function verifyTransaction({ id, txRef }) {
  const path = id ? `/v3/transactions/${encodeURIComponent(id)}/verify` : `/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`;
  const data = await flw(path);
  return data?.data || null;
}

/** True when a verified transaction matches what we asked for. */
export function matchesPayment(tx, payment) {
  return !!tx
    && String(tx.status).toLowerCase() === 'successful'
    && tx.tx_ref === payment.txRef
    && String(tx.currency).toUpperCase() === payment.currency
    && Number(tx.amount) >= payment.amount;
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

/**
 * Checks that a webhook really came from Flutterwave. Accepts either header they use:
 *  - verif-hash: equals the secret hash you set in the dashboard
 *  - flutterwave-signature: base64 HMAC-SHA256 of the raw body with that same secret hash
 */
export function webhookIsGenuine(headers, rawBody) {
  const secret = config.flutterwave.secretHash;
  if (!secret) return false;
  if (safeEqual(headers['verif-hash'], secret)) return true;
  const sig = headers['flutterwave-signature'];
  if (sig && rawBody) {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    return safeEqual(sig, expected);
  }
  return false;
}

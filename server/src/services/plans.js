// What each plan includes and costs. Prices are in the billing currency (ZMW by default).
// They are starting points to test with real customers; change them with the PLAN_PRICES env variable
// (JSON, e.g. {"event_small":120}) without touching code.
import { config } from '../config/env.js';

export const FREE = {
  key: 'free',
  kind: 'free',
  name: 'Free try-out',
  price: 0,
  maxPlayers: 10,
  branding: false,
  sponsors: 0,
  whiteLabel: false,
  blurb: 'Try a full quiz with up to 10 players.',
};

const BASE = [
  { key: 'event_small', kind: 'event', name: 'Event: Small', price: 150, maxPlayers: 30, branding: true, sponsors: 1, whiteLabel: false,
    blurb: 'One event, up to 30 players. Your logo, name and colour.' },
  { key: 'event_medium', kind: 'event', name: 'Event: Medium', price: 400, maxPlayers: 100, branding: true, sponsors: 2, whiteLabel: false,
    blurb: 'One event, up to 100 players. Two sponsor slots.' },
  { key: 'event_large', kind: 'event', name: 'Event: Large', price: 900, maxPlayers: 300, branding: true, sponsors: 3, whiteLabel: false,
    blurb: 'One event, up to 300 players. Three sponsor slots.' },
  { key: 'venue_month', kind: 'subscription', days: 30, name: 'Venue (monthly)', price: 600, maxPlayers: 100, branding: true, sponsors: 3, whiteLabel: false,
    blurb: 'Unlimited events for 30 days, up to 100 players each. For weekly quiz nights.' },
  { key: 'venue_year', kind: 'subscription', days: 365, name: 'Venue (yearly)', price: 6000, maxPlayers: 100, branding: true, sponsors: 3, whiteLabel: false,
    blurb: 'Same as Venue monthly. Two months free.' },
  { key: 'pro_month', kind: 'subscription', days: 30, name: 'Pro (monthly)', price: 1500, maxPlayers: 300, branding: true, sponsors: 3, whiteLabel: true,
    blurb: 'Unlimited events, up to 300 players each, and no Granddquiz badge. For agencies and busy venues.' },
];

function priceOverrides() {
  if (!config.planPrices) return {};
  try {
    const o = JSON.parse(config.planPrices);
    return o && typeof o === 'object' ? o : {};
  } catch {
    console.warn('PLAN_PRICES is not valid JSON, using default prices');
    return {};
  }
}

export function listPlans() {
  const over = priceOverrides();
  return BASE.map((p) => {
    const v = Number(over[p.key]);
    return Number.isFinite(v) && v > 0 ? { ...p, price: v } : { ...p };
  });
}

export const getPlan = (key) => listPlans().find((p) => p.key === key) || null;

const activeSub = (host, now) => {
  const sub = host?.subscription;
  if (!sub?.plan || !sub.until || new Date(sub.until).getTime() <= now) return null;
  return getPlan(sub.plan);
};

/**
 * What an event is allowed to do right now: the better of its own pass (tier) and the host's subscription.
 * Nobody loses a feature they paid for by buying another plan.
 */
export function entitlementsFor({ eventTier, host, now = Date.now() }) {
  const parts = [FREE];
  const pass = eventTier && eventTier !== 'free' ? getPlan(eventTier) : null;
  if (pass) parts.push(pass);
  const sub = activeSub(host, now);
  if (sub) parts.push(sub);
  const best = parts.reduce((a, b) => (b.maxPlayers > a.maxPlayers ? b : a), FREE);
  return {
    plan: best.key,
    planName: best.name,
    maxPlayers: Math.max(...parts.map((p) => p.maxPlayers)),
    branding: parts.some((p) => p.branding),
    sponsors: Math.max(...parts.map((p) => p.sponsors)),
    whiteLabel: parts.some((p) => p.whiteLabel),
    via: sub ? 'subscription' : pass ? 'event' : 'free',
    until: sub ? host.subscription.until : null,
  };
}

/** New subscription end date: extends from the current end if still active, otherwise from now. */
export function extendSubscription(current, plan, now = Date.now()) {
  const base = current?.until && new Date(current.until).getTime() > now ? new Date(current.until).getTime() : now;
  return { plan: plan.key, until: new Date(base + plan.days * 86400000) };
}

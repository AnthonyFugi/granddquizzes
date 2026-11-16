import { User } from '../models/User.js';
import { entitlementsFor } from './plans.js';

/** Entitlements for one event (loads the host's subscription). */
export async function eventEntitlements(event) {
  const host = await User.findById(event.host).select('subscription role').lean();
  return entitlementsFor({ eventTier: event.tier, host });
}

/** Entitlements for many events with a single user lookup. Returns Map(eventId -> entitlements). */
export async function entitlementsMap(events) {
  const ids = [...new Set(events.map((e) => String(e.host)))];
  const hosts = await User.find({ _id: { $in: ids } }).select('subscription role').lean();
  const byId = new Map(hosts.map((h) => [String(h._id), h]));
  return new Map(events.map((e) => [String(e._id), entitlementsFor({ eventTier: e.tier, host: byId.get(String(e.host)) })]));
}

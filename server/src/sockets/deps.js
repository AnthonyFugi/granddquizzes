import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { Event } from '../models/Event.js';
import { User, accessExpired } from '../models/User.js';
import { Registration } from '../models/Registration.js';
import { pickQuestions } from '../services/questionPicker.js';
import { UserError } from '../services/errors.js';
import { store } from '../services/sessionStore.js';
import { entitlementsFor } from '../services/plans.js';
import { publicBranding } from '../services/branding.js';
import { AUTO_OPEN_EARLY_MS } from '../services/autopilot.js';

function summarize(event, host) {
  const ent = entitlementsFor({ eventTier: event.tier, host });
  return {
    maxPlayers: ent.maxPlayers,
    branding: publicBranding(event.branding, ent, event.joinCode),
    id: String(event._id),
    title: event.title,
    joinCode: event.joinCode,
    categories: event.categories,
    questionCount: event.questionCount,
    timeLimit: event.timeLimit,
    difficulty: event.difficulty,
    prizes: event.prizes.map((p) => ({ place: p.place, label: p.label })),
    scheduledFor: event.scheduledFor ? new Date(event.scheduledFor).getTime() : null,
  };
}

export const mongoDeps = {
  store,

  async authorizeHost(token, eventId) {
    let payload;
    try {
      payload = jwt.verify(String(token || ''), config.jwtSecret);
    } catch {
      throw new UserError('Please sign in again');
    }
    const user = await User.findById(payload.sub);
    if (!user || !['host', 'admin'].includes(user.role)) throw new UserError('Only quiz masters can host');
    if (user.active === false) throw new UserError('This account has been switched off. Contact FugiPay');
    if (user.status === 'pending' || user.status === 'rejected') throw new UserError('This account is not approved. Contact FugiPay');
    if (accessExpired(user)) throw new UserError('Your access period has ended. Renew a plan or contact FugiPay to run events');
    const event = await Event.findById(eventId);
    if (!event) throw new UserError('Event not found');
    if (user.role !== 'admin' && String(event.host) !== String(user._id)) {
      throw new UserError('That event belongs to another quiz master');
    }
    if (event.status === 'ended') throw new UserError('This event has already ended');
    const host = String(event.host) === String(user._id) ? user : await User.findById(event.host);
    return summarize(event, host);
  },

  // Scheduled events whose waiting room should be open by now (and not abandoned long ago)
  async dueEvents(now = Date.now()) {
    const events = await Event.find({ status: 'scheduled', scheduledFor: { $lte: new Date(now + AUTO_OPEN_EARLY_MS), $gte: new Date(now - 12 * 3600 * 1000) } });
    const out = [];
    for (const ev of events) {
      const host = await User.findById(ev.host);
      if (!host || host.active === false || host.status === 'pending' || host.status === 'rejected' || accessExpired(host)) continue;
      out.push(summarize(ev, host));
    }
    return out;
  },

  loadQuestions(event) {
    return pickQuestions({
      categoryIds: event.categories,
      count: event.questionCount,
      difficulty: event.difficulty,
    });
  },

  async markLive(event) {
    await Event.updateOne({ _id: event.id }, { status: 'live' });
  },

  // Only names and scores are kept, and MongoDB deletes them automatically after RETENTION_DAYS.
  async persistEnd(session) {
    const purgeAt = new Date(Date.now() + config.retentionDays * 86400000);
    const results = (session.finalStandings || []).slice(0, 10).map((r) => ({
      rank: r.rank,
      kind: r.kind,
      name: r.name,
      score: r.score,
    }));
    await Event.updateOne(
      { _id: session.eventId },
      { status: 'ended', endedAt: new Date(session.endedAt), results, purgeAt }
    );
    await Registration.updateMany({ event: session.eventId }, { purgeAt });
  },
};

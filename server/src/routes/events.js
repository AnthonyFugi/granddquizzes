import { Router } from 'express';
import mongoose from 'mongoose';
import { Event } from '../models/Event.js';
import { Category } from '../models/Category.js';
import { Question } from '../models/Question.js';
import { Registration } from '../models/Registration.js';
import { requireAuth, requireRole, requireCurrentAccess } from '../middleware/auth.js';
import { wrap } from '../middleware/errors.js';
import { UserError } from '../services/errors.js';
import { store } from '../services/sessionStore.js';
import { cleanMarks } from '../services/scoring.js';
import { difficultyMatch } from '../services/questionPicker.js';
import { eventEntitlements, entitlementsMap } from '../services/entitlements.js';
import { decodeLogo, publicBranding, sanitizeBranding } from '../services/branding.js';

// What gets stored for the branding block (hasLogo lets the host list skip the heavy image data)
const brandingForSave = (input, previous) => {
  const b = sanitizeBranding(input);
  if (b.logo === undefined) b.logo = previous?.logo || ''; // not sent = keep the current logo
  b.hasLogo = !!b.logo;
  return b;
};

const router = Router();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion on a big screen
const genCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

// ----- public: used by the join screen and registration -----
router.get(
  '/by-code/:code',
  wrap(async (req, res) => {
    const code = req.params.code.toUpperCase();
    const ev = await Event.findOne({ joinCode: code }).select('title joinCode status scheduledFor prizes tier host branding.orgName branding.tagline branding.accent branding.sponsors branding.hasLogo');
    if (!ev) throw new UserError('No event with that code', 404);
    const ent = await eventEntitlements(ev);
    const b = ev.toObject().branding;
    const branding = publicBranding(b && { ...b, logo: b.hasLogo ? 'yes' : '' }, ent, ev.joinCode);
    res.json({ title: ev.title, code: ev.joinCode, status: ev.status, scheduledFor: ev.scheduledFor, prizes: ev.prizes, live: !!store.getByCode(code), branding });
  })
);

// The event's logo as a normal image, so it is cached by the browser instead of travelling inside every quiz update
router.get(
  '/by-code/:code/logo',
  wrap(async (req, res) => {
    const ev = await Event.findOne({ joinCode: req.params.code.toUpperCase() }).select('host tier branding.logo');
    const ent = ev && (await eventEntitlements(ev));
    const logo = ev && ent.branding ? decodeLogo(ev.branding?.logo) : null;
    if (!logo) return res.status(404).json({ error: 'No logo' });
    res.set({ 'Content-Type': logo.type, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin' });
    res.send(logo.bytes);
  })
);

// A registered player signs up (alone or with a team name) for an upcoming event
router.post(
  '/by-code/:code/register',
  requireAuth,
  wrap(async (req, res) => {
    const ev = await Event.findOne({ joinCode: req.params.code.toUpperCase() });
    if (!ev || ev.status === 'ended') throw new UserError('That event is not open for registration', 404);
    const reg = await Registration.findOneAndUpdate(
      { event: ev._id, user: req.user._id },
      { teamName: String(req.body.teamName || '').slice(0, 24) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ ok: true, registration: { id: reg._id, teamName: reg.teamName } });
  })
);

// ----- quiz master -----
router.use(requireAuth, requireRole('host', 'admin'));
router.use((req, res, next) => (['POST', 'PUT', 'PATCH'].includes(req.method) ? requireCurrentAccess(req, res, next) : next()));

// Validates the quiz settings shared by create and edit. Throws UserError with a plain message.
async function readSettings(b) {
    const title = String(b.title || '').trim();
    if (title.length < 3) throw new UserError('Give the event a title');
    const mode = b.mode === 'blitz' ? 'blitz' : 'classic';
    const blitzSeconds = Math.min(900, Math.max(30, Number(b.blitzSeconds) || 120));
    const questionCount = Math.min(mode === 'blitz' ? 300 : 100, Math.max(3, Number(b.questionCount) || (mode === 'blitz' ? 60 : 10)));
    const timeLimit = Math.min(120, Math.max(5, Number(b.timeLimit) || 20));
    const difficulty = ['challenging', 'mixed', 'easy', 'medium', 'hard'].includes(b.difficulty) ? b.difficulty : 'hard';
    const marks = cleanMarks(b.marks);
    const rounds = b.rounds !== false;

    let categories = Array.isArray(b.categories) ? b.categories : [];
    if (categories.some((c) => !mongoose.isValidObjectId(c))) throw new UserError('Invalid category');
    if (categories.length) {
      const found = await Category.countDocuments({ _id: { $in: categories } });
      if (found !== categories.length) throw new UserError('Invalid category');
    }

    const match = { active: true };
    if (categories.length) match.category = { $in: categories.map((c) => new mongoose.Types.ObjectId(c)) };
    Object.assign(match, difficultyMatch(difficulty));
    const available = await Question.countDocuments(match);
    if (available < questionCount) {
      throw new UserError(`Only ${available} questions match that selection. Lower the question count or add categories`);
    }

    const prizes = (Array.isArray(b.prizes) ? b.prizes : [])
      .slice(0, 5)
      .map((p, i) => ({ place: Number(p.place) || i + 1, label: String(p.label || '').trim().slice(0, 80) }))
      .filter((p) => p.label);
  let scheduledFor;
  if (b.scheduledFor) {
    scheduledFor = new Date(b.scheduledFor);
    if (Number.isNaN(scheduledFor.getTime())) throw new UserError('That date and time is not valid');
    if (scheduledFor.getTime() < Date.now() - 5 * 60000) throw new UserError('The scheduled time has already passed. Pick a time from now onwards, or leave it empty');
  }
  return { title, mode, blitzSeconds, categories, questionCount, timeLimit, difficulty, marks, rounds: mode === 'blitz' ? false : rounds, prizes, scheduledFor };
}

router.post(
  '/',
  wrap(async (req, res) => {
    const b = req.body;
    const { title, mode, blitzSeconds, categories, questionCount, timeLimit, difficulty, marks, rounds, prizes, scheduledFor } = await readSettings(b);

    let event;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        event = await Event.create({
          title,
          joinCode: genCode(),
          host: req.user._id,
          mode,
          blitzSeconds,
          categories,
          questionCount,
          timeLimit,
          difficulty,
          marks,
          rounds,
          prizes,
          branding: brandingForSave(b.branding),
          scheduledFor,
        });
        break;
      } catch (e) {
        if (e.code !== 11000) throw e;
      }
    }
    if (!event) throw new UserError('Could not create a join code. Try again', 500);
    const out = event.toObject();
    delete out.branding.logo;
    res.status(201).json(out);
  })
);

router.get(
  '/mine',
  wrap(async (req, res) => {
    const filter = req.user.role === 'admin' ? {} : { host: req.user._id };
    const events = await Event.find(filter).select('-branding.logo').sort({ createdAt: -1 }).limit(50).populate('categories', 'name icon').lean();
    const ents = await entitlementsMap(events);
    const counts = await Registration.aggregate([
      { $match: { event: { $in: events.map((e) => e._id) } } },
      { $group: { _id: '$event', n: { $sum: 1 } } },
    ]);
    const map = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json(events.map((e) => ({ ...e, registrations: map.get(String(e._id)) || 0, entitlements: ents.get(String(e._id)) })));
  })
);

// Change an event's quiz settings (name, categories, questions, timer, difficulty, prizes, schedule). Only before it starts.
router.put(
  '/:id',
  wrap(async (req, res) => {
    const ev = await Event.findById(req.params.id);
    if (!ev || (req.user.role !== 'admin' && String(ev.host) !== String(req.user._id))) throw new UserError('Event not found', 404);
    if (ev.status === 'ended') throw new UserError('This event has already ended');
    // Opening the console only makes a waiting room. Settings stay editable until the quiz actually starts and nobody is waiting.
    const live = store.getByEvent(ev._id);
    if (live && live.status !== 'lobby') throw new UserError('The quiz has started, so its settings are locked');
    if (live && live.players.size > 0) {
      // People are already waiting: only the start time can move, and the quiz stays open for them
      const when = req.body.scheduledFor ? new Date(req.body.scheduledFor) : null;
      if (when && (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 5 * 60000)) throw new UserError('Pick a start time from now onwards');
      ev.scheduledFor = when || undefined;
      await ev.save();
      live.startAt = when ? when.getTime() : 0;
      live.autoGo = null;
      live.auto = !!when; // with a start time the quiz starts itself then; with none, the quiz master starts it
      live.onChange();
      const out = ev.toObject();
      delete out.branding?.logo;
      return res.json({ ...out, onlyTimeChanged: true });
    }
    if (live) store.remove(live.code);
    if (ev.status === 'live') ev.status = 'scheduled'; // opened but empty, or no game running any more: safe to reopen
    const set = await readSettings(req.body);
    Object.assign(ev, set);
    await ev.save();
    const out = ev.toObject();
    delete out.branding?.logo;
    res.json(out);
  })
);

// Change the look of an event (name, colour, logo, sponsors). Guests see it only if the plan includes branding.
router.put(
  '/:id/branding',
  wrap(async (req, res) => {
    const ev = await Event.findById(req.params.id);
    if (!ev || (req.user.role !== 'admin' && String(ev.host) !== String(req.user._id))) throw new UserError('Event not found', 404);
    if (ev.status === 'ended') throw new UserError('This event has already ended');
    ev.branding = brandingForSave(req.body, ev.branding);
    await ev.save();
    const ent = await eventEntitlements(ev);
    const live = store.getByEvent(ev._id);
    if (live) {
      live.branding = publicBranding(ev.branding, ent, ev.joinCode);
      live.onChange();
    }
    const out = { ...ev.toObject().branding };
    delete out.logo;
    res.json({ branding: out, entitlements: ent });
  })
);

router.get(
  '/:id/registrations',
  wrap(async (req, res) => {
    const ev = await Event.findById(req.params.id);
    if (!ev || (req.user.role !== 'admin' && String(ev.host) !== String(req.user._id))) {
      throw new UserError('Event not found', 404);
    }
    const regs = await Registration.find({ event: ev._id }).populate('user', 'name phone email').lean();
    res.json(regs.map((r) => ({ name: r.user?.name, phone: r.user?.phone, email: r.user?.email, teamName: r.teamName })));
  })
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const ev = await Event.findById(req.params.id);
    if (!ev || (req.user.role !== 'admin' && String(ev.host) !== String(req.user._id))) {
      throw new UserError('Event not found', 404);
    }
    if (store.getByEvent(ev._id)) throw new UserError('End the live quiz before deleting it');
    await Registration.deleteMany({ event: ev._id });
    await ev.deleteOne();
    res.json({ ok: true });
  })
);

export default router;

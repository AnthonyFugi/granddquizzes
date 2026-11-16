import { Router } from 'express';
import { ContactMessage } from '../models/ContactMessage.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { wrap } from '../middleware/errors.js';
import { UserError } from '../services/errors.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { notify, adminAddress } from '../services/mailer.js';

const router = Router();
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const send = rateLimit({ windowMs: 60 * 60 * 1000, max: 6, message: 'Too many messages from this connection. Please try again later or call +260 777 210 641' });

// Anyone can send a message (no account needed)
router.post(
  '/',
  send,
  wrap(async (req, res) => {
    const b = req.body || {};
    // Hidden field that real people never fill in: pretend success so bots learn nothing
    if (b.website) return res.status(201).json({ ok: true });
    const name = String(b.name || '').trim();
    const email = String(b.email || '').trim();
    const phone = String(b.phone || '').trim();
    const message = String(b.message || '').trim();
    if (name.length < 2) throw new UserError('Enter your name');
    if (!email && !phone) throw new UserError('Give an email address or phone number so we can reply');
    if (email && !emailOk(email)) throw new UserError('That email address does not look right');
    if (message.length < 5) throw new UserError('Write your message');
    const topic = ['demo', 'pricing', 'support', 'account', 'other'].includes(b.topic) ? b.topic : 'other';
    await ContactMessage.create({ name, email, phone, topic, message });
    notify({
      to: adminAddress(),
      replyTo: email || undefined,
      subject: `Granddquiz message from ${name} (${topic})`,
      text: `New message on the Granddquiz Contact page\n\nName: ${name}\nEmail: ${email || '-'}\nPhone: ${phone || '-'}\nTopic: ${topic}\n\n${message}\n\nReply from: https://granddquiz.web.app/admin/messages`,
    });
    res.status(201).json({ ok: true });
  })
);

// Admin: read and tidy messages
router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const rows = await ContactMessage.find().sort({ createdAt: -1 }).limit(200).lean();
    res.json(rows.map((m) => ({ id: m._id, name: m.name, email: m.email, phone: m.phone, topic: m.topic, message: m.message, status: m.status, createdAt: m.createdAt })));
  })
);

router.patch(
  '/:id',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const status = req.body?.status;
    if (!['new', 'done'].includes(status)) throw new UserError('Invalid status');
    const m = await ContactMessage.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!m) throw new UserError('Message not found', 404);
    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    await ContactMessage.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  })
);

export default router;

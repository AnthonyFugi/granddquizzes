import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { signToken, requireAuth, requireRole } from '../middleware/auth.js';
import { wrap } from '../middleware/errors.js';
import { UserError } from '../services/errors.js';
import { config } from '../config/env.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { notify, adminAddress } from '../services/mailer.js';

const router = Router();
const limit = rateLimit({ max: 40 });
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function createUser({ name, email, password, phone, role, status = 'approved' }) {
  if (!name || String(name).trim().length < 2) throw new UserError('Enter your name');
  if (!emailOk(String(email || ''))) throw new UserError('Enter a valid email address');
  if (String(password || '').length < 8) throw new UserError('Password must be at least 8 characters');
  const exists = await User.findOne({ email: String(email).toLowerCase() });
  if (exists) throw new UserError('An account with that email already exists', 409);
  return User.create({
    name: String(name).trim(),
    email,
    phone: phone || '',
    role,
    status,
    passwordHash: await bcrypt.hash(String(password), 10),
  });
}

// Players register to keep a profile for later events. Quiz masters can self-register only if enabled.
router.post(
  '/register',
  limit,
  wrap(async (req, res) => {
    const wantsHost = req.body.role === 'host';
    if (wantsHost && !config.allowHostSignup) {
      throw new UserError('Quiz master sign-up is switched off. Contact FugiPay for an account', 403);
    }
    // A new quiz master gets no session until FugiPay approves the account
    if (wantsHost) {
      const created = await createUser({ ...req.body, role: 'host', status: 'pending' });
      notify({
        to: adminAddress(),
        subject: `New quiz master request: ${created.name}`,
        text: `Someone asked for a quiz master account on Granddquiz\n\nName: ${created.name}\nEmail: ${created.email}\nPhone: ${created.phone || '-'}\n\nApprove or decline: https://granddquiz.web.app/admin/hosts`,
      });
      return res.status(201).json({ pending: true, message: 'Thanks. FugiPay will review your account and contact you. You can sign in once it is approved.' });
    }
    const user = await createUser({ ...req.body, role: 'player' });
    res.status(201).json({ token: signToken(user), user: user.toSafe() });
  })
);

router.post(
  '/login',
  limit,
  wrap(async (req, res) => {
    const user = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
    const ok = user && (await bcrypt.compare(String(req.body.password || ''), user.passwordHash));
    if (!ok) throw new UserError('Wrong email or password', 401);
    if (user.status === 'pending') throw new UserError('Your account is waiting for approval from FugiPay. We will contact you once it is approved', 403);
    if (user.status === 'rejected') throw new UserError('This account was not approved. Contact FugiPay', 403);
    if (user.active === false) throw new UserError('This account has been switched off. Contact FugiPay', 403);
    res.json({ token: signToken(user), user: user.toSafe() });
  })
);

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toSafe() }));

// Admin creates quiz master accounts
router.post(
  '/hosts',
  requireAuth,
  requireRole('admin'),
  wrap(async (req, res) => {
    const user = await createUser({ ...req.body, role: 'host' });
    res.status(201).json({ user: user.toSafe() });
  })
);

export default router;

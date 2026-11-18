import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { signToken, requireAuth, requireRole } from '../middleware/auth.js';
import { wrap } from '../middleware/errors.js';
import { UserError } from '../services/errors.js';
import { config } from '../config/env.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { notify, adminAddress, mailEnabled } from '../services/mailer.js';
import { newResetToken, hashToken, RESET_MINUTES } from '../services/passwordReset.js';

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

// Forgot password: always answers the same way, so nobody can use it to find out who has an account
const recoverLimit = rateLimit({ max: 6, message: 'Too many requests. Wait a few minutes and try again' });
router.post(
  '/forgot',
  recoverLimit,
  wrap(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!emailOk(email)) throw new UserError('Enter the email address of your account');
    const user = await User.findOne({ email });
    if (user && user.active !== false) {
      const { token, hash, expires } = newResetToken();
      user.resetHash = hash;
      user.resetExpires = expires;
      await user.save();
      const base = config.clientPublicUrl || 'https://granddquiz.web.app';
      const link = `${base}/reset/${token}`;
      if (!mailEnabled() && !config.isProd) console.log('Password reset link (email is not set up):', link);
      notify({
        to: user.email,
        subject: 'Reset your Granddquiz password',
        text: `Hello ${user.name},\n\nSomeone asked to reset the password for your Granddquiz account. Use this link within ${RESET_MINUTES} minutes:\n\n${link}\n\nIf it was not you, ignore this email. Your password stays the same.\n\nFugiPay Technology Limited\nbusiness@fugipay.com`,
      });
    }
    res.json({ ok: true, message: 'If an account with that email exists, we have sent a link to reset the password. It works for one hour.' });
  })
);

router.post(
  '/reset',
  recoverLimit,
  wrap(async (req, res) => {
    const password = String(req.body.password || '');
    if (password.length < 8) throw new UserError('Password must be at least 8 characters');
    const user = await User.findOne({ resetHash: hashToken(req.body.token), resetExpires: { $gt: new Date() } }).select('+resetHash +resetExpires');
    if (!user) throw new UserError('This reset link has expired or was already used. Ask for a new one', 400);
    user.passwordHash = await bcrypt.hash(password, 10);
    user.resetHash = undefined;
    user.resetExpires = undefined;
    await user.save();
    res.json({ ok: true, message: 'Your password has been changed. You can sign in now.' });
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

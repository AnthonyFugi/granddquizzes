import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { signToken, requireAuth, requireRole } from '../middleware/auth.js';
import { wrap } from '../middleware/errors.js';
import { UserError } from '../services/errors.js';
import { config } from '../config/env.js';

const router = Router();
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function createUser({ name, email, password, phone, role }) {
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
    passwordHash: await bcrypt.hash(String(password), 10),
  });
}

// Players register to keep a profile for later events. Quiz masters can self-register only if enabled.
router.post(
  '/register',
  wrap(async (req, res) => {
    const wantsHost = req.body.role === 'host';
    if (wantsHost && !config.allowHostSignup) {
      throw new UserError('Quiz master accounts are created by an admin', 403);
    }
    const user = await createUser({ ...req.body, role: wantsHost ? 'host' : 'player' });
    res.status(201).json({ token: signToken(user), user: user.toSafe() });
  })
);

router.post(
  '/login',
  wrap(async (req, res) => {
    const user = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
    const ok = user && (await bcrypt.compare(String(req.body.password || ''), user.passwordHash));
    if (!ok) throw new UserError('Wrong email or password', 401);
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

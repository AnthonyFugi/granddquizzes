import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User, accessExpired } from '../models/User.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: '7d' });
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Sign in to continue' });
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Account not found' });
    if (user.active === false) return res.status(403).json({ error: 'This account has been switched off. Contact FugiPay' });
    if (user.status === 'pending' || user.status === 'rejected') return res.status(403).json({ error: 'This account is not approved yet. Contact FugiPay' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Your session expired. Sign in again' });
  }
}

export const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have access to that' });

// Blocks creating or running events once a quiz master's access period has ended. Viewing past results stays open.
export const requireCurrentAccess = (req, res, next) =>
  accessExpired(req.user) ? res.status(403).json({ error: 'Your access period has ended. Buy a plan on the Plans page or contact FugiPay. You can still view past results.' }) : next();

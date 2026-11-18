import { createHash, randomBytes } from 'node:crypto';

export const RESET_MINUTES = 60;

export const hashToken = (token) => createHash('sha256').update(String(token || '')).digest('hex');

/** A fresh single-use token. The plain token goes in the email; only its hash is saved. */
export function newResetToken(now = Date.now()) {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashToken(token), expires: new Date(now + RESET_MINUTES * 60000) };
}

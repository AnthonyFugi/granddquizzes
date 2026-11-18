import { UserError } from './errors.js';

export const AUTO_OPEN_EARLY_MS = 15 * 60 * 1000; // the waiting room opens this long before the scheduled time
export const AUTO_LATE_GRACE_MS = 20 * 1000; // if the first player only arrives after the start time, wait this long for friends
export const AUTO_REVEAL_MS = 8 * 1000; // how long each answer stays on screen before the next question

/**
 * Runs a scheduled quiz by itself when nobody has taken over in the console.
 * Call it every few seconds. Returns 'changed', 'ended' or null (nothing to do).
 */
export function autopilotStep(s, now = Date.now()) {
  if (!s.auto || s.status === 'ended') return null;

  if (s.status === 'lobby') {
    if (s.players.size === 0 || now < s.startAt) { s.autoGo = null; return null; }
    if (s.autoGo == null) s.autoGo = now - s.startAt < 6000 ? now : now + AUTO_LATE_GRACE_MS;
    if (now < s.autoGo) return null;
    try { s.begin(); s.autoGo = null; return 'changed'; } catch (e) { if (e instanceof UserError) return null; throw e; }
  }

  if (s.status === 'blitz') {
    if (now >= s.endsAt) { s.end(); return 'ended'; }
    return null;
  }

  if (s.status === 'question') {
    if (s.allAnswered()) { s.reveal(); s.revealAt = now + AUTO_REVEAL_MS; return 'changed'; }
    return null;
  }

  if (s.status === 'locked') { s.reveal(); s.revealAt = now + AUTO_REVEAL_MS; return 'changed'; }

  if (s.status === 'reveal') {
    if (s.revealAt == null) s.revealAt = now + AUTO_REVEAL_MS;
    if (now < s.revealAt) return null;
    s.revealAt = null;
    if (s.index + 1 >= s.questions.length) { s.end(); return 'ended'; }
    try { s.next(); return 'changed'; } catch (e) { if (e instanceof UserError) { s.revealAt = now + 3000; return null; } throw e; }
  }
  return null;
}

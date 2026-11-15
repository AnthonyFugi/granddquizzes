// Tiny in-memory limiter for sign-in and sign-up, to blunt password guessing. One server process only,
// which is how this app runs. Counts reset on restart, which is fine for this purpose.
export function rateLimit({ windowMs = 10 * 60 * 1000, max = 30, message = 'Too many attempts. Wait a few minutes and try again' } = {}) {
  const hits = new Map();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, v] of hits) if (v.start < cutoff) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const h = hits.get(key);
    if (!h || now - h.start > windowMs) hits.set(key, { start: now, n: 1 });
    else if (++h.n > max) return res.status(429).json({ error: message });
    next();
  };
}

import { UserError } from '../services/errors.js';

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, req, res, _next) {
  if (err instanceof UserError) return res.status(err.status).json({ error: err.message });
  if (err?.name === 'ValidationError') return res.status(400).json({ error: err.message });
  if (err?.name === 'CastError') return res.status(400).json({ error: 'Invalid id' });
  if (err?.code === 11000) return res.status(409).json({ error: 'That already exists' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}

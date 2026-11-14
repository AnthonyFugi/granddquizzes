// Usage: npm run seed            (add missing categories/questions, create admin if configured)
//        npm run seed:reset      (re-insert the seed questions with fresh option order)
import mongoose from 'mongoose';
import '../src/config/env.js'; // loads .env
import { connectDb } from '../src/config/db.js';
import { runSeed, ensureAdmin } from './seedRunner.js';

try {
  await connectDb();
  await runSeed({ reset: process.argv.includes('--reset') });
  await ensureAdmin();
} catch (e) {
  console.error('Seed failed:', e);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}

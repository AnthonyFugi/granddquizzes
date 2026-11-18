// Set a new password for any account, straight in the database. For the super admin who is locked out.
// Usage (from the server folder, with your .env present):  npm run reset-password -- you@example.com "NewPassword123"
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import '../src/config/env.js';
import { connectDb } from '../src/config/db.js';
import { User } from '../src/models/User.js';

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('Usage: npm run reset-password -- <email> "<new password, at least 8 characters>"');
  process.exit(1);
}
try {
  await connectDb();
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user) { console.error('No account with that email.'); process.exitCode = 1; }
  else {
    user.passwordHash = await bcrypt.hash(password, 10);
    user.resetHash = undefined; user.resetExpires = undefined;
    if (user.active === false) user.active = true;
    await user.save();
    console.log(`Password changed for ${user.email} (${user.role}). You can sign in now.`);
  }
} catch (e) {
  console.error('Failed:', e.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}

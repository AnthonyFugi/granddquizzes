import mongoose from 'mongoose';

// Only people who choose to register are stored. Guests in a live quiz never touch this collection.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    passwordHash: { type: String, required: true },
    // Password recovery: only a hash of the emailed token is stored, and it expires after an hour
    resetHash: { type: String, select: false },
    resetExpires: { type: Date, select: false },
    role: { type: String, enum: ['admin', 'host', 'player'], default: 'player' },
    active: { type: Boolean, default: true }, // an admin can switch an account off
    // Quiz masters who sign themselves up wait here until an admin approves them. Existing and admin-made accounts are approved.
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
    // Quiz masters get access for a period. After it ends they can still sign in and see past results, but cannot create or run events.
    // Not set = no end date (admins, and accounts made before this rule). A paid plan extends it automatically.
    accessUntil: { type: Date },
    // Quiz master plan: set when a subscription payment succeeds (or an admin grants one).
    subscription: { plan: String, until: Date, _id: false },
  },
  { timestamps: true }
);

// Admins never expire. A quiz master expires once accessUntil has passed.
export const accessExpired = (u, now = Date.now()) => u.role === 'host' && !!u.accessUntil && new Date(u.accessUntil).getTime() < now;
// New end date when a period is added: from the current end if still running, otherwise from now.
export const extendAccess = (current, days, now = Date.now()) => {
  const base = current && new Date(current).getTime() > now ? new Date(current).getTime() : now;
  return new Date(base + days * 86400000);
};

userSchema.methods.toSafe = function () {
  const sub = this.subscription?.plan && this.subscription.until && new Date(this.subscription.until) > new Date() ? this.subscription : null;
  return { id: this._id, name: this.name, email: this.email, role: this.role, status: this.status || 'approved', accessUntil: this.accessUntil || null, expired: accessExpired(this), subscription: sub ? { plan: sub.plan, until: sub.until } : null };
};

export const User = mongoose.model('User', userSchema);

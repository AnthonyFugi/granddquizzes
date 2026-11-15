import mongoose from 'mongoose';

// Only people who choose to register are stored. Guests in a live quiz never touch this collection.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'host', 'player'], default: 'player' },
    active: { type: Boolean, default: true }, // an admin can switch an account off
    // Quiz master plan: set when a subscription payment succeeds (or an admin grants one).
    subscription: { plan: String, until: Date, _id: false },
  },
  { timestamps: true }
);

userSchema.methods.toSafe = function () {
  const sub = this.subscription?.plan && this.subscription.until && new Date(this.subscription.until) > new Date() ? this.subscription : null;
  return { id: this._id, name: this.name, email: this.email, role: this.role, subscription: sub ? { plan: sub.plan, until: sub.until } : null };
};

export const User = mongoose.model('User', userSchema);

import mongoose from 'mongoose';

// Only people who choose to register are stored. Guests in a live quiz never touch this collection.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'host', 'player'], default: 'player' },
  },
  { timestamps: true }
);

userSchema.methods.toSafe = function () {
  return { id: this._id, name: this.name, email: this.email, role: this.role };
};

export const User = mongoose.model('User', userSchema);

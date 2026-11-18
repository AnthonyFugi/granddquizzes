import mongoose from 'mongoose';

// A message sent from the Contact page. Kept for 180 days, then MongoDB deletes it.
const schema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 80, required: true },
    email: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    topic: { type: String, enum: ['demo', 'pricing', 'support', 'account', 'other'], default: 'other' },
    message: { type: String, trim: true, maxlength: 2000, required: true },
    status: { type: String, enum: ['new', 'done'], default: 'new', index: true },
    purgeAt: { type: Date, default: () => new Date(Date.now() + 180 * 86400000), index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true }
);

export const ContactMessage = mongoose.model('ContactMessage', schema);

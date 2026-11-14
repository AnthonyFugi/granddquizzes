import mongoose from 'mongoose';
import crypto from 'node:crypto';

export function makeKey(categoryId, text) {
  const norm = String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return crypto.createHash('sha1').update(`${categoryId}|${norm}`).digest('hex');
}

const questionSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true }, // hash of category + text, prevents duplicates
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    text: { type: String, required: true, trim: true, maxlength: 400 },
    options: {
      type: [{ type: String, trim: true, maxlength: 120 }],
      validate: [(v) => v.length >= 2 && v.length <= 4, 'A question needs 2 to 4 options'],
    },
    correctIndex: { type: Number, required: true, min: 0 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium', index: true },
    explanation: { type: String, default: '', maxlength: 400 },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

questionSchema.pre('validate', function (next) {
  if (this.correctIndex >= this.options.length) {
    return next(new Error('correctIndex must point to one of the options'));
  }
  this.key = makeKey(String(this.category), this.text);
  next();
});

export const Question = mongoose.model('Question', questionSchema);

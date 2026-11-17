import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    joinCode: { type: String, required: true, unique: true, uppercase: true },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    questionCount: { type: Number, default: 10, min: 3, max: 100 },
    timeLimit: { type: Number, default: 20, min: 5, max: 120 },
    difficulty: { type: String, enum: ['mixed', 'challenging', 'easy', 'medium', 'hard'], default: 'challenging' },
    marks: { type: Number, default: 10, min: 1, max: 100 }, // marks for every correct answer
    rounds: { type: Boolean, default: true }, // with several categories: play one category at a time
    possible: Number, // total marks that were available when the quiz ended
    prizes: [{ place: Number, label: { type: String, maxlength: 80 }, _id: false }],
    scheduledFor: { type: Date },
    // Pass bought for this one event (see services/plans.js). 'free' until paid.
    tier: { type: String, default: 'free' },
    paidAt: Date,
    // Look and feel for guests. Only shown if the plan allows it (services/branding.js).
    branding: {
      orgName: { type: String, default: '' },
      tagline: { type: String, default: '' },
      accent: { type: String, default: '' },
      sponsors: [{ type: String }],
      hasLogo: { type: Boolean, default: false },
      logo: { type: String, default: '' }, // small image as a data URL, served from /api/events/by-code/:code/logo
      _id: false,
    },
    status: { type: String, enum: ['scheduled', 'live', 'ended'], default: 'scheduled' },
    // Saved when the quiz ends: names and scores only. No player identities.
    results: [{ rank: Number, kind: String, name: String, score: Number, _id: false }],
    endedAt: Date,
    // MongoDB deletes the document automatically once this date passes (set when the event ends).
    purgeAt: { type: Date, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true }
);

export const Event = mongoose.model('Event', eventSchema);

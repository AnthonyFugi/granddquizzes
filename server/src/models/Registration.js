import mongoose from 'mongoose';

// A registered user signing up (alone or with a team name) for an upcoming event.
const registrationSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    teamName: { type: String, trim: true, maxlength: 24, default: '' },
    purgeAt: { type: Date, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true }
);

registrationSchema.index({ event: 1, user: 1 }, { unique: true });

export const Registration = mongoose.model('Registration', registrationSchema);

import mongoose from 'mongoose';

// One row per checkout attempt by a quiz master. No card or phone-wallet details are ever stored here:
// Flutterwave handles those. We keep only what is needed to match a payment to the plan it bought.
const paymentSchema = new mongoose.Schema(
  {
    txRef: { type: String, required: true, unique: true },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    planKey: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    status: { type: String, enum: ['pending', 'successful', 'failed', 'cancelled'], default: 'pending' },
    flwTransactionId: String,
    appliedAt: Date, // set once the plan has been granted, so a payment can never be applied twice
    paidAt: Date,
  },
  { timestamps: true }
);

export const Payment = mongoose.model('Payment', paymentSchema);

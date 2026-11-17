import mongoose from 'mongoose';

// Small key/value store for the app's own bookkeeping (for example, which seed version the database has).
const schema = new mongoose.Schema({ key: { type: String, unique: true, required: true }, value: mongoose.Schema.Types.Mixed }, { timestamps: true });
export const Setting = mongoose.model('Setting', schema);

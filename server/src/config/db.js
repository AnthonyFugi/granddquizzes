import mongoose from 'mongoose';
import { config } from './env.js';

const hostOf = (uri) => {
  try {
    return new URL(uri).host;
  } catch {
    return 'the configured host';
  }
};
const scrub = (text) => String(text).replace(/mongodb(\+srv)?:\/\/[^@\s]+@/gi, 'mongodb://***@');

function explain(err) {
  const host = hostOf(config.mongoUri);
  const msg = scrub(err.message).split('\n')[0];
  const lines = [`Could not connect to MongoDB at ${host}.`];
  if (/127\.0\.0\.1|localhost/.test(host)) {
    lines.push(
      'Nothing is running on this computer. Either start MongoDB locally, or set your Atlas connection string',
      'in server/.env as MONGODB_URI=... (the name MONGO_URI also works).'
    );
  } else if (/auth/i.test(msg)) {
    lines.push('MongoDB rejected the username or password. Check them in MONGODB_URI; special characters in the password must be URL-encoded.');
  } else if (/querySrv|ENOTFOUND|EAI_AGAIN/i.test(msg)) {
    lines.push(
      'The cluster address could not be looked up (DNS). Check your internet connection. If other sites work, your network may block',
      'SRV lookups: try another network, switch DNS to 8.8.8.8, or use the non-SRV "standard connection string" from Atlas.'
    );
  } else {
    lines.push('Check that the connection string is right, and that Atlas > Network Access allows your current IP address (it changes with some ISPs).');
  }
  lines.push(`Details: ${msg}`);
  return lines.join('\n');
}

export async function connectDb() {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
  } catch (err) {
    throw new Error(explain(err));
  }
  console.log(`MongoDB connected (${hostOf(config.mongoUri)})`);
}

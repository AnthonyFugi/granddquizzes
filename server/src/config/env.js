import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

function need(key, devFallback) {
  const v = process.env[key];
  if (v) return v;
  if (isProd) throw new Error(`Missing required environment variable ${key}`);
  return devFallback;
}

// MONGO_URI is accepted as an alias because many projects (and Atlas snippets) use that name
const mongoFromEnv = process.env.MONGODB_URI || process.env.MONGO_URI;

export const config = {
  isProd,
  port: Number(process.env.PORT) || 5001, // not 5000: macOS AirPlay Receiver uses it
  mongoUri: mongoFromEnv || need('MONGODB_URI', 'mongodb://127.0.0.1:27017/granddquiz'),
  jwtSecret: need('JWT_SECRET', 'dev-secret-change-me'),
  clientOrigins: (process.env.CLIENT_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  // Quiz masters can sign themselves up unless ALLOW_HOST_SIGNUP=false. Free accounts are capped (see plans.js).
  allowHostSignup: process.env.ALLOW_HOST_SIGNUP !== 'false',
  retentionDays: Number(process.env.RETENTION_DAYS) || 30,
  maxTeamSize: Number(process.env.MAX_TEAM_SIZE) || 10,

  // ---- payments (Flutterwave, API v3 hosted checkout). Leave FLW_SECRET_KEY empty to switch payments off.
  flutterwave: {
    secretKey: process.env.FLW_SECRET_KEY || '',
    secretHash: process.env.FLW_SECRET_HASH || '', // the "secret hash" you set for webhooks in the Flutterwave dashboard
    baseUrl: (process.env.FLW_BASE_URL || 'https://api.flutterwave.com').replace(/\/+$/, ''),
  },
  currency: (process.env.BILLING_CURRENCY || 'ZMW').toUpperCase(),
  // Public address of this API (used to build the payment return link). Falls back to the incoming request host.
  apiPublicUrl: (process.env.API_PUBLIC_URL || '').replace(/\/+$/, ''),
  // Where to send people after paying: your Firebase site. Falls back to the first CLIENT_ORIGIN.
  clientPublicUrl: (process.env.CLIENT_PUBLIC_URL || (process.env.CLIENT_ORIGIN || '').split(',')[0] || '').trim().replace(/\/+$/, ''),
  // Optional JSON to change plan prices without code, e.g. {"event_small":120,"venue_month":500}
  planPrices: process.env.PLAN_PRICES || '',
};

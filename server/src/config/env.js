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
  allowHostSignup: process.env.ALLOW_HOST_SIGNUP === 'true',
  retentionDays: Number(process.env.RETENTION_DAYS) || 30,
  maxTeamSize: Number(process.env.MAX_TEAM_SIZE) || 10,
};

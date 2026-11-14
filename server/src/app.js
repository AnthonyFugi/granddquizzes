import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config/env.js';
import authRoutes from './routes/auth.js';
import categoryRoutes from './routes/categories.js';
import questionRoutes from './routes/questions.js';
import eventRoutes from './routes/events.js';
import { errorHandler } from './middleware/errors.js';
import { store } from './services/sessionStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  if (config.isProd) app.set('trust proxy', 1);

  app.use(cors({ origin: config.clientOrigins.length ? config.clientOrigins : true }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true, liveQuizzes: store.size }));
  app.use('/api/auth', authRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/questions', questionRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // In production one server serves the built React app too
  const dist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api|socket\.io).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.get('/', (req, res) =>
      res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Granddquiz server</title>
<body style="font:17px/1.5 system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:0 20px;color:#10231d">
<h1 style="font-size:1.6rem">The Granddquiz server is running</h1>
<p>The web app has not been built yet, so there is nothing to show on this address.</p>
<p><strong>While developing:</strong> in a second terminal run <code>npm run dev</code> inside the <code>client</code> folder, then open
<a href="http://localhost:5173">http://localhost:5173</a>.</p>
<p><strong>To serve it from here:</strong> run <code>npm run build</code> in the project folder, then refresh this page.</p>
<p>API check: <a href="/api/health">/api/health</a></p></body>`)
    );
  }

  app.use(errorHandler);
  return app;
}

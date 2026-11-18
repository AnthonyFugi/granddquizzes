// Try the whole UI without MongoDB:   (cd ../client && npm run build) && npm run demo
// Real game engine + real sockets, with a fake login and a fake event list. Nothing is saved.
// Open http://localhost:5055/host (any email/password), open the console, then join from phones/tabs.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { registerSockets } from '../src/sockets/index.js';
import { SessionStore } from '../src/services/sessionStore.js';
import { UserError } from '../src/services/errors.js';
import { shuffle, toLive } from '../src/services/questionPicker.js';
import { loadSeed } from '../seed/seedRunner.js';

const PORT = Number(process.env.PORT) || 5055;
const COUNT = Number(process.env.DEMO_QUESTIONS) || 10;
const TIME = Number(process.env.DEMO_SECONDS) || 20;
const CODE = 'KQ7MX';
const TOKEN = 'demo-host-token';
const user = { id: 'u1', name: 'Demo Host', email: 'host@demo.test', role: 'host' };

const { categories, bank } = loadSeed();
const catBySlug = new Map(categories.map((c) => [c.slug, c]));
const prizes = [{ place: 1, label: 'Hamper' }, { place: 2, label: 'Voucher' }, { place: 3, label: 'T-shirt' }];
const event = { _id: 'ev1', title: 'Friday quiz night', joinCode: CODE, status: 'scheduled', questionCount: COUNT, timeLimit: TIME, categories: [], registrations: 0, prizes };

function demoQuestions() {
  const all = Object.entries(bank).flatMap(([slug, list]) =>
    list.map(([text, correct, wrong, difficulty]) => {
      const options = shuffle([correct, ...wrong]);
      return toLive({ _id: text, text, options, correctIndex: options.indexOf(correct), difficulty }, catBySlug.get(slug));
    })
  );
  if (process.env.DEMO_ROUNDS) {
    const slugs = ['bible', 'geography', 'history'];
    return slugs.flatMap((slug, ri) => {
      const cat = catBySlug.get(slug);
      return shuffle(bank[slug]).slice(0, Math.ceil(COUNT / slugs.length)).map(([text, correct, wrong, difficulty]) => {
        const options = shuffle([correct, ...wrong]);
        return toLive({ _id: text, text, options, correctIndex: options.indexOf(correct), difficulty }, cat, { index: ri, name: cat.name, icon: cat.icon });
      });
    });
  }
  return shuffle(all).slice(0, COUNT);
}

const store = new SessionStore();
const deps = {
  store,
  async authorizeHost(token) {
    if (token !== TOKEN) throw new UserError('Please sign in again');
    return { id: event._id, title: event.title, joinCode: CODE, categories: [], questionCount: COUNT, timeLimit: TIME, difficulty: 'mixed', prizes, ...(process.env.DEMO_BLITZ ? { mode: 'blitz', blitzSeconds: Number(process.env.DEMO_BLITZ) } : {}) };
  },
  async loadQuestions() { return demoQuestions(); },
  async markLive() { event.status = 'live'; },
  async persistEnd(s) {
    event.status = 'ended';
    event.results = s.finalStandings.slice(0, 10).map((r) => ({ rank: r.rank, kind: r.kind, name: r.name, score: r.score }));
  },
};

const app = express();
app.use(express.json());
app.post('/api/auth/login', (req, res) => res.json({ token: TOKEN, user }));
app.get('/api/auth/me', (req, res) => res.json({ user }));
app.get('/api/categories', (req, res) =>
  res.json(categories.map((c) => ({ ...c, _id: c.slug, questionCount: bank[c.slug].length })))
);
app.get('/api/events/mine', (req, res) => res.json([event]));
app.get('/api/events/:id/registrations', (req, res) => res.json([]));
app.get('/api/events/by-code/:code', (req, res) =>
  req.params.code.toUpperCase() === CODE ? res.json({ title: event.title, code: CODE, status: event.status, prizes, live: !!store.getByCode(CODE) }) : res.status(404).json({ error: 'No event with that code' })
);
app.get('/api/health', (req, res) => res.json({ ok: true, demo: true }));

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (!fs.existsSync(dist)) console.warn('client/dist not found. Run: cd ../client && npm run build');
app.use(express.static(dist));
app.get(/^\/(?!api|socket\.io).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));

const server = http.createServer(app);
registerSockets(new Server(server, { cors: { origin: true } }), deps);
server.listen(PORT, () => console.log(`Demo on http://localhost:${PORT}  (host: /host, join code ${CODE})`));

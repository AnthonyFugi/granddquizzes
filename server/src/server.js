import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { config } from './config/env.js';
import { connectDb } from './config/db.js';
import { createApp } from './app.js';
import { registerSockets } from './sockets/index.js';
import { mongoDeps } from './sockets/deps.js';
import { store } from './services/sessionStore.js';
import { bootstrap } from '../seed/seedRunner.js';

try {
  await connectDb();
} catch (e) {
  console.error(`\n${e.message}\n`);
  process.exit(1);
}
await bootstrap(); // fills an empty database with the seed questions + creates the first admin

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.clientOrigins.length ? config.clientOrigins : true },
  pingInterval: 10000,
  pingTimeout: 15000,
});
registerSockets(io, mongoDeps);

// Remove live sessions nobody has touched for 6 hours
setInterval(() => {
  const gone = store.sweep(6 * 60 * 60 * 1000);
  if (gone.length) console.log('Swept idle quizzes:', gone.join(', '));
}, 10 * 60 * 1000).unref();

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\nPort ${config.port} is already in use. Stop the other program, or set a different PORT in server/.env.`);
    console.error('(On a Mac, port 5000 is taken by AirPlay Receiver, which is why this server uses 5001.)\n');
  } else {
    console.error(e);
  }
  process.exit(1);
});

const hasClient = fs.existsSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist'));
server.listen(config.port, () => {
  console.log(`\nGranddquiz server ready: http://localhost:${config.port}/api/health`);
  console.log(
    hasClient
      ? `Open the app:          http://localhost:${config.port}`
      : 'Web app not built yet. For development run "npm run dev" in the client folder and open http://localhost:5173\n(or run "npm run build" in the project folder and refresh this port).'
  );
});

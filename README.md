# Granddquiz

Live event quizzes for individuals and teams. The quiz master runs the show from one screen, players join from their phones with a short code (no sign-up), and everything about a live game exists **only in server memory**. Only people who choose to register for a future event are ever stored.

**Status:** server (API, realtime engine, seed) and React client (join, phone play, big screen, quiz master console, registration, admin question bank) are built and tested. The full flow has been played end to end in real browsers.

## Try the whole thing without MongoDB

```bash
cd client && npm install && npm run build
cd ../server && npm install && npm run demo
```

Open http://localhost:5055/host (any email and password), open the console for the sample event, put `/screen/KQ7MX` on another tab or screen, and join from phones or tabs with code **KQ7MX**. The demo uses the real game engine and the real question bank, with a fake login and nothing saved.

## Run locally

```bash
cd server
cp .env.example .env        # set MONGODB_URI, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npm run validate            # checks the seed files (no database needed)
npm test                    # plays a full quiz over real sockets (no database needed)
npm run dev                 # on first start the DB is filled with 11 categories / 481 questions
                            # and the admin account is created from ADMIN_EMAIL / ADMIN_PASSWORD

cd ../client && npm install && npm run dev    # http://localhost:5173, proxies /api and sockets to the server on :5001
```

Pages: `/` join, `/play/:code` phone, `/screen/:code` big screen, `/host` events, `/host/:id` live console, `/register` optional sign-up for a coming event, `/admin` question bank.

Seed commands (also run automatically on boot while the question bank is empty; set `AUTO_SEED=false` to disable):

```bash
npm run seed          # add anything missing; never overwrites edits or your own questions
npm run seed:reset    # re-insert the seed questions with fresh answer order (your own questions untouched)
```

## Seed content (481 questions)

| Category | Qs | Category | Qs |
|---|---|---|---|
| General Knowledge | 21 | Sports | 22 |
| Current Affairs & World | 21 | Music & Entertainment | 21 |
| Geography | 21 | Zambian Culture & Trivia | 24 |
| History | 21 | Riddles & Logic | 22 |
| Science & Nature | 22 | Common Sense & Everyday Life | 22 |

Each question has 4 options and an easy/medium/hard rating. **"Mixed bag"** = create an event with no categories selected; questions are then spread evenly across all of them. Options are shuffled again for every event. Seed data lives in `server/seed/data/*.json` as `[question, correct, [3 wrong], difficulty]`; `npm run validate` rejects duplicates, bad lengths and malformed rows.

Current-affairs questions are limited to facts that do not go stale quickly. Review that category now and then.

## Deploy (first release)

1. **MongoDB Atlas**: create a free cluster, a database user, allow Render's IPs (or 0.0.0.0/0), copy the connection string.
2. **Render** (Web Service, supports websockets): repo root, Build `npm run render-build`, Start `npm start`. One service then serves the API, the sockets and the built client. Environment: `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET` (long random), `CLIENT_ORIGIN` (your client URL, comma separated if several), `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
3. Open `https://<your-service>/api/health`. The first boot seeds the database and creates the admin.
4. Log in via `POST /api/auth/login`, create quiz masters with `POST /api/auth/hosts`, create an event with `POST /api/events`.

Note: Render's free tier sleeps when idle and **drops live sessions on every restart or redeploy**. Use a paid instance for real events, and do not deploy mid-event. To host the client separately (e.g. Firebase), build it with `VITE_API_URL=https://<your-service>` and put the client's URL in `CLIENT_ORIGIN`.

## Privacy

- Guests exist only as a nickname plus socket id inside the in-memory session. While they play, nothing is written to the database for them. The one exception is the next line.
- When an event ends, the top-10 nicknames and scores are saved on the Event (this is the only guest data kept), and MongoDB deletes them automatically after `RETENTION_DAYS` (default 30), together with that event's registrations.
- `User` records are created only when someone registers.

## Deploy the client on Firebase Hosting (API stays on Render)

Use this when you want the app on a `*.web.app` address (or your own domain) with the server on Render.

1. **Firebase project.** At https://console.firebase.google.com create a project (or reuse one). Hosting is on the free Spark plan.
   If you reuse a project that already hosts another site, create a second site for this app (Hosting > Add another site, e.g. `granddquiz`) and add `"site": "granddquiz"` inside the `"hosting"` block of `firebase.json`.
2. **Tools, once:** `npm install -g firebase-tools`, then `firebase login`.
3. **Link the folder, once**, from the project root: `firebase use --add` and pick the project. (`firebase.json` is already included, so do **not** run `firebase init` and overwrite it.)
4. **Deploy:** `npm run deploy:firebase`. It builds the client pointing at `https://granddquizzes.onrender.com` and uploads it. For another API address: `API_URL=https://your-api.example npm run deploy:firebase`.
5. **Allow the Firebase address on Render.** In the Render service > Environment set
   `CLIENT_ORIGIN=https://<site>.web.app,https://<site>.firebaseapp.com,https://granddquizzes.onrender.com`
   (comma separated, no trailing slashes, add your own domain here too if you connect one), then save. Render redeploys.
6. Open `https://<site>.web.app`. Join links, the QR code and the big screen use whatever address the page was opened on, so share the Firebase address with players.

Notes: the API still wakes slowly on Render's free tier, so open the app a few minutes early. Redeploying the client on Firebase never interrupts a live quiz (only a Render redeploy does).

## Troubleshooting

| What you see | Cause and fix |
|---|---|
| Server stops straight away with "Could not connect to MongoDB" | The message says why. Local host: start MongoDB or put your Atlas string in `server/.env` as `MONGODB_URI` (`MONGO_URI` also works). Atlas: check the password, and that **Network Access** allows your current IP (it changes with some ISPs). |
| `localhost:5001` says "The Granddquiz server is running" but no app | The client is not built. In development use `cd client && npm run dev` and open **http://localhost:5173**. To serve it from the server, run `npm run build` in the project folder and refresh. |
| `localhost:5173` loads but pages stay empty or sockets fail | The server is not running, or it is on another port. Start `cd server && npm run dev` and make sure `PORT` in `server/.env` matches (or set `VITE_PROXY_TARGET`). |
| "Port 5001 is already in use" | Another program has it. Set a different `PORT` in `server/.env`. (The default is 5001 because on a Mac, port 5000 belongs to AirPlay Receiver.) |
| `npm run dev` in the client says it cannot find `index.html` or `vite.config.js` | Your `client/` folder is incomplete. Re-extract the full project zip over it. |
| Sign-in says **"Failed to fetch"**, or the app loads but nothing works (Firebase + Render) | The browser is blocking the API call (CORS). Set `CLIENT_ORIGIN` on Render to the exact Firebase address(es), comma separated, with `https://` and no trailing slash, then let Render redeploy. If the API address is wrong or the Render free instance is still waking, wait a minute and reload. |
| Want to check the database setup | `cd server && TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm run test:db` runs the whole app against a throwaway local database. |

## Live protocol (Socket.IO)

Server pushes: `state` (everyone), `me` (each player), `hostInfo` (host only: the correct answer while a question is open), `kicked`.

| Host | Players | Big screen |
|---|---|---|
| `host:open {token,eventId}` | `player:join {code,nickname,playerId?}` | `screen:watch {code}` |
| `host:next` `host:lock` `host:reveal` `host:end` | `team:create {name}` `team:join {teamId}` `team:leave` | |
| `host:setLeader` `host:kick` | `team:transferLeader` `team:claimLeader` `answer:submit {choice}` | |

Flow: lobby → question → locked (timer ends, or everyone answered) → reveal → … → ended. A correct answer scores 1000 points, decaying to 500 as the timer runs out. Teams answer once, through their leader. Phones that drop reconnect with their saved `playerId` and keep their score.

## Results sheet and sound

- **Results sheet:** when a quiz finishes, the host console has **Download results (CSV)** with every rank, team members, points and prizes. It is built in the browser, so nothing extra is stored. Only the top 10 names and scores stay on the server (then auto-delete), and finished events in the events list offer **Download top 10 (CSV)**. Nicknames that start with `=`, `+`, `-` or `@` are neutralised so a spreadsheet never runs them as formulas.
- **Sound on the big screen:** a **Turn sound on** button (bottom right) switches on synthesised cues: a chime when a question starts, ticks for the last 5 seconds, a buzzer when time runs out (a ding when everyone answered early), a reveal flourish, a join blip in the lobby and a fanfare for the winners. Browsers block sound until the page is clicked, so it starts off and must be switched on once per page load. There are no audio files to host.

## Logo

A malachite tile with nested copper, marigold and cream diamonds (the chitenge motif from the pattern band) around a question mark whose dot is a small diamond. In the app it is the `Logo` component (`client/src/components/Logo.jsx`), shown in the top bar, join page and big screen. Files in `client/public/`: `logo-mark.svg` and `favicon.svg` (the browser tab icon), `apple-touch-icon.png` (iPhone home-screen icon), `logo-512.png` (transparent mark), `logo-lockup.png` and `logo-lockup-dark.png` (mark plus name, for sharing, print and social). The lockup PNGs use the Unbounded font; the SVGs contain no text.

## Timer

Every quiz is timed. The quiz master sets seconds per question (5 to 120, default 20, with quick presets) when creating the event. Players are told the limit in the lobby, and each question shows a large countdown number plus a shrinking bar on phones, the big screen and the host console. It turns red for the last 5 seconds, and answers lock automatically at zero (earlier if everyone has answered). Faster correct answers score more, so the clock also drives the points.

## Browser test

`e2e/browser-flow.py` drives a quiz master, a big screen and three phones through a full game with Playwright, including the sound and CSV checks; `e2e/sound-timeup.py` covers the countdown ticks and buzzer, `e2e/timer-check.py` covers the on-screen countdown (setup in each file header). `cd client && npm test` runs the CSV unit tests.

## Plans, branding, QR poster and payments
- **Quiz masters sign themselves up** at `/host/signup` (turn off with `ALLOW_HOST_SIGNUP=false`). Free events allow 10 players and show the Granddquiz badge.
- **Plans** (`server/src/services/plans.js`): per-event passes (Small / Medium / Large) and Venue / Pro subscriptions. Prices are in ZMW and can be changed with `PLAN_PRICES`.
- **Branding**: logo, name, colour, tagline and up to three sponsors per event. Guests see it only when the plan includes it. Pro removes the badge.
- **QR poster**: `/poster/CODE` is a print-ready A4 page with the join QR; the big screen also keeps a small join QR on screen during the quiz.
- **Payments**: Flutterwave hosted checkout (mobile money and card). Setup steps are in `BILLING.md`.
- **Admin** (`/admin/hosts`): see quiz masters, give a pilot venue a free trial, record a bank-transfer payment, switch accounts off.
- Tests: `npm test` (unit), `npm run test:billing` in `server/` (needs MongoDB, uses a fake Flutterwave), `python3 e2e/billing-flow.py` (browser).

## Next

Possible additions: sound cues on the big screen, a downloadable results sheet for the host, per-event question uploads.

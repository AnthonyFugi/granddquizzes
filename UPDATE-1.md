# Update 1: results sheet + big-screen sound

Unzip over your existing `granddquiz/` folder (same paths, overwrites the 8 changed files).
No new dependencies, so no `npm install` is needed. Then rebuild the client:

    cd client && npm run build        # or just redeploy: Render runs `npm run render-build`

## New files
- client/src/lib/csv.js            results sheet builder (with spreadsheet-formula protection)
- client/src/lib/sound.js          synthesised sound cues (Web Audio, no audio files)
- client/src/hooks/useSounds.js    plays a cue when the quiz changes stage
- client/test/csv.test.js          unit tests for the sheet (run: cd client && npm test)
- e2e/sound-timeup.py              browser check for countdown ticks and the buzzer

## Changed files
- client/src/pages/HostConsole.jsx   "Download results (CSV)" when the quiz has finished
- client/src/pages/Host.jsx          "Download top 10 (CSV)" on finished events
- client/src/pages/Screen.jsx        "Turn sound on" button + cue hook
- client/src/styles.css              style for the sound button
- client/package.json                adds the `test` script only
- server/test/demo-server.js         demo now keeps top-10 results on finish, like the real server
- e2e/browser-flow.py                also checks sound and both CSV downloads
- README.md                          documents both features

The game server (server/src) is untouched.

# Update 3: visible timer on every quiz

Apply with Terminal (merges; do not drag-and-drop over the folder in Finder):

    cd <folder that CONTAINS granddquiz>
    unzip -o ~/Downloads/granddquiz-update-3.zip
    cd granddquiz && npm run build        # or just redeploy

No new dependencies. Your server/.env is not touched. Restart the server (it has a small change).

## What changed
- Big countdown number plus bar on phones, the big screen and the host console; red for the last 5 seconds.
- Players see "Every question is timed: N seconds" in the lobby; the host lobby shows it too.
- Event form: Timer field with 10/20/30/45/60 presets and a note that every question is timed (5 to 120 s).
- Server: the time limit is now part of the shared state from the lobby on (GameSession.js, one line).

## Files
New: e2e/timer-check.py
Changed: README.md, client/src/{components/Quiz.jsx, pages/Host.jsx, pages/HostConsole.jsx, pages/Play.jsx, pages/Screen.jsx, styles.css},
server/src/services/GameSession.js, server/test/game.test.js

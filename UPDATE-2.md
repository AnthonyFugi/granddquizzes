# Update 2: fixes "localhost shows nothing" (restores the client, fixes startup)

## Apply (Terminal, not Finder drag-and-drop)
Finder's "Replace" can wipe a folder instead of merging into it. Use unzip, which merges:

    cd <the folder that CONTAINS granddquiz>
    unzip -o ~/Downloads/granddquiz-update-2.zip
    cd granddquiz
    npm run install:all

This update does not touch your server/.env.

## Run (two Terminal tabs)
    cd granddquiz/server && npm run dev       # API on http://localhost:5001
    cd granddquiz/client && npm run dev       # open http://localhost:5173

Or serve everything from one port:  `npm run build` in granddquiz/, then `cd server && npm start`
and open http://localhost:5001

## What was wrong
1. client/ was missing 17 files (index.html, vite.config.js, main.jsx, App.jsx, pages, components, libs).
   They are restored here.
2. Your server/.env used MONGO_URI but the server read MONGODB_URI, so it ignored your Atlas link, tried a
   MongoDB on your own computer, found none and crashed. Both names work now.
3. Port 5000 is used by the macOS AirPlay Receiver. The default is now 5001 and the client dev proxy
   follows it (override with VITE_PROXY_TARGET).
4. Failures were cryptic. Database, port and unbuilt-client problems now explain themselves in plain English.
5. Wording fix: players were told "nothing about you is saved", but the top 10 nicknames and scores ARE
   kept (then auto-deleted). The join and final screens now say so.

## If it still won't start
Read the message the server prints. For Atlas it is almost always Network Access (allow your current IP)
or the password. README.md has a Troubleshooting table.

## New files
client/.env.example, index.html, vite.config.js, src/main.jsx, src/App.jsx,
src/components/{Band,Code,Quiz,Shell}.jsx, src/hooks/useQuiz.js, src/lib/{api,auth,socket}.js,
src/pages/{Admin,Join,Play,Register}.jsx, server/test/integration.test.js, e2e/real-flow.py

## Changed files
server/src/config/env.js, server/src/config/db.js, server/src/server.js, server/src/app.js,
server/.env.example, server/package.json (adds `npm run test:db`), README.md
(client/src/pages/Join.jsx and Play.jsx are in the restored set, with the corrected wording)

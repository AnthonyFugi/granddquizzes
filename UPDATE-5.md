# Update 5: Firebase Hosting for the client (API stays on Render)

Apply in Terminal:

    cd <folder that CONTAINS granddquiz>
    unzip -o ~/Downloads/granddquiz-update-5.zip
    cd granddquiz

Then follow README.md > "Deploy the client on Firebase Hosting". Short version:

    npm install -g firebase-tools && firebase login      # once
    firebase use --add                                   # once: pick your Firebase project
    npm run deploy:firebase                              # builds against https://granddquizzes.onrender.com and uploads
    # then on Render > Environment, set:
    # CLIENT_ORIGIN=https://<site>.web.app,https://<site>.firebaseapp.com,https://granddquizzes.onrender.com

IMPORTANT: if the Firebase project already hosts another site (e.g. unzaconnectme), create a second
site for this app and add  "site": "<new-site-id>"  inside "hosting" in firebase.json. Otherwise the
deploy would REPLACE the other site.

No new dependencies. Your server/.env is not touched.

New: firebase.json
Changed: README.md, .gitignore (ignores .firebase/), package.json (adds build:firebase and deploy:firebase),
client/.env.example, client/src/lib/api.js (tolerates a trailing slash in the API address)

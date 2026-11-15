# Update 4: logo

Apply in Terminal (merges; do not drag-and-drop over the folder in Finder):

    cd <folder that CONTAINS granddquiz>
    unzip -o ~/Downloads/granddquiz-update-4.zip
    cd granddquiz
    git add . && git commit -m "Add logo" && git push      # Render redeploys automatically

No new dependencies, no server change, your server/.env is not touched.

## Where the logo appears
Top bar (host/admin/register pages), join page, big screen, browser tab icon, iPhone home-screen icon.

## Files in client/public/ for your own use
logo-mark.svg / favicon.svg   the mark, scalable (no text inside)
logo-512.png                  mark, transparent background
logo-lockup.png               mark + name on light (1600x420)
logo-lockup-dark.png          mark + name on dark green
apple-touch-icon.png          iPhone home-screen icon

New: those 6 files + client/src/components/Logo.jsx
Changed: README.md, client/index.html, client/src/components/Shell.jsx, client/src/pages/Join.jsx,
client/src/pages/Screen.jsx, client/src/styles.css

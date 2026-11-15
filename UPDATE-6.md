# Update 6: plans, branding, QR poster, Flutterwave payments

Adds quiz master sign-up, plan limits, per-event branding and sponsors, a print-ready QR poster, a join QR kept on the big screen, an admin page for quiz masters, and Flutterwave checkout.

## Apply
```
cd <folder that contains granddquiz>
unzip -o ~/Downloads/granddquiz-update-6.zip
cd granddquiz
npm run install:all        # no new packages, safe to skip
npm run build
```
Then follow `BILLING.md` to switch on payments (optional: everything else works without it).

## Behaviour changes to know about
- `ALLOW_HOST_SIGNUP` now defaults to **true** (self sign-up). Set `false` on Render to go back to invite-only.
- Free events are limited to **10 players** and show the Granddquiz badge. Existing events stay free until upgraded.
- Existing quiz masters and admins are unaffected.

## New server env (all optional)
`FLW_SECRET_KEY`, `FLW_SECRET_HASH`, `API_PUBLIC_URL`, `CLIENT_PUBLIC_URL`, `BILLING_CURRENCY`, `PLAN_PRICES`. See `server/.env.example`.

## Redeploy
Push to GitHub (Render redeploys the API) and run `npm run deploy:firebase` for the client.

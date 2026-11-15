# Taking payments with Flutterwave

Granddquiz uses Flutterwave's hosted checkout (API v3). The customer pays on Flutterwave's page, by mobile money or card. Granddquiz never sees or stores wallet or card details. A plan is granted only after the server asks Flutterwave to confirm the payment.

## 1. Get your keys
In the Flutterwave dashboard (use **Test mode** first):
1. Settings > API keys: copy the **Secret key** (starts `FLWSECK_TEST-` in test mode, `FLWSECK-` live).
2. Settings > Webhooks: set the **URL** to `https://granddquizzes.onrender.com/api/billing/webhook` and choose a **Secret hash** (any long random text you invent). Save.
3. Settings > Payment methods (or Checkout settings): make sure **Zambia mobile money (MTN / Airtel)** and cards are on for ZMW.

## 2. Set these on Render (Environment)
| Variable | Value |
|---|---|
| `FLW_SECRET_KEY` | the secret key from step 1 |
| `FLW_SECRET_HASH` | the same secret hash you typed in the webhook settings |
| `API_PUBLIC_URL` | `https://granddquizzes.onrender.com` |
| `CLIENT_PUBLIC_URL` | `https://granddquiz.web.app` |
| `BILLING_CURRENCY` | `ZMW` (default) |
Save. Render redeploys. Without `FLW_SECRET_KEY`, the Plans page tells quiz masters to contact FugiPay instead of showing a Pay button.

## 3. Try it in test mode
Sign in at `/host`, create an event, open **Plans**, pick an event and press Pay. Use Flutterwave's test cards / test mobile-money numbers from their docs. After paying you land back on the Plans page with "Payment received", and the event shows its new player limit.

## 4. Go live
Switch Flutterwave to live mode, replace `FLW_SECRET_KEY` with the live key, and check the webhook URL and secret hash are set in live mode too. Make one small real payment yourself first.

## How it stays safe
- The browser return and the webhook both lead to the same check: the server asks Flutterwave for the transaction and compares the reference, currency and amount. A forged return link or an underpayment grants nothing.
- A payment can only be applied once, even if the webhook and the return arrive together.
- The webhook is refused unless its `verif-hash` (or `flutterwave-signature`) matches your secret hash.

## Taking money outside the app
For a customer who pays you by bank transfer or mobile money directly: sign in as admin, open **Quiz masters**, and use **Give a plan** (pick the plan and the number of days).

## Changing prices
Set `PLAN_PRICES` on Render, for example `{"event_medium":350,"venue_month":500}`. Unlisted plans keep their defaults. The Plans page and checkout both use it.

## Caveat
The server code is tested against a fake Flutterwave that follows their v3 documentation. Before launch, do one full test-mode payment against the real service, because that is the one thing these tests cannot prove.

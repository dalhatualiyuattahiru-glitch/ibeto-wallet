# ibeto — Wallet App

A full-stack wallet app: sign up / sign in, fund your wallet, transfer money
to other users, withdraw to a bank, and pay bills — with a running
transaction history.

This project can run two ways:

1. **On Netlify** (recommended if you're deploying by uploading the zip) —
   static frontend + Netlify Functions backend + Netlify Blobs for storage.
   One deploy, no server to manage.
2. **Standalone with plain Node.js** — a zero-dependency Node server you run
   yourself (on your machine, or any host that runs Node, like Render or
   Railway). Netlify **cannot** run this one — it only serves static files
   and short-lived functions, not a long-running server.

## Option 1 — Deploy to Netlify

**Folder layout Netlify needs:**
```
frontend/            → static site (published as-is)
netlify/functions/   → the API, as serverless functions
netlify.toml         → tells Netlify where those two things are
package.json         → lets Netlify install @netlify/blobs for the functions
```

**How to deploy:**
- Drag-and-drop deploy: zip the **contents** of this `wallet-app` folder
  (not the folder itself) and drop that zip into Netlify's deploy area, or
- Git deploy (recommended): push this folder to a GitHub repo and connect
  it in Netlify — Netlify will read `netlify.toml` automatically and both
  build settings and functions will just work.

That's why you got a 404 before: the zip you uploaded had everything nested
inside a `wallet-app/` folder with no `index.html` at the root, and Netlify
didn't know where to find it — plus the old backend was a Node server, which
Netlify has no way to keep running. This restructure fixes both.

Data (users, balances, transaction history) is stored with **Netlify
Blobs**, a key-value store built into every Netlify site — no database
setup needed, and no extra dependency to install yourself; Netlify installs
`@netlify/blobs` automatically from `package.json` at build time.

## Option 2 — Run the standalone server locally

```
cd standalone-server
node server.js
```
Then open **http://localhost:4000**. Requires Node.js 18+, no `npm install`
needed. Data is stored in `standalone-server/data/db.json`.

## What's simulated vs. real
Real: account creation, password hashing (scrypt, never stored in plain
text), session tokens, balance math (in integer cents to avoid rounding
bugs), and a real ledger of transactions.

Simulated (no real money moves): funding from a "card", bank withdrawals,
and bill payments. There's no connection to a card network, bank, or
biller — wiring that up means integrating a licensed payment processor and
handling KYC/compliance, which is outside the scope of a demo.

## Branding
`frontend/assets/icon.png` (the wallet mark, used in the app UI and
favicon) and `frontend/assets/logo-full.png` (the full icon + "IBT"
wordmark lockup, handy for splash screens or marketing pages) both come
from the uploaded ibeto logo.

## API reference
Same routes either way — only how they're hosted differs.

| Method | Route              | Body                                              | Auth |
|--------|--------------------|----------------------------------------------------|------|
| POST   | /api/register      | `{ name, email, password }`                        | no   |
| POST   | /api/login         | `{ email, password }`                              | no   |
| GET    | /api/me            | —                                                   | yes  |
| POST   | /api/fund          | `{ amount, source }`                                | yes  |
| POST   | /api/transfer      | `{ recipient, amount, note }`                       | yes  |
| POST   | /api/withdraw      | `{ amount, bankName, accountNumber }`               | yes  |
| POST   | /api/pay-bill      | `{ billType, provider, customerId, amount }`        | yes  |
| GET    | /api/transactions  | —                                                    | yes  |

Authenticated requests send `Authorization: Bearer <token>` (the token
returned from register/login).

## Where to take it next
- Add rate limiting and stronger validation before sharing publicly.
- Move to a proper database once you have real users (Netlify Blobs is
  fine for a demo but not built for heavy concurrent writes).
- Add real payment rails (Stripe for funding, a payout API for
  withdrawals, a bill-pay aggregator) behind the same route shapes.

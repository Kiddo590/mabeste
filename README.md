# Mabeshte POS

A point-of-sale app for Mabeshte: tabs/order-taking, cash and M-Pesa payments, a
product catalogue with stock tracking, receipts, and staff/table/category
management. Built with Next.js (App Router, Tailwind v4) and Supabase
(Postgres + RLS, Edge Functions, Storage, Realtime). Staff sign in with a PIN,
not email/password — see `supabase/functions/staff-login`.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll need a `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Database changes live in `supabase/migrations/`; apply them with
`npx supabase db push --remote --yes` (the project must already be linked —
`npx supabase link`). Edge Functions live in `supabase/functions/` and deploy
with `npx supabase functions deploy <name>`.

## Going live with M-Pesa (STK Push)

The app ships sandbox-ready: `supabase/functions/mpesa-initiate`,
`mpesa-callback` and `mpesa-query` implement the Daraja STK Push flow, but
nothing will actually reach Safaricom until these secrets are set.

1. Create a Daraja app at [developer.safaricom.co.ke](https://developer.safaricom.co.ke)
   to get a consumer key and secret. For testing, use the sandbox shortcode
   `174379` and the sandbox passkey shown in the portal.
2. Set the function secrets (never commit these):
   ```bash
   npx supabase secrets set \
     MPESA_ENV=sandbox \
     MPESA_CONSUMER_KEY=... \
     MPESA_CONSUMER_SECRET=... \
     MPESA_SHORTCODE=174379 \
     MPESA_PASSKEY=... \
     MPESA_CALLBACK_TOKEN=$(openssl rand -hex 24)
   ```
   `MPESA_TRANSACTION_TYPE` (default `CustomerPayBillOnline`) and
   `MPESA_PARTY_B` (defaults to the shortcode; set this to the till number
   instead for `CustomerBuyGoodsOnline`) are optional.
3. Deploy the three functions:
   ```bash
   npx supabase functions deploy mpesa-initiate mpesa-callback mpesa-query
   ```
4. Open a tab, add an item, choose M-Pesa, and pay with a
   [Daraja sandbox test number](https://developer.safaricom.co.ke/Documentation).
   Confirm the payment settles and the tab closes.
5. When the real Paybill/Till is approved, switch to production: set
   `MPESA_ENV=production` plus the real shortcode/passkey/consumer key and
   secret (and `MPESA_TRANSACTION_TYPE`/`MPESA_PARTY_B` if using a Till), then
   register the callback URL
   (`https://<project-ref>.supabase.co/functions/v1/mpesa-callback?token=<MPESA_CALLBACK_TOKEN>`)
   on the production app and redeploy.

## Deploying the app

Hosted on Vercel, connected to this repo's `master` branch.

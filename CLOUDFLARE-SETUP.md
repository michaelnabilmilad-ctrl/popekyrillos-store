# Cloudflare Pages setup

## Project

- Connect the GitHub repository: `michaelnabilmilad-ctrl/popekyrillos-store`
- Framework preset: `None`
- Build command: `npm run build:cloudflare`
- Deploy command: `npx wrangler deploy`
- Path: `/`
- Production branch: `main`

## Environment variables

Add these variables in Cloudflare Pages:

```text
PAYMOB_SECRET_KEY=...
PAYMOB_API_KEY=...
PAYMOB_PUBLIC_KEY=...
PAYMOB_INTEGRATION_IDS=<card integration id from the same Paymob account>
PAYMOB_IFRAME_ID=<Paymob iframe id>
PAYMOB_ACCEPT_BASE_URL=https://accept.paymob.com
PAYMOB_HMAC_SECRET=...
BOSTA_API_KEY=...
SITE_URL=https://popekyrillos.store
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
```

Keep `PAYMOB_SECRET_KEY`, `PAYMOB_API_KEY`, `PAYMOB_HMAC_SECRET`, `BOSTA_API_KEY`, and `ADMIN_PASSWORD` secret. `ADMIN_USERNAME` can be plaintext, but using a secret for it is also fine.

The admin page is protected by the Cloudflare Worker. Add `ADMIN_USERNAME` and `ADMIN_PASSWORD` under **Settings -> Variables and secrets**, then deploy. Opening `/admin`, `/admin.html`, `/admin.css`, or `/admin.js` will require these credentials before any admin files load.

`PAYMOB_INTEGRATION_IDS` must come from the same Paymob merchant account as `PAYMOB_SECRET_KEY` and `PAYMOB_PUBLIC_KEY`. In Paymob Dashboard, open **Developers -> Payment Integrations** and copy the card integration ID. If Paymob returns `Integration ID/Name does not exist`, this value is wrong or belongs to another account/environment.

For VPC integrations such as `MIGS-online`, the Worker uses Paymob Accept's token/order/payment-key flow. Add `PAYMOB_API_KEY` from **Developers -> API Keys** and `PAYMOB_IFRAME_ID` from **Developers -> Iframes**.

Use `PAYMOB_ACCEPT_BASE_URL=https://accept-alpha.paymob.com` when the Paymob iframe link starts with `accept-alpha.paymob.com` or the account is in Test mode. Use `https://accept.paymob.com` for Live mode.

## KV binding

Create a KV namespace for Paymob orders and bind it to the Pages project:

```text
Binding name: PAYMOB_ORDERS
```

The Paymob functions use this binding to store pending orders, webhook updates, transaction IDs, paid/failed status, and Bosta shipment creation after paid Paymob orders. If the binding is missing, Paymob checkout can still open, but persistent order tracking and automatic Bosta shipment creation after Paymob payment will be skipped.

## Paymob webhook

Set Paymob Notification/Webhook URL to:

```text
https://popekyrillos.store/api/paymob-webhook
```

## Custom domains

Add both domains to Cloudflare Pages:

```text
popekyrillos.store
www.popekyrillos.store
```

After the Cloudflare deploy is live, Paymob checkout should use:

```text
https://popekyrillos.store/api/create-paymob-intention
```

Bosta delivery creation should use:

```text
https://popekyrillos.store/api/create-bosta-delivery
```

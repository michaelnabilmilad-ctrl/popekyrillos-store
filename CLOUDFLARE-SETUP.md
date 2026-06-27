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
PAYMOB_PUBLIC_KEY=...
PAYMOB_INTEGRATION_IDS=5497028
PAYMOB_HMAC_SECRET=...
BOSTA_API_KEY=...
SITE_URL=https://popekyrillos.store
```

Keep `PAYMOB_SECRET_KEY`, `PAYMOB_HMAC_SECRET`, and `BOSTA_API_KEY` secret.

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

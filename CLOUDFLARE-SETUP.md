# Cloudflare Pages setup

## Project

- Connect the GitHub repository: `michaelnabilmilad-ctrl/popekyrillos-store`
- Framework preset: `None`
- Build command: leave empty
- Build output directory: `/`
- Production branch: `main`

## Environment variables

Add these variables in Cloudflare Pages:

```text
PAYMOB_SECRET_KEY=...
PAYMOB_PUBLIC_KEY=...
PAYMOB_INTEGRATION_IDS=5497028
PAYMOB_HMAC_SECRET=...
SITE_URL=https://popekyrillos.store
```

Keep `PAYMOB_SECRET_KEY` and `PAYMOB_HMAC_SECRET` secret.

## KV binding

Create a KV namespace for Paymob orders and bind it to the Pages project:

```text
Binding name: PAYMOB_ORDERS
```

The Paymob functions use this binding to store pending orders, webhook updates, transaction IDs, and paid/failed status.

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

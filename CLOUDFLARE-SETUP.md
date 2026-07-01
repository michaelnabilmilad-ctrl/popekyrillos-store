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
PAYMOB_INTEGRATION_IDS=<card integration id from the same Paymob account>
PAYMOB_ACCEPT_BASE_URL=https://accept.paymob.com
PAYMOB_HMAC_SECRET=...
BOSTA_API_KEY=...
SITE_URL=https://popekyrillos.store
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
GITHUB_TOKEN=...
GITHUB_OWNER=michaelnabilmilad-ctrl
GITHUB_REPO=popekyrillos-store
GITHUB_BRANCH=main

# Legacy Paymob only. Leave empty when using Secret/Public keys.
PAYMOB_API_KEY=...
PAYMOB_IFRAME_ID=<Paymob iframe id>
```

Keep `PAYMOB_SECRET_KEY`, `PAYMOB_API_KEY`, `PAYMOB_HMAC_SECRET`, `BOSTA_API_KEY`, `ADMIN_PASSWORD`, and `GITHUB_TOKEN` secret. `PAYMOB_PUBLIC_KEY`, `PAYMOB_INTEGRATION_IDS`, `SITE_URL`, `ADMIN_USERNAME`, `GITHUB_OWNER`, `GITHUB_REPO`, and `GITHUB_BRANCH` can be plaintext.

The admin page is protected by the Cloudflare Worker. Add `ADMIN_USERNAME` and `ADMIN_PASSWORD` under **Settings -> Variables and secrets**, then deploy. Opening `/admin`, `/admin.html`, `/admin.css`, or `/admin.js` will require these credentials before any admin files load.

The `wrangler.toml` asset config runs the Worker before static assets for the admin paths only. Keep `run_worker_first` enabled for `/admin`, `/admin/*`, `/admin.html`, `/admin.css`, and `/admin.js`; otherwise Cloudflare can serve the static admin files before the password check runs. The Cloudflare build also publishes the admin dashboard at `/admin/` to avoid automatic `admin.html` redirects.

## Admin direct publishing

The admin dashboard can commit `products.json` directly to GitHub through `/admin/api/update-products`. Create a GitHub fine-grained personal access token with access only to `michaelnabilmilad-ctrl/popekyrillos-store` and **Contents: Read and write**, then add it to Cloudflare as:

```text
GITHUB_TOKEN=<token>
```

When the admin button saves products, the Worker updates `products.json` on the `main` branch. Cloudflare should then start a new deploy automatically from the GitHub commit.

The admin image upload button uses the same `GITHUB_TOKEN` to commit converted WebP images into `assets/optimized/products/gallery/`. After uploading an image, click **Save and publish** in the admin dashboard so the new image path is saved into `products.json`.

`PAYMOB_INTEGRATION_IDS` must come from the same Paymob merchant account as `PAYMOB_SECRET_KEY` and `PAYMOB_PUBLIC_KEY`. In Paymob Dashboard, open **Developers -> Payment Integrations** and copy the card integration ID. If Paymob returns `Integration ID/Name does not exist`, this value is wrong or belongs to another account/environment.

For the current Paymob dashboard, use `PAYMOB_SECRET_KEY` with `PAYMOB_PUBLIC_KEY`; do not put the Secret Key in `PAYMOB_API_KEY`. The `PAYMOB_SECRET_KEY` value should be the key only, without adding `Token` or `Bearer` before it. The Worker will create a Paymob Intention and open Unified Checkout.

For legacy VPC integrations such as `MIGS-online`, leave `PAYMOB_SECRET_KEY` empty and use Paymob Accept's token/order/payment-key flow instead. Add the old `PAYMOB_API_KEY` from the old dashboard/API Keys and `PAYMOB_IFRAME_ID` from **Developers -> Iframes**.

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

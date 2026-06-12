# Pope Kyrillos Store Security Setup

## Authentication

- Firebase Authentication is the identity provider.
- Enabled providers should be Google and Facebook only.
- Customer login is optional for browsing, but signed-in customers keep their carts across devices.

## Authorization

Firestore access is controlled by `firestore.rules`:

- Public users can read products.
- Customers can read/write only their own `customers/{uid}` and `customerCarts/{uid}` documents.
- Customers can read their own orders only.
- Orders are created by Cloud Functions, not directly by the browser.
- Product edits and order updates are restricted to admins.

To make an admin, create a document:

```text
admins/{firebaseAuthUid}
```

The document can contain:

```json
{
  "role": "admin",
  "createdAt": "manual"
}
```

## Server-Side Order Validation

The browser sends only:

- product ID
- variant ID
- quantity
- customer shipping/pickup details
- payment method

The `createOrder` Cloud Function calculates:

- product availability
- real unit prices
- line totals
- order total
- item count

This protects against browser-side price manipulation.

## Secrets

Never put API secrets in `script.js`, `firebase-config.js`, or GitHub.

Set secrets with Firebase CLI:

```powershell
npx.cmd firebase-tools functions:secrets:set BOSTA_API_KEY
```

When Paymob full online checkout credentials are available, add them as Firebase secrets too.

## Deploy

After logging into Firebase CLI:

```powershell
npx.cmd -y firebase-tools login
npx.cmd -y firebase-tools deploy --only firestore:rules,functions
```

GitHub Pages deploys the static website from the `main` branch.

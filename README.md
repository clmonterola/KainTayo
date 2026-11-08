# KainTayo — Filipino food ordering demo

A complete, presentation-ready food ordering website: demo login, server-backed menu
CRUD, cart, checkout, and **PayMongo** hosted checkout with GCash, Maya, and cards.
Built with Next.js App Router, TypeScript, and Tailwind CSS v4.

The menu is fully API-driven. No sample dishes, prices, images, or categories are
hardcoded in the frontend; a fresh install starts with an empty menu until products are
created through the admin API or loaded from your database adapter.

> **Demo only.** No real food is delivered and no real money is charged. Payments run in
> PayMongo test mode, or through a built-in demo gateway when no API key is configured.

---

## Demo credentials

| Field | Value |
| --- | --- |
| Email | `demo@kaintayo.ph` |
| Password | `kain123` |

The login screen shows these credentials and has a **Fill in** button. Change them with
`DEMO_EMAIL` / `DEMO_PASSWORD` in `.env.local`.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create your env file. A ready-to-run .env.local is already included;
#    to start clean, copy .env.example to .env.local (Windows: Copy-Item).

# 3. Run the app
npm run dev
```

Open <http://localhost:3000>. You are redirected to `/login`, then to the menu after
signing in with the demo account. The menu starts empty by design. Add products at
`/admin`, or connect the product data-access layer to your database.

### Production-style preview

```bash
npm run build
npm start
```

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |

---

## The demo flow

1. **Login** → demo credentials, validation, signed httpOnly session cookie.
2. **Menu** → hero, search, API-driven category filters, availability filter, sorting,
   quick-view dialog, add to bag. Shows loading, error, and empty states.
3. **Menu management** (`/admin`) → create, edit, delete, and toggle availability. All
   writes go through authenticated API routes and are persisted server-side.
4. **Bag** → quantity steppers, remove/clear confirmations, delivery-fee progress.
5. **Checkout** → customer details, delivery address, notes, payment method (GCash,
   Maya, card), server-priced totals.
6. **Payment** → PayMongo hosted checkout (or the demo gateway), then success/cancel
   return, server-side verification, and webhook reconciliation.
7. **Orders** → payment history with references, statuses, receipts, and an audit trail.

---

## PayMongo setup (test mode)

1. Create a free account at <https://dashboard.paymongo.com> and stay in **Test mode**.
2. Copy your **secret** key (`sk_test_…`) from Developers → API keys.
3. Put it in `.env.local`:

   ```env
   PAYMONGO_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxx
   ```

4. Restart the dev server. Checkout now creates a real PayMongo Checkout Session and
   redirects to the hosted page.

> **Never** put the secret key in `NEXT_PUBLIC_*` or in client code. Only
> `src/server/paymongo.ts` reads it, and the module is marked `server-only`.

### Return URLs

Localhost redirects work for development, but PayMongo needs a publicly reachable URL for
reliable returns and webhooks. Use a tunnel:

```bash
npx localtunnel --port 3000
# or: ngrok http 3000
```

Then set:

```env
NEXT_PUBLIC_APP_URL=https://your-tunnel-url
```

`/payment/success?ref=…` and `/payment/cancel?ref=…` are generated from this value.
Without it, the app falls back to the request origin.

### Webhooks

1. In the PayMongo dashboard → Developers → Webhooks, add:

   ```
   https://your-tunnel-url/api/payments/webhook
   ```

2. Subscribe to at least:
   - `checkout_session.payment.paid`
   - `payment.failed`
   - `checkout_session.expired`
3. Copy the signing secret into `.env.local`:

   ```env
   PAYMONGO_WEBHOOK_SECRET=whsk_xxxxxxxx
   PAYMONGO_MODE=test
   ```

The webhook route verifies `Paymongo-Signature` with HMAC-SHA256 over
`` `${t}.${rawBody}` `` and compares against `te` (test) or `li` (live). Invalid
signatures get `401`. Duplicate events are harmless: paid/failed/cancelled are terminal
states and cannot be downgraded by a late redirect.

Full details, payloads, and a curl signature example are in
[`docs/paymongo.md`](docs/paymongo.md).

### No-key demo gateway

With `PAYMONGO_SECRET_KEY` empty, checkout opens `/payment/mock/[reference]`, a small
wallet-styled screen with **Authorize**, **Decline**, and **Cancel** actions. It writes the
same order transitions as the real integration, so the result page, order history, and
audit trail all behave identically. This is the quickest path for a class demo.

---

## Architecture

```
src/
├─ app/
│  ├─ login/                    Demo login (server-checked session)
│  ├─ (app)/                    Authenticated shell: header, footer, mobile nav
│  │  ├─ order/                 Menu + search + filters
│  │  ├─ cart/                  Bag and totals
│  │  ├─ checkout/              Customer details + method selection
│  │  ├─ orders/                Payment/order history
│  │  ├─ admin/                 Menu CRUD
│  │  └─ payment/
│  │     ├─ mock/[reference]/   Built-in demo gateway (no-key mode)
│  │     ├─ success/            Server-verified receipt & status
│  │     └─ cancel/             Cancellation + retry
│  └─ api/
│     ├─ auth/                  login · logout · me
│     ├─ products/              GET (public) · POST/PATCH/DELETE (auth)
│     ├─ categories/            GET dynamic category names
│     ├─ orders/                GET (auth)
│     └─ payments/
│        ├─ create/             Server-priced order + checkout session
│        ├─ [reference]/        GET verification · cancel
│        ├─ mock/[reference]/   Demo outcomes
│        └─ webhook/            Signed PayMongo notifications
├─ components/                  UI kit, feature views, providers
├─ lib/                         Types, API services, pricing, validation, formatting
└─ server/                      Auth, product/order stores, PayMongo (server-only)
```

The customer menu and admin use `src/lib/services/products.ts` for all product reads
and writes. No product list, category enum, image list, or sample price lives in the
frontend.

### Where money logic lives

- **Totals are recalculated on the server** from the product store in
  `POST /api/payments/create`; client-supplied prices are ignored.
- **Payment state** is a small state machine (`pending → paid | failed | cancelled`) in
  `src/server/order-store.ts`. Terminal states never regress.
- **Verification** happens on `GET /api/payments/[reference]` (fetch the Checkout Session
  from PayMongo) and in the signed webhook. The success redirect alone never marks an
  order paid.
- **Secrets** only exist in server modules and environment variables.

### Storage and database integration

The current demo uses a small JSON adapter so it runs without external services:

- `.data/products.json` — product records. It starts empty and is created on first read;
  there is no seed file and no sample menu.
- `.data/orders.json` — orders, payment records, audit events.
- `localStorage` — the shopping bag (`kaintayo.cart.v1`).

Both `.data` files are git-ignored. On serverless hosts (Vercel) the filesystem is
ephemeral, so connect a real database before deploying for real.

**Swapping in a database:** `src/server/product-store.ts` is the only product
data-access layer. Replace its JSON reads/writes with Prisma/SQL queries and keep the
exported function contract. The UI, cart, checkout, and payment flows already use the
same API routes and will pick up database records automatically. `GET /api/categories`
currently derives category names from product records; when you add a categories table,
update `listCategories()` to read it. Product images must be `https://` URLs or
`/storage/...` references. File uploads are intentionally not implemented in this demo.

---

## API reference

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | – | Demo login, sets signed cookie |
| `POST` | `/api/auth/logout` | – | Clears session |
| `GET` | `/api/auth/me` | cookie | Current user |
| `GET` | `/api/products` | – | Menu |
| `GET` | `/api/categories` | – | Dynamic categories from product records |
| `POST` | `/api/products` | cookie | Create dish |
| `PATCH` | `/api/products/:id` | cookie | Update dish |
| `DELETE` | `/api/products/:id` | cookie | Delete dish |
| `GET` | `/api/orders` | cookie | Order/payment history |
| `POST` | `/api/payments/create` | cookie | Create order + session |
| `GET` | `/api/payments/:reference` | cookie | Verify + fetch order |
| `POST` | `/api/payments/:reference/cancel` | cookie | Mark pending order cancelled |
| `POST` | `/api/payments/mock/:reference` | cookie | Demo gateway outcome |
| `POST` | `/api/payments/webhook` | signature | PayMongo webhook |

Errors return `{ "error": "message", "fields": { "field": "message" } }`. The UI maps
`fields` back onto inputs.

---

## Design notes

The visual identity is a warm Filipino kitchen: cream paper, ink charcoal, tomato red,
mango yellow, and a serif display face (Fraunces) paired with Outfit. Product imagery is
supplied by each product record, so the app ships without bundled food photos.

Accessibility and polish included: keyboard-operable dialogs, visible focus rings,
`aria-live` toasts, reduced-motion support, inline validation, loading skeletons, empty
states, and confirmations for destructive actions.

---

## Limitations (by design)

- Single demo account, not multi-tenant; every signed-in user sees the same orders.
- JSON file storage, not a database or queue. The product store is ready to swap for one.
- No image upload/storage pipeline yet; products accept image URLs or storage references.
- No email/SMS delivery, no real delivery logistics, no refunds.
- The demo gateway is clearly labelled and only runs when PayMongo is not configured.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Redirected to `/login` after signing in | Cookies are blocked. Use `localhost` (not `127.0.0.1` mismatch) and check `NEXT_PUBLIC_APP_URL`. |
| “We couldn't reach the payment gateway” | Wrong/expired `PAYMONGO_SECRET_KEY`, or live key with `PAYMONGO_MODE` not `live`. Check the server console. |
| Webhook returns `401` | `PAYMONGO_WEBHOOK_SECRET` missing/wrong, or you are replaying an edited body. |
| Order stuck pending | Open the receipt page to force a server-side check, or confirm the webhook is subscribed and reachable. |
| Menu is empty | This is the default on a fresh install. Add products at `/admin`, or import records through your database adapter. |

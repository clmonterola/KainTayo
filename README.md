# KainTayo — Filipino food ordering demo

A complete, presentation-ready food ordering website: demo login, server-backed menu
CRUD, cart, checkout, and **Xendit** hosted checkout with GCash, Maya, and cards.
Built with Next.js App Router, TypeScript, Tailwind CSS v4, and **Supabase PostgreSQL**.

The menu is fully API-driven. No sample dishes, prices, images, or categories are
hardcoded in the frontend; a fresh install starts with an empty menu until products are
created through the admin API. Every read and write goes to Supabase — there is no local
JSON fallback in the product or order paths.

> **Demo only.** No real food is delivered and no real money is charged. Payments run in
> Xendit **test mode**, or through a built-in local gateway when no API key is configured.

---

## Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `demo@kaintayo.ph` | `kain123` |
| Seller | `seller@kaintayo.ph` | `kain123` |
| Customer | `customer@kaintayo.ph` | `kain123` |

All three are seeded by the SQL migration into `public.users`. The login screen shows the
admin credentials and has a **Fill in** button; change them with `DEMO_EMAIL` /
`DEMO_PASSWORD` in `.env.local`.

Authorization is role-based and checked **on the server** on every request:

| | Admin | Seller | Customer |
| --- | --- | --- | --- |
| Create/edit/delete dishes | all | only their own (`products.seller_id`) | no |
| Read menu / categories | yes | yes | yes |
| Read orders | all | own + orders containing their dishes | own only |
| Verify/cancel a payment | yes | their orders | their orders only |

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Environment — a ready-to-run .env.local is included (it is git-ignored).
#    To start clean: copy .env.example .env.local  (Windows: Copy-Item)

# 3. Apply the database migration (see the next section)

# 4. Run the app
npm run dev
```

Open <http://localhost:3000>. You are redirected to `/login`, then to the menu after
signing in. The menu starts empty by design — add products at `/admin`.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `node scripts/hash-password.mjs "<pw>"` | Print a `public.users.password_hash` |
| `node scripts/import-json-to-supabase.mjs` | One-off import of legacy `.data/*.json` |

---

## 1. Supabase setup

### Apply the migration

1. Open the Supabase Dashboard → your project → **SQL Editor** → **New query**.
2. Paste the whole file
   [`supabase/migrations/20261108000000_kaintayo_schema.sql`](supabase/migrations/20261108000000_kaintayo_schema.sql)
   and press **Run** (`Ctrl+Enter`). It is idempotent — safe to re-run.
3. Verify with the checklist at the bottom of that file:

   ```sql
   select table_name, row_security from information_schema.tables
    where table_schema = 'public' order by table_name;   -- row_security = YES for all
   select email, role from public.users order by role;   -- admin / seller / customer
   select count(*) from pg_policies where schemaname = 'public';  -- 9
   ```

### Tables created

`users`, `categories`, `products`, `orders`, `order_items`, `payments`,
`payment_events` — each with primary keys, foreign keys (`order_items → orders`,
`order_items → products`, `orders → users`, `products → categories`, `payments → orders`,
…), `created_at`/`updated_at` triggers, constraints (`check` on status/role/price/
quantity), unique indexes, and query indexes (`orders(reference)` unique,
`orders(user_id)`, `order_items(order_id)`, `payments(order_id)` unique, …).

### Keys

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local`, public | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local`, public | `sb_publishable_…` — public catalog reads |
| `SUPABASE_SECRET_KEY` | `.env.local`, **server only** | `sb_secret_…` — every write |

Get the secret key from **Project Settings → API Keys** and put it in `.env.local`:

```env
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxxxxxxxxx
```

`.env.local` and `.env` are already listed in `.gitignore` (`.env*.local`, `.env`), so the
key never reaches Git. It is read only by `src/server/supabase.ts`, which imports
`server-only` — importing it from a client component fails the build. Never add a
`NEXT_PUBLIC_` prefix to it and never log it.

### Authentication and Row Level Security

KainTayo does **not** use Supabase Auth. It signs its own session cookie (HMAC with
`AUTH_SECRET`), `src/server/auth.ts` verifies it, `src/server/user-store.ts` maps it to a
row in `public.users`, and each API route checks the customer/seller/admin role and record
ownership before touching the database. `auth.uid()` is therefore always `NULL` here and
no policy depends on it.

RLS is **enabled on every table** and never disabled to make the app work:

- `anon` / `authenticated` (publishable key): `SELECT` on `products` and `categories`
  only — the public catalog. Every other table has **no** policy for these roles, which
  means access is denied by default (password hashes, orders, payments, and the webhook
  audit trail included).
- No `INSERT`/`UPDATE`/`DELETE` policy exists for `anon` or `authenticated` on any table.
- `service_role` (the server Secret Key) is the only write path. Supabase gives it
  `BYPASSRLS`, and the migration also declares it explicitly so the trusted path is
  visible in the schema.

Server routes use the service-role key **and** still run their own checks first — session,
role, and ownership. RLS is defence in depth, not a substitute for validating each API
request, and privileged access is never used instead of an authorization check.

### Migrating old JSON data (optional)

If you still have `.data/products.json` / `.data/orders.json`, import them after the
migration runs:

```bash
node scripts/import-json-to-supabase.mjs
```

It is idempotent (existing names/references are skipped). Once the rows are verified in
the Table Editor, the JSON files are no longer read by the app — you can delete `.data/`.

---

## 2. Xendit setup (test mode)

1. Create a free account at <https://dashboard.xendit.co> and stay in **Test mode**.
2. Settings → Developers → API keys → copy the secret key (`xnd_development_…`).
3. Put it in `.env.local`:

   ```env
   XENDIT_SECRET_KEY=xnd_development_xxxxxxxxxxxxx
   XENDIT_MODE=test
   ```

4. Restart the dev server. Checkout now creates a real Xendit invoice and redirects to
   the hosted page.

> **Never** put the key in `NEXT_PUBLIC_*` or in client code. Only `src/server/xendit.ts`
> reads it, and the module is marked `server-only`.

### Return URLs

Localhost redirects work for development, but Xendit needs a publicly reachable URL for
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

1. Xendit Dashboard → Settings → Developers → Callbacks → add:

   ```
   https://your-tunnel-url/api/payments/webhook
   ```

   and choose the **Invoice** events (`invoice.paid`, `invoice.expired`).

2. Copy the **callback token** into `.env.local`:

   ```env
   XENDIT_CALLBACK_TOKEN=your-callback-token
   ```

The route verifies the `x-callback-token` header with `timingSafeEqual` and rejects
mismatches with `401` (in production a missing token is also rejected). Duplicate events
are harmless: there is one `payments` row per order (unique FK) and terminal states never
regress, so a retry can neither create a duplicate record nor downgrade a paid order.

Full payloads, a local curl test, and the test-mode checklist are in
[`docs/payments.md`](docs/payments.md).

### No-key gateway

With `XENDIT_SECRET_KEY` empty, checkout opens `/payment/mock/[reference]`, a small
wallet-styled screen with **Authorise**, **Decline**, and **Cancel** actions. It writes the
same order transitions through the server, so the receipt, order history, and audit trail
behave identically. This is the quickest path for a class demo.

---

## The demo flow

1. **Login** → credentials checked against `public.users` (scrypt) with a fallback to the
   configured local account, validation, signed httpOnly session cookie.
2. **Menu** → hero, search, API-driven category filters, availability filter, sorting,
   quick-view dialog, add to bag. Shows loading, error, and empty states.
3. **Menu management** (`/admin`) → create, edit, delete, and toggle availability. Requires
   a `seller` or `admin` role; sellers only touch dishes they own.
4. **Bag** → quantity steppers, remove/clear confirmations, delivery-fee progress.
5. **Checkout** → customer details, delivery address, notes, payment method (GCash, Maya,
   card), server-priced totals.
6. **Payment** → Xendit hosted checkout (or the local gateway), then success/cancel
   return, server-side verification, and webhook reconciliation.
7. **Orders** → role-scoped history with references, statuses, receipts, and an audit trail.

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
│  │     ├─ mock/[reference]/   Built-in gateway (no-key mode)
│  │     ├─ success/            Server-verified receipt & status
│  │     └─ cancel/             Cancellation + retry
│  └─ api/
│     ├─ auth/                  login · logout · me
│     ├─ products/              GET (public) · POST/PATCH/DELETE (seller/admin)
│     ├─ categories/            GET category names from public.categories
│     ├─ orders/                GET (role-scoped)
│     └─ payments/
│        ├─ create/             Server-priced order + Xendit invoice
│        ├─ [reference]/        GET verification · cancel
│        ├─ mock/[reference]/   Built-in gateway outcomes
│        └─ webhook/            x-callback-token verified notifications
├─ components/                  UI kit, feature views, providers
├─ lib/                         Types, API services, pricing, validation, formatting
└─ server/                      auth, api helpers, supabase, stores, xendit (server-only)

supabase/migrations/            SQL schema + RLS policies + seeded accounts
scripts/                        password hashing, legacy JSON import
```

The customer menu and admin use `src/lib/services/products.ts` for all product reads
and writes. No product list, category enum, image list, or sample price lives in the
frontend.

### Where money logic lives

- **Totals are recalculated on the server** from `public.products` in
  `POST /api/payments/create`; client-supplied prices are ignored.
- **Payment state** is a small state machine (`pending → paid | failed | cancelled`) in
  `src/server/order-store.ts`. Terminal states never regress.
- **Verification** happens on `GET /api/payments/[reference]` (invoice fetched from Xendit
  with the secret key) and in the token-verified webhook. The success redirect alone never
  marks an order paid, and the browser never reports payment success.
- **Idempotency** — one `payments` row per order plus a unique `payments.provider_reference`
  index; webhook retries update instead of inserting.
- **Secrets** only exist in server modules and environment variables.

### Data access

- `src/server/product-store.ts` — `products` + `categories` (create/update/delete dishes).
- `src/server/order-store.ts` — `orders`, `order_items`, `payments`, `payment_events`,
  plus `transitionOrder()` (the status state machine).
- `src/server/user-store.ts` — account lookup, scrypt verification, role resolution.
- `src/server/supabase.ts` — the single place keys are read; `getServerClient()` for
  public reads, `requireServerAccess()` for writes (fails fast with a clear `503` if the
  secret key is missing).

Product images must be `https://` URLs or `/storage/...` references. File uploads are
intentionally not implemented in this demo.

---

## API reference

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | – | Login, sets signed cookie |
| `POST` | `/api/auth/logout` | – | Clears session |
| `GET` | `/api/auth/me` | cookie | Current user |
| `GET` | `/api/products` | – | Menu |
| `GET` | `/api/categories` | – | Categories from `public.categories` |
| `POST` | `/api/products` | cookie + seller/admin | Create dish |
| `PATCH` | `/api/products/:id` | cookie + owner/admin | Update dish |
| `DELETE` | `/api/products/:id` | cookie + owner/admin | Delete dish |
| `GET` | `/api/orders` | cookie, role-scoped | Order/payment history |
| `POST` | `/api/payments/create` | cookie | Create order + Xendit invoice |
| `GET` | `/api/payments/:reference` | cookie + ownership | Verify + fetch order |
| `POST` | `/api/payments/:reference/cancel` | cookie + ownership | Mark pending order cancelled |
| `POST` | `/api/payments/mock/:reference` | cookie + ownership | Built-in gateway outcome |
| `POST` | `/api/payments/webhook` | `x-callback-token` | Xendit webhook |

Errors return `{ "error": "message", "fields": { "field": "message" } }`. The UI maps
`fields` back onto inputs; database/configuration problems come back as clean `500`/`503`
JSON instead of stack traces.

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

- No image upload/storage pipeline yet; products accept image URLs or storage references.
- No email/SMS delivery, no real delivery logistics, no refunds.
- The built-in gateway is clearly labelled and only runs when Xendit is not configured.
- Passwords are stored as salted scrypt hashes; there is no password reset flow.
- The `payments/webhook` endpoint expects a public URL in production (use a tunnel
  locally).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `EINVAL: readlink …\.next\…` — dev server or build crashes right after "Starting…" | OneDrive is syncing the project and turns `.next` into cloud placeholders. Set `NEXT_DIST_DIR` in `.env.local` to a folder outside OneDrive (this machine already points at `%LOCALAPPDATA%\Temp\kaintayo-next\dist`), or pause OneDrive sync while developing. Deleting `.next` is a one-off workaround; it comes back. |
| `503` "This needs the Supabase server key" | Add `SUPABASE_SECRET_KEY` to `.env.local` and restart. |
| `42P01` / "Could not find the table 'public.products'" | Run the SQL migration in the Supabase SQL Editor. |
| `401` from Xendit | Wrong/missing `XENDIT_SECRET_KEY`, or a live key with `XENDIT_MODE` not `live`. |
| Redirected to `/login` after signing in | Cookies are blocked. Use `localhost` (not `127.0.0.1` mismatch) and check `NEXT_PUBLIC_APP_URL`. |
| “We couldn't reach the payment gateway” | Xendit rejected the invoice — check the server console for the provider message (often a non-absolute return URL). |
| Webhook returns `401` | `XENDIT_CALLBACK_TOKEN` missing/wrong, or you are replaying an edited body. |
| Order stuck pending | Open the receipt page to force a server-side check, or confirm the callback URL is registered and reachable. |
| Menu is empty | This is the default on a fresh database. Add products at `/admin`. |
| `403` "Your account doesn't have access" | A customer/seller tried an admin-only or another owner's resource. |

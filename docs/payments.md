# Payment integration notes (Xendit)

This document explains how KainTayo talks to Xendit, what runs where, and how to test the
whole payment lifecycle safely in **test mode**.

## 1. Mental model

```
Browser                          Next.js server                       Xendit
-------                          --------------                       ------
POST /api/payments/create  ───▶  validate session + role
                                 price cart from Supabase
                                 save order (pending) ──▶ public.orders
                                 POST /v2/invoices ──────────────▶  create invoice
                                 update payments row      ◀──────  id + invoice_url
       ◀────────────────────────  { reference, checkoutUrl, mode }
window.location = invoice_url ─────────────────────────────────▶  hosted checkout
                                                                    GCash / Maya / card
       ◀────────────────────────  redirect to success_url?ref=…  ◀─  payment attempt
GET /api/payments/:ref     ───▶  GET /v2/invoices/:id ──────────▶  trusted status
       ◀────────────────────────  verified order status
                                 (also) webhook ─────────────────▶  /api/payments/webhook
```

Two independent confirmations exist on purpose:

1. **Receipt verification** — the receipt page asks the server, which asks Xendit with the
   secret key.
2. **Webhook** — Xendit pushes the event even if the customer closes the browser.

The **webhook is authoritative**. Either server-side path can move an order to `paid`;
the browser never can, and neither can move a terminal order backwards.

## 2. Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | build/public | Project URL, safe to expose. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | build/public | `sb_publishable_…`. Reads the public catalog (RLS). |
| `SUPABASE_SECRET_KEY` | **server only** | `sb_secret_…` service-role key. Required for every write. |
| `XENDIT_SECRET_KEY` | **server only** | `xnd_development_…` (test) or `xnd_live_…` (live). |
| `XENDIT_CALLBACK_TOKEN` | **server only** | Callback token from Xendit → Settings → Developers → Callbacks. |
| `XENDIT_MODE` | server only | `test` (default) or `live`. |
| `NEXT_PUBLIC_APP_URL` | build/server | Absolute success/cancel return URLs. |

`src/server/supabase.ts`, `src/server/xendit.ts`, `src/server/order-store.ts` and
`src/server/product-store.ts` all import `server-only`, so an accidental client import
fails the build instead of leaking a key. No `NEXT_PUBLIC_` variable ever holds a secret.

A live `xnd_live_` key is rejected unless `XENDIT_MODE=live`, which prevents accidentally
charging real cards during a demo.

### Why the secret key is required

RLS stays enabled on every table. The publishable key maps to the `anon` role, and the
policies only grant it `SELECT` on `products`/`categories` — so with only that key, the
menu renders but every write (accounts, dishes, orders, payments) is denied by Postgres,
exactly as intended. Server routes use `SUPABASE_SECRET_KEY` **and still run their own
session + role checks first**; privileged access never replaces an authorization check.

## 3. Creating an invoice

**Route:** `POST /api/payments/create` (requires session cookie + a resolved account)

Request:

```json
{
  "customer": {
    "name": "Juan Dela Cruz",
    "email": "juan@email.com",
    "phone": "09171234567",
    "address": "123 Mabini St",
    "barangay": "Poblacion",
    "city": "Makati City",
    "postalCode": "1200",
    "notes": "Call on arrival"
  },
  "method": "gcash",
  "items": [
    { "productId": "9f0c…", "quantity": 2 },
    { "productId": "1a2b…", "quantity": 1 }
  ]
}
```

Server behaviour:

1. Validates the session and resolves the account row (`public.users`) for `user_id`.
2. Validates the customer and quantities (`1–20` per dish, `≤ 30` lines).
3. Re-reads products from Supabase; rejects missing or unavailable dishes.
4. Computes `subtotal`, `deliveryFee` (`₱59`, free at `₱999`), and `total` server-side.
5. Saves `orders` + `order_items` + `payments` + `payment_events` (status `pending`,
   reference like `KT-261108-4A2F`).
6. `POST https://api.xendit.co/v2/invoices` with `Authorization: Basic base64(key:)`,
   `external_id` = our reference, `amount` in whole pesos, `currency: "PHP"`.
7. Stores the invoice id as `payments.provider_reference` and the hosted URL as
   `payments.checkout_url`.
8. Returns:

```json
{ "reference": "KT-261108-4A2F", "checkoutUrl": "https://checkout.xendit.co/…", "mode": "xendit", "total": 437 }
```

`mode` is `"xendit"` when `XENDIT_SECRET_KEY` is set and `"demo"` otherwise; the checkout
copy and redirect behaviour branch on it.

### No-key gateway

With `XENDIT_SECRET_KEY` empty, checkout opens `/payment/mock/[reference]`, a local
wallet-styled screen with **Authorise**, **Decline**, and **Cancel** actions. It writes the
same transitions through `POST /api/payments/mock/:reference` (server-side, session +
ownership checked), so the receipt, history, and audit trail behave identically.

## 4. Verification on return

**Route:** `GET /api/payments/:reference`

Requires a session and an ownership check (customers: their own orders only; sellers:
their own orders plus orders containing their dishes; admins: everything).

If the order is `xendit` + `pending` + has an invoice id, the server calls
`GET /v2/invoices/:id` and maps:

| Xendit status | Local status |
| --- | --- |
| `PENDING` | `pending` |
| `PAID` | `paid` |
| `EXPIRED` | `cancelled` |

The response includes `verified` (true when Xendit was consulted without errors) and an
optional `warning` — the UI shows a "couldn't confirm yet" notice instead of pretending
the payment succeeded.

`POST /api/payments/:reference/cancel` only moves `pending → cancelled` (idempotent).

## 5. Webhooks

**Route:** `POST /api/payments/webhook`

Xendit sends a static token header:

```
x-callback-token: <token from Dashboard → Settings → Developers → Callbacks>
```

Verification (`src/server/xendit.ts` → `verifyCallbackToken`) compares the header with
`XENDIT_CALLBACK_TOKEN` using `crypto.timingSafeEqual`.

- Token configured → header must match, otherwise `401`.
- Token missing → `401` in production, accepted with a console warning in development so
  local testing still works.
- A header without a configured token → `401` (we never accept an unverifiable claim).

Status handling (payload may be flat or wrapped in `data`):

| `status` | Transition | Notes |
| --- | --- | --- |
| `PAID` | `paid` | stores `payment_id` as `paymentId`, `paid_at` |
| `EXPIRED` | `cancelled` | `failureReason: "Checkout session expired."` |
| `PENDING` | none | informational, returns `ignored: "pending"` |
| anything else | none | `200` so Xendit does not retry forever |

Order lookup: `external_id` (our reference) → regex scan of the body for
`KT-######-XXXX`. Unknown references return `200 {ignored: "unknown_order"}`.

### Idempotency / duplicate protection

- The order row is located by a **unique** `orders.reference`.
- Exactly **one** `payments` row per order (`payments.order_id` is `UNIQUE`), so a retry
  updates it and can never insert a second record; `payments.provider_reference` also has
  a unique partial index.
- `transitionOrder` refuses to leave a terminal state (`paid`, `failed`, `cancelled`), so
  a duplicate or out-of-order delivery cannot downgrade a verified payment — it is logged
  in `payment_events` as `(ignored: already paid)`.
- Nothing is written from the success redirect itself.

### Local webhook test

```bash
BODY='{"external_id":"KT-261108-4A2F","id":"inv_test_123","status":"PAID","paid_amount":437,"payment_id":"pay_test_1"}'

# token from XENDIT_CALLBACK_TOKEN in .env.local
curl -i -X POST http://localhost:3000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -H "x-callback-token: YOUR_CALLBACK_TOKEN" \
  --data "$BODY"
```

Run it twice: the first call marks the order `paid`, the second must return `200` and add
an `(ignored: already paid)` audit entry without creating a second payment row.

Replaying with a wrong token must return `401`.

## 6. Test-mode checklist

1. Run the SQL migration (see `supabase/migrations/…`) and set
   `SUPABASE_SECRET_KEY` in `.env.local`.
2. Set `XENDIT_SECRET_KEY=xnd_development_…` and `XENDIT_CALLBACK_TOKEN=…`.
3. Restart `npm run dev`; confirm checkout reports `mode: "xendit"` (server console or
   the response body).
4. Tunnel the app (`ngrok http 3000`), set `NEXT_PUBLIC_APP_URL`, and register
   `https://your-tunnel/api/payments/webhook` as an **Invoice** callback in Xendit.
5. Sign in → create a dish at `/admin` → refresh → edit → delete (verify Supabase rows).
6. Sign in as `customer@kaintayo.ph`, add dishes, check out with GCash.
7. Complete Xendit's test flow; the receipt must show **Paid** and `/orders` must list it.
8. Re-deliver the webhook (dashboard "Resend" or the curl above) → still `paid`, no
   duplicate rows (`select count(*) from payments where order_id = …` = 1).
9. Send a webhook with a bad token → `401`.
10. Sign in as `seller@kaintayo.ph` → only their dishes/orders are editable; as
    `customer@kaintayo.ph` → `/api/orders` returns only their own orders.

## 7. Going live

- Set `XENDIT_MODE=live` and use an `xnd_live_…` key.
- Use HTTPS for `NEXT_PUBLIC_APP_URL`, and rotate `SUPABASE_SECRET_KEY`/`AUTH_SECRET`.
- Keep RLS enabled; never grant `anon` write policies to "make it work".
- Monitor failed verifications, expired invoices, and webhook `401`s.
- Never log full request bodies or keys.

## 8. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `503` "Database writes need the server key" | `SUPABASE_SECRET_KEY` missing/empty in `.env.local`. |
| `42P01` / "Could not find the table" | The SQL migration has not been run yet. |
| `401` from Xendit | Secret key missing, malformed, or wrong mode. |
| Invoice URL empty / HTTP 400 | `NEXT_PUBLIC_APP_URL` must be an absolute URL. |
| Status stays `pending` | Webhook not registered/reachable; open the receipt to force verification. |
| Webhook `401` | Wrong/missing `XENDIT_CALLBACK_TOKEN`, or a replay with an edited body. |
| Payment paid but order failed | A redirect raced the webhook; the terminal-state guard keeps the correct result — check `payment_events`. |
| `403` "You don't have access" | Customer/seller requesting another account's order. |

# PayMongo integration notes

This document explains how KainTayo talks to PayMongo, what runs where, and how to test
the whole payment lifecycle safely.

## 1. Mental model

```
Browser                          Next.js server                    PayMongo
-------                          --------------                    --------
POST /api/payments/create  ───▶  price cart from product store
                                 save order (pending)
                                 POST /v1/checkout_sessions  ───▶  create session
                                 save session id + URL       ◀───  checkout_url
      ◀────────────────────────  { reference, checkoutUrl }
window.location = checkoutUrl ──────────────────────────────────▶  hosted checkout
                                                                   GCash / Maya / card
      ◀────────────────────────  redirect to success_url?ref=…  ◀──  payment attempt
GET /api/payments/:ref     ───▶  GET /v1/checkout_sessions/:id ──▶  trusted status
      ◀────────────────────────  verified order status
                                 (also) webhook ─────────────────▶  /api/payments/webhook
```

Two independent confirmations exist on purpose:

1. **Redirect verification** — the receipt page asks the server, which asks PayMongo.
2. **Webhook** — PayMongo pushes the event even if the customer closes the browser.

Either path can move an order to `paid`; neither can move a terminal order backwards.

## 2. Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `PAYMONGO_SECRET_KEY` | server only | `sk_test_…` for the demo. Never expose. |
| `PAYMONGO_WEBHOOK_SECRET` | server only | `whsk_…` from the dashboard. |
| `PAYMONGO_MODE` | server only | `test` (default) or `live`. |
| `NEXT_PUBLIC_APP_URL` | build/server | Used to build absolute return URLs. |

`src/server/paymongo.ts` imports `server-only`, so an accidental client import fails the
build instead of leaking the key.

A live key is rejected unless `PAYMONGO_MODE=live`, which prevents accidentally charging
real cards during a demo.

## 3. Creating a Checkout Session

**Route:** `POST /api/payments/create` (requires session cookie)

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
    { "productId": "product_id_1", "quantity": 2 },
    { "productId": "product_id_2", "quantity": 1 }
  ]
}
```

Server behaviour:

1. Validates the customer and quantities (`1–20` per dish, `≤ 30` lines).
2. Re-reads product records from the product data-access layer; rejects missing or
   unavailable dishes.
3. Computes `subtotal`, `deliveryFee` (`₱59`, free at `₱999`), and `total`.
4. Saves an order with status `pending` and a reference like `KT-261106-8F2A`.
5. Calls `POST https://api.paymongo.com/v1/checkout_sessions` with Basic auth
   (`secret:`) and centavo amounts.
6. Stores the session id, checkout URL, and intent id on the order.
7. Returns:

```json
{
  "reference": "KT-261106-8F2A",
  "checkoutUrl": "https://checkout.paymongo.com/…",
  "mode": "paymongo",
  "total": 437
}
```

Payment method mapping:

| App method | PayMongo `payment_method_types` |
| --- | --- |
| `gcash` | `["gcash"]` |
| `paymaya` | `["paymaya"]` |
| `card` | `["card"]` |

Card sessions request 3-D Secure with `request_three_d_secure: "any"`.

Line items use integer centavos (`unitPrice * 100`) and `currency: "PHP"`.

## 4. Verification on return

**Route:** `GET /api/payments/:reference`

If the order is `paymongo` + `pending` + has a session id, the server calls
`GET /v1/checkout_sessions/:id` and maps:

| PayMongo status | Local status |
| --- | --- |
| `active` | `pending` |
| `paid` | `paid` |
| `expired` | `cancelled` |

When paid, the first paid payment id from the session is stored as `paymentId`, and
`paidAt` is set. The response also includes `verified` (true when PayMongo was consulted)
and an optional `warning` if the API call failed — the UI shows a “not yet verified”
notice rather than pretending the payment succeeded.

`POST /api/payments/:reference/cancel` only moves `pending → cancelled`; it is called by
the cancel page and is idempotent.

## 5. Webhooks

**Route:** `POST /api/payments/webhook`

Signature header format:

```
Paymongo-Signature: t=1700000000,te=<test sig>,li=<live sig>
```

Verification (`src/server/paymongo.ts` → `verifyWebhookSignature`):

```ts
const expected = crypto
  .createHmac("sha256", PAYMONGO_WEBHOOK_SECRET)
  .update(`${t}.${rawBody}`)
  .digest("hex");

timingSafeEqual(Buffer.from(expected), Buffer.from(te)); // test mode
```

Notes:

- The **raw** body must be used; parsing and re-serialising changes the signature.
- `te` is used in test mode, `li` in live mode (controlled by `PAYMONGO_MODE`).
- Missing secret → `401` in production; accepted with a console warning in development so
  local testing still works.

Event handling:

| Event | Transition |
| --- | --- |
| `checkout_session.payment.paid` | `paid` |
| `payment.paid` | `paid` |
| `payment.failed` | `failed` (stores `failure_reason`) |
| `checkout_session.expired` | `cancelled` |

Order lookup order: `reference_number` → `metadata.reference` → checkout session id →
regex scan of the payload for a `KT-######-XXXX` reference. Unknown references return
`200` so PayMongo does not retry forever.

Duplicate and out-of-order events are safe because `transitionOrder` refuses to leave a
terminal state.

### Local webhook testing with a signature

```bash
BODY='{"data":{"attributes":{"type":"checkout_session.payment.paid","data":{"id":"cs_test_123","type":"checkout_session","attributes":{"reference_number":"KT-261106-8F2A"}}}}}'
T=1700000000
SIG=$(node -e "const c=require('crypto');console.log(c.createHmac('sha256',process.env.PAYMONGO_WEBHOOK_SECRET).update(process.argv[1]+'.'+process.argv[2]).digest('hex'))" "$T" "$BODY")

curl -i -X POST http://localhost:3000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -H "Paymongo-Signature: t=$T,te=$SIG" \
  --data "$BODY"
```

## 6. Test-mode checklist

1. Set `PAYMONGO_SECRET_KEY=sk_test_…`.
2. Tunnel the app and set `NEXT_PUBLIC_APP_URL` to the tunnel origin.
3. Register the webhook and set `PAYMONGO_WEBHOOK_SECRET`.
4. Sign in → add dishes → checkout → choose GCash/Maya/Card.
5. Complete the hosted flow using PayMongo’s test instructions.
6. Confirm the receipt says **Paid**, and that `/orders` lists the same status.
7. Replay the webhook with an edited body → expect `401`.
8. Close the browser after paying, then reopen the receipt → server verification should
   still show the correct status.

## 7. Going live (do not do this in the demo)

- Set `PAYMONGO_MODE=live` and use `sk_live_…`.
- Use HTTPS for `NEXT_PUBLIC_APP_URL`.
- Move products and orders to a transactional database.
- Add per-user order ownership and authorization (the demo shares one account).
- Add idempotency keys and a durable webhook event log.
- Monitor failed verifications, expired sessions, and webhook 401s.
- Never log full request bodies or keys.

## 8. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `401` from PayMongo | Secret key missing, malformed, or wrong mode. |
| `Could not create checkout session` | Redirect URLs must be absolute. Check `NEXT_PUBLIC_APP_URL`. |
| Status stays `pending` | Webhook not registered/reachable; open the receipt to force verification. |
| Webhook `401` | Wrong signing secret, or body was modified before verification. |
| Payment paid but order failed | A live redirect raced the webhook; terminal-state guard keeps the correct result. Check the audit trail. |

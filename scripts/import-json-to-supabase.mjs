#!/usr/bin/env node
/**
 * One-off import of the legacy JSON store into Supabase.
 *
 * Run it AFTER the SQL migration has been applied:
 *
 *   node scripts/import-json-to-supabase.mjs
 *
 * It reads `.data/products.json` and `.data/orders.json` (if present) and
 * writes them into `public.categories`, `public.products`, `public.orders`,
 * `public.order_items`, `public.payments` and `public.payment_events`.
 *
 * Credentials come from `.env.local` (same file the app uses): the server key
 * `SUPABASE_SECRET_KEY` is required because RLS is enabled. The import is
 * idempotent — existing product names / order references are skipped.
 */
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

function readEnvFile(file) {
  const out = {};
  try {
    const raw = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!match) continue;
      const value = match[2].replace(/^["']|["']$/g, "");
      out[match[1]] = value;
    }
  } catch {
    // No env file: fall back to process.env.
  }
  return out;
}

const fileEnv = readEnvFile(".env.local");
const env = (name) => process.env[name] ?? fileEnv[name] ?? "";

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const key = env("SUPABASE_SECRET_KEY") || env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local.");
  process.exit(1);
}
if (!env("SUPABASE_SECRET_KEY")) {
  console.error(
    "SUPABASE_SECRET_KEY is empty — Row Level Security will reject the import writes.",
  );
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function readJson(file) {
  try {
    return JSON.parse(await fsPromises.readFile(path.join(ROOT, ".data", file), "utf8"));
  } catch {
    return null;
  }
}

async function fail(operation, error) {
  console.error(`  ✗ ${operation}: ${error.message ?? error}`);
  process.exitCode = 1;
}

async function ensureCategory(name) {
  const { data: existing, error: readError } = await sb
    .from("categories")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing.id;

  const { data: inserted, error: insertError } = await sb
    .from("categories")
    .insert({ name })
    .select("id")
    .maybeSingle();
  if (insertError && insertError.code !== "23505") throw insertError;
  if (inserted) return inserted.id;

  const { data: again, error: againError } = await sb
    .from("categories")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (againError) throw againError;
  if (again) return again.id;
  throw new Error(`could not create category "${name}"`);
}

async function findUserByEmail(email) {
  if (!email) return null;
  const { data, error } = await sb
    .from("users")
    .select("id")
    .eq("email", String(email).toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function importProducts() {
  const products = await readJson("products.json");
  if (!Array.isArray(products)) {
    console.log("• No .data/products.json found — skipping products.");
    return 0;
  }

  const { data: existing, error } = await sb.from("products").select("name");
  if (error) throw error;
  const known = new Set((existing ?? []).map((row) => row.name));

  let imported = 0;
  for (const product of products) {
    if (known.has(product.name)) {
      console.log(`  - skipped (already present): ${product.name}`);
      continue;
    }
    try {
      const categoryId = await ensureCategory(product.category ?? "Other");
      const { error: insertError } = await sb.from("products").insert({
        name: product.name,
        description: product.description ?? "",
        price: Number(product.price) || 0,
        image: product.image ?? "",
        category_id: categoryId,
        available: product.available !== false,
        tag: product.tag || null,
        prep_minutes: Number(product.prepMinutes) || 15,
        seller_id: await findUserByEmail(env("DEMO_EMAIL") || "demo@kaintayo.ph"),
        created_at: product.createdAt,
        updated_at: product.updatedAt,
      });
      if (insertError) throw insertError;
      imported += 1;
      console.log(`  ✓ ${product.name}`);
    } catch (error) {
      await fail(`product "${product.name}"`, error);
    }
  }
  return imported;
}

async function importOrders() {
  const orders = await readJson("orders.json");
  if (!Array.isArray(orders)) {
    console.log("• No .data/orders.json found — skipping orders.");
    return 0;
  }

  let imported = 0;
  for (const order of orders) {
    try {
      const { data: duplicate, error: lookupError } = await sb
        .from("orders")
        .select("id")
        .eq("reference", order.reference)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (duplicate) {
        console.log(`  - skipped (already present): ${order.reference}`);
        continue;
      }

      const { data: orderRow, error: orderError } = await sb
        .from("orders")
        .insert({
          reference: order.reference,
          user_id: await findUserByEmail(order.customer?.email),
          status: order.status ?? "pending",
          customer_name: order.customer?.name ?? "",
          customer_email: order.customer?.email ?? "",
          customer_phone: order.customer?.phone ?? "",
          customer_address: order.customer?.address ?? "",
          customer_barangay: order.customer?.barangay ?? "",
          customer_city: order.customer?.city ?? "",
          customer_postal_code: order.customer?.postalCode ?? "",
          customer_notes: order.customer?.notes ?? "",
          subtotal: order.subtotal ?? 0,
          delivery_fee: order.deliveryFee ?? 0,
          total: order.total ?? 0,
          created_at: order.createdAt,
          updated_at: order.updatedAt,
        })
        .select("id")
        .single();
      if (orderError) throw orderError;

      const orderId = orderRow.id;
      const items = (order.items ?? []).map((item) => ({
        order_id: orderId,
        product_id: item.productId || null,
        name: item.name ?? "",
        image: item.image ?? "",
        unit_price: item.unitPrice ?? 0,
        quantity: item.quantity ?? 1,
        line_total: item.lineTotal ?? 0,
      }));
      if (items.length) {
        const { error: itemsError } = await sb.from("order_items").insert(items);
        if (itemsError) throw itemsError;
      }

      const { error: paymentError } = await sb.from("payments").insert({
        order_id: orderId,
        provider: order.payment?.provider ?? "demo",
        method: order.payment?.method ?? "gcash",
        amount: order.total ?? 0,
        status: order.status ?? "pending",
        provider_reference: order.payment?.sessionId ?? null,
        payment_reference: order.payment?.paymentId ?? null,
        provider_status: order.payment?.providerStatus ?? null,
        checkout_url: order.payment?.checkoutUrl ?? null,
        paid_at: order.payment?.paidAt ?? null,
        failure_reason: order.payment?.failureReason ?? null,
      });
      if (paymentError) throw paymentError;

      const events = (order.events ?? []).map((event) => ({
        order_id: orderId,
        type: event.type,
        message: event.message,
        created_at: event.at,
      }));
      if (events.length) {
        const { error: eventsError } = await sb.from("payment_events").insert(events);
        if (eventsError) throw eventsError;
      }

      imported += 1;
      console.log(`  ✓ ${order.reference}`);
    } catch (error) {
      await fail(`order "${order.reference}"`, error);
    }
  }
  return imported;
}

console.log("Importing .data/*.json into Supabase…");
const products = await importProducts();
const orders = await importOrders();
console.log(`Done. products: ${products}, orders: ${orders}.`);
console.log("Verify the rows in Table Editor, then keep using the app (JSON is no longer read).");

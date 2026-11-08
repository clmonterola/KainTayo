-- ============================================================================
-- KainTayo — initial schema for Supabase PostgreSQL
-- ----------------------------------------------------------------------------
-- How to apply:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file and press Run (Ctrl+Enter)
--   3. Verify with the checklist at the bottom of this file
--
-- The script is idempotent: tables, triggers, indexes, policies and grants are
-- guarded with IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS, so it is
-- safe to re-run — including on a database that already has rows.
--
-- How KainTayo authenticates (and why this file contains no auth.uid())
--   * KainTayo issues its own signed session cookie (HMAC with AUTH_SECRET).
--     src/server/auth.ts verifies the cookie, src/server/user-store.ts resolves
--     it to a row in public.users, and every API route checks the
--     customer/seller/admin role and record ownership BEFORE it reads or writes
--     anything (src/server/api.ts).
--   * Supabase Auth is not used by this project, so `auth.uid()` is NULL for
--     every request the application makes. No policy may depend on it: a policy
--     written against auth.uid() would silently match nothing and read like
--     protection while providing none. The previous version of this file had
--     that flaw; the legacy helper functions and policies are dropped below.
--   * The server connects with the Secret Key (role `service_role`) — the only
--     write path. The publishable key (role `anon`) can read the public catalog
--     and nothing else.
--
-- Security invariants kept by this file
--   * RLS is ENABLED on all seven tables and is never disabled.
--   * No INSERT / UPDATE / DELETE policy exists for anon or authenticated.
--   * customer / seller / admin authorization lives in the server API routes,
--     evaluated against the verified KainTayo session — never in SQL, and
--     privileged access is never used instead of an authorization check.
--   * The Secret Key stays in .env.local, read only by src/server/supabase.ts
--     (a `server-only` module). It is never sent to the browser and never
--     logged.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- customers, sellers and administrators
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         text        not null unique,
  name          text        not null,
  role          text        not null default 'customer'
                check (role in ('customer', 'seller', 'admin')),
  -- scrypt hash produced by scripts/hash-password.mjs (never plaintext)
  password_hash text        not null,
  phone         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  name         text         not null,
  description  text         not null,
  price        numeric(10,2) not null check (price >= 0),
  image        text         not null default '',
  category_id  uuid         not null references public.categories (id) on delete restrict,
  available    boolean      not null default true,
  tag          text,
  prep_minutes integer      not null default 15 check (prep_minutes between 1 and 240),
  -- the seller/admin that owns the dish (used by seller authorization in the
  -- API routes: src/app/api/products/[id]/route.ts)
  seller_id    uuid         references public.users (id) on delete set null,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  -- human readable receipt id, e.g. KT-261108-4A2F
  reference          text        not null unique,
  -- nullable: a signed-in customer owns the row, a guest checkout does not
  user_id            uuid        references public.users (id) on delete set null,
  status             text        not null default 'pending'
                     check (status in ('pending', 'paid', 'failed', 'cancelled')),
  customer_name      text        not null,
  customer_email     text        not null,
  customer_phone     text        not null,
  customer_address   text        not null,
  customer_barangay  text        not null,
  customer_city      text        not null,
  customer_postal_code text      not null,
  customer_notes     text        not null default '',
  subtotal           numeric(10,2) not null,
  delivery_fee       numeric(10,2) not null,
  total              numeric(10,2) not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  -- nullable: kept (with set null) so order history survives product deletion
  product_id uuid references public.products (id) on delete set null,
  -- snapshot of the dish at purchase time
  name       text not null,
  image      text not null default '',
  unit_price numeric(10,2) not null,
  quantity   integer not null check (quantity > 0),
  line_total numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id                 uuid primary key default gen_random_uuid(),
  -- one payment record per order (unique) -> webhook retries can never
  -- create a duplicate row, they only update this one
  order_id           uuid not null unique references public.orders (id) on delete cascade,
  provider           text not null check (provider in ('xendit', 'demo')),
  method             text not null check (method in ('gcash', 'paymaya', 'card')),
  amount             numeric(10,2) not null,
  status             text not null default 'pending'
                     check (status in ('pending', 'paid', 'failed', 'cancelled')),
  -- provider invoice id (Xendit) or built-in gateway id
  provider_reference text,
  -- provider payment/transaction id
  payment_reference  text,
  provider_status    text,
  checkout_url       text,
  paid_at            timestamptz,
  failure_reason     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- audit trail shown on the receipt
create table if not exists public.payment_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  type       text not null,
  message    text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
create index if not exists products_category_id_idx  on public.products (category_id);
create index if not exists products_seller_id_idx    on public.products (seller_id);
create index if not exists products_available_idx    on public.products (available);
create index if not exists products_created_at_idx   on public.products (created_at desc);

create index if not exists orders_user_id_idx        on public.orders (user_id);
create index if not exists orders_status_idx         on public.orders (status);
create index if not exists orders_created_at_idx     on public.orders (created_at desc);

create index if not exists order_items_order_id_idx   on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);

create index if not exists payments_order_id_idx      on public.payments (order_id);
create index if not exists payments_status_idx        on public.payments (status);
-- a provider invoice/payment id may only ever belong to one row
create unique index if not exists payments_provider_reference_key
  on public.payments (provider_reference)
  where provider_reference is not null and provider_reference <> '';

create index if not exists payment_events_order_id_idx on public.payment_events (order_id, created_at);

create index if not exists users_role_idx on public.users (role);
create index if not exists users_email_idx on public.users (email);

-- ---------------------------------------------------------------------------
-- 4. Remove the auth.uid()-based security layer (upgrade path)
--
--    These helpers/policies assumed Supabase Auth. KainTayo uses its own
--    session cookie, so auth.uid() was NULL for every request and the checks
--    could never grant anything. Dropping them removes dead code that read
--    like real protection; authorization now lives only in the API routes.
-- ---------------------------------------------------------------------------
drop function if exists public.is_admin();
drop function if exists public.is_seller();
drop function if exists public.can_view_order(uuid);

-- legacy policies (kept as DROP ... IF EXISTS so an already-migrated database
-- is cleaned up by re-running this file)
drop policy if exists "Users read their own profile" on public.users;
drop policy if exists "Users update their own profile" on public.users;

drop policy if exists "Staff manage categories" on public.categories;

drop policy if exists "Products are publicly readable" on public.products;
drop policy if exists "Staff manage products" on public.products;

drop policy if exists "Orders are visible to their owner and staff" on public.orders;
drop policy if exists "Orders are created by their owner" on public.orders;
drop policy if exists "Orders are updated by staff" on public.orders;

drop policy if exists "Order items follow their order" on public.order_items;
drop policy if exists "Order items are written with their order" on public.order_items;

drop policy if exists "Payments are visible with their order" on public.payments;
drop policy if exists "Payments are managed by admins" on public.payments;

drop policy if exists "Payment events follow their order" on public.payment_events;
drop policy if exists "Payment events are managed by admins" on public.payment_events;

-- ---------------------------------------------------------------------------
-- 5. Row Level Security — enabled on every table, never disabled
-- ---------------------------------------------------------------------------
alter table public.users          enable row level security;
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.payments       enable row level security;
alter table public.payment_events enable row level security;

-- 5a. Public catalog: the ONLY access the publishable key (anon) gets, and it
--     is read-only. The menu and the category list are public by design.
drop policy if exists "Catalog is publicly readable" on public.products;
create policy "Catalog is publicly readable"
  on public.products for select
  to anon, authenticated
  using (true);

drop policy if exists "Categories are publicly readable" on public.categories;
create policy "Categories are publicly readable"
  on public.categories for select
  to anon, authenticated
  using (true);

-- 5b. users, orders, order_items, payments and payment_events get NO policy
--     for anon/authenticated: with RLS enabled and no policy, access is denied
--     by default. That is what keeps password hashes, orders, payment
--     references and the webhook audit trail out of reach of the publishable
--     key — no policy is required to deny, and none may be added that depends
--     on auth.uid() (always NULL for this app).
--
--     customer / seller / admin authorization is enforced in the server API
--     routes against the verified KainTayo session: role checks and product
--     ownership in src/app/api/products/*, role-scoped order listing in
--     src/server/order-store.ts, order ownership in src/app/api/payments/*.

-- 5c. The server's Secret Key maps to service_role — the only write path.
--     Supabase grants service_role BYPASSRLS, so these policies are normally
--     never evaluated; they are declared so the trusted path is explicit in
--     the schema (and the app keeps working if that attribute were absent).
--     They grant nothing to anon or authenticated.
drop policy if exists "Server may do anything" on public.users;
create policy "Server may do anything"
  on public.users for all to service_role
  using (true) with check (true);

drop policy if exists "Server may do anything" on public.categories;
create policy "Server may do anything"
  on public.categories for all to service_role
  using (true) with check (true);

drop policy if exists "Server may do anything" on public.products;
create policy "Server may do anything"
  on public.products for all to service_role
  using (true) with check (true);

drop policy if exists "Server may do anything" on public.orders;
create policy "Server may do anything"
  on public.orders for all to service_role
  using (true) with check (true);

drop policy if exists "Server may do anything" on public.order_items;
create policy "Server may do anything"
  on public.order_items for all to service_role
  using (true) with check (true);

drop policy if exists "Server may do anything" on public.payments;
create policy "Server may do anything"
  on public.payments for all to service_role
  using (true) with check (true);

drop policy if exists "Server may do anything" on public.payment_events;
create policy "Server may do anything"
  on public.payment_events for all to service_role
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 6. Privileges (RLS filters rows; these decide who may try at all)
--
--    Supabase gives new tables in `public` broad default privileges, so they
--    are revoked explicitly here: the publishable key must not even hold
--    INSERT/UPDATE/DELETE rights on accounts, orders or payments.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

revoke all
  on public.users, public.categories, public.products, public.orders,
     public.order_items, public.payments, public.payment_events
  from anon, authenticated;

grant select on public.products, public.categories to anon, authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- 7. Seed accounts (roles used by the authorization tests)
--    All three share the demo password `kain123`.
--    Re-hash a new password with:  node scripts/hash-password.mjs "new-password"
--
--    Runs as the SQL Editor role (table owner), so RLS does not block it, and
--    `on conflict (email) do nothing` keeps re-runs harmless.
-- ---------------------------------------------------------------------------
insert into public.users (email, name, role, password_hash) values
  ('demo@kaintayo.ph',    'Aling Nena',      'admin',    'scrypt$16384$8$1$cX++birUPFh3TAaFE+rXcw==$cbdkfHGBqsRz3GNKS8L6XzttY4K/KHK1BOVQvibnlpu5HJGvGMyRUbLkc2c53V7PsVYFLhPhCEly2z7j3X6XuQ=='),
  ('seller@kaintayo.ph',  'Kusina ni Marco', 'seller',   'scrypt$16384$8$1$cX++birUPFh3TAaFE+rXcw==$cbdkfHGBqsRz3GNKS8L6XzttY4K/KHK1BOVQvibnlpu5HJGvGMyRUbLkc2c53V7PsVYFLhPhCEly2z7j3X6XuQ=='),
  ('customer@kaintayo.ph','Juan Dela Cruz',  'customer', 'scrypt$16384$8$1$cX++birUPFh3TAaFE+rXcw==$cbdkfHGBqsRz3GNKS8L6XzttY4K/KHK1BOVQvibnlpu5HJGvGMyRUbLkc2c53V7PsVYFLhPhCEly2z7j3X6XuQ==')
on conflict (email) do nothing;

-- ============================================================================
-- Verification checklist (run these after pressing Run)
--
--   1) RLS enabled on every table — all rows must say 'YES':
--        select table_name, row_security from information_schema.tables
--         where table_schema = 'public' order by table_name;
--
--   2) Exactly 9 policies: 2 public catalog reads + 7 service_role policies:
--        select tablename, policyname, roles, cmd from pg_policies
--         where schemaname = 'public' order by tablename, policyname;
--
--   3) The Secret Key role bypasses RLS (expected: service_role = true):
--        select rolname, rolbypassrls from pg_roles
--         where rolname in ('anon', 'authenticated', 'service_role');
--
--   4) The three seeded accounts exist:
--        select email, role from public.users order by role;
--
--   5) Publishable-key isolation — run these two lines one at a time:
--        set role anon;
--        select count(*) from public.products;   -- allowed, returns 0
--        select count(*) from public.users;      -- ERROR 42501 permission
--                                                -- denied for table users
--        reset role;
--      The error on the second query is the expected, desired result.
--
--   6) Nothing references Supabase Auth any more:
--        select count(*) from pg_policies where definition like '%auth.uid()%';
--        -- expect 0
-- ============================================================================

-- ============================================================================
-- KainTayo — initial schema for Supabase PostgreSQL
-- ----------------------------------------------------------------------------
-- How to apply:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file and press Run (Ctrl+Enter)
--   3. Verify with the checklist at the bottom of this file
--
-- The script is idempotent: every statement is guarded with IF NOT EXISTS /
-- CREATE OR REPLACE, so it is safe to re-run.
--
-- Design notes
--   * Every table has RLS ENABLED (never disabled to make the app work).
--   * `anon` (the publishable key) can only read the public catalog.
--   * `authenticated` is governed by customer / seller / admin policies that
--     are written against Supabase Auth identities (auth.uid()).
--   * Application server routes use the secret (service_role) key and MUST
--     still run their own authorization checks — RLS is defence in depth, not
--     a replacement for validating each API request.
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
  -- the seller/admin that owns the dish (used by seller authorization)
  seller_id    uuid         references public.users (id) on delete set null,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  -- human readable receipt id, e.g. KT-261108-4A2F
  reference          text        not null unique,
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

-- ---------------------------------------------------------------------------
-- 4. Helper functions used by the RLS policies
--    SECURITY DEFINER so policies never recurse into the row they guard.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  );
$$;

create or replace function public.is_seller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('seller', 'admin')
  );
$$;

-- Admins see everything, sellers see their own orders plus orders that contain
-- one of their dishes, customers see only their own orders.
create or replace function public.can_view_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
    or exists (
      select 1 from public.orders o
      where o.id = p_order_id and o.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = p_order_id and p.seller_id = auth.uid()
    );
$$;

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

-- users -------------------------------------------------------------------
drop policy if exists "Users read their own profile" on public.users;
create policy "Users read their own profile"
  on public.users for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "Users update their own profile" on public.users;
create policy "Users update their own profile"
  on public.users for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
-- (no insert/delete policy for clients: accounts are created by the server)

-- categories --------------------------------------------------------------
drop policy if exists "Categories are publicly readable" on public.categories;
create policy "Categories are publicly readable"
  on public.categories for select to anon, authenticated
  using (true);

drop policy if exists "Staff manage categories" on public.categories;
create policy "Staff manage categories"
  on public.categories for all to authenticated
  using (public.is_seller())
  with check (public.is_seller());

-- products ----------------------------------------------------------------
drop policy if exists "Products are publicly readable" on public.products;
create policy "Products are publicly readable"
  on public.products for select to anon, authenticated
  using (true);

-- sellers may only touch dishes they own; admins may touch any dish
drop policy if exists "Staff manage products" on public.products;
create policy "Staff manage products"
  on public.products for all to authenticated
  using (public.is_seller())
  with check (public.is_seller() and (public.is_admin() or seller_id = auth.uid()));

-- orders ------------------------------------------------------------------
drop policy if exists "Orders are visible to their owner and staff" on public.orders;
create policy "Orders are visible to their owner and staff"
  on public.orders for select to authenticated
  using (public.can_view_order(id));

drop policy if exists "Orders are created by their owner" on public.orders;
create policy "Orders are created by their owner"
  on public.orders for insert to authenticated
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "Orders are updated by staff" on public.orders;
create policy "Orders are updated by staff"
  on public.orders for update to authenticated
  using (public.can_view_order(id))
  with check (public.can_view_order(id));

-- order items -------------------------------------------------------------
drop policy if exists "Order items follow their order" on public.order_items;
create policy "Order items follow their order"
  on public.order_items for select to authenticated
  using (public.can_view_order(order_id));

drop policy if exists "Order items are written with their order" on public.order_items;
create policy "Order items are written with their order"
  on public.order_items for insert to authenticated
  with check (public.can_view_order(order_id));

-- payments ----------------------------------------------------------------
drop policy if exists "Payments are visible with their order" on public.payments;
create policy "Payments are visible with their order"
  on public.payments for select to authenticated
  using (public.can_view_order(order_id));

drop policy if exists "Payments are managed by admins" on public.payments;
create policy "Payments are managed by admins"
  on public.payments for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- payment events ----------------------------------------------------------
drop policy if exists "Payment events follow their order" on public.payment_events;
create policy "Payment events follow their order"
  on public.payment_events for select to authenticated
  using (public.can_view_order(order_id));

drop policy if exists "Payment events are managed by admins" on public.payment_events;
create policy "Payment events are managed by admins"
  on public.payment_events for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. Privileges (RLS only filters rows; these grant the right to try)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select on public.products, public.categories to anon, authenticated;

grant select, insert, update, delete
  on public.users, public.orders, public.order_items, public.payments, public.payment_events
  to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_seller() to anon, authenticated, service_role;
grant execute on function public.can_view_order(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Seed accounts (roles used by the authorization tests)
--    All three share the demo password `kain123`.
--    Re-hash a new password with:  node scripts/hash-password.mjs "new-password"
-- ---------------------------------------------------------------------------
insert into public.users (email, name, role, password_hash) values
  ('demo@kaintayo.ph',    'Aling Nena',      'admin',    'scrypt$16384$8$1$cX++birUPFh3TAaFE+rXcw==$cbdkfHGBqsRz3GNKS8L6XzttY4K/KHK1BOVQvibnlpu5HJGvGMyRUbLkc2c53V7PsVYFLhPhCEly2z7j3X6XuQ=='),
  ('seller@kaintayo.ph',  'Kusina ni Marco', 'seller',   'scrypt$16384$8$1$cX++birUPFh3TAaFE+rXcw==$cbdkfHGBqsRz3GNKS8L6XzttY4K/KHK1BOVQvibnlpu5HJGvGMyRUbLkc2c53V7PsVYFLhPhCEly2z7j3X6XuQ=='),
  ('customer@kaintayo.ph','Juan Dela Cruz',  'customer', 'scrypt$16384$8$1$cX++birUPFh3TAaFE+rXcw==$cbdkfHGBqsRz3GNKS8L6XzttY4K/KHK1BOVQvibnlpu5HJGvGMyRUbLkc2c53V7PsVYFLhPhCEly2z7j3X6XuQ==')
on conflict (email) do nothing;

-- ============================================================================
-- Verification checklist (run these after pressing Run):
--
--   select table_name, row_security from information_schema.tables
--    where table_schema = 'public' order by table_name;
--     -- every row must say 'YES'
--
--   select email, role from public.users order by role;
--     -- admin / seller / customer rows present
--
--   select count(*) from pg_policies where schemaname = 'public';
--     -- 15 policies (users 2, categories 2, products 2, orders 3,
--     --              order_items 2, payments 2, payment_events 2)
-- ============================================================================

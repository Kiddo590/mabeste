-- Mabeste POS — V1 schema, triggers, RLS
-- See plan: client-generated UUID PKs on fact tables (tabs/orders/order_items/payments/
-- stock_movements) make every offline-queued write idempotent on replay via
-- upsert(..., { onConflict: 'id' }).

create extension if not exists pgcrypto with schema extensions;

-- =========================================================================
-- Tables
-- =========================================================================

create table staff (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id),
  name         text not null,
  phone        text unique,
  pin_hash     text not null,
  role         text not null check (role in ('admin', 'cashier')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order integer not null default 0
);

create table products (
  id                  uuid primary key default gen_random_uuid(),
  category_id         uuid references categories(id),
  name                text not null,
  price               numeric(10, 2) not null check (price >= 0),
  sku                 text,
  stock_qty           integer not null default 0,
  track_stock         boolean not null default true,
  low_stock_threshold integer not null default 5,
  is_active           boolean not null default true,
  image_url           text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table tables (
  id        uuid primary key default gen_random_uuid(),
  label     text not null,
  is_active boolean not null default true
);

create table tabs (
  id                 uuid primary key, -- client-generated
  table_id           uuid references tables(id),
  label              text,
  customer_phone     text,
  status             text not null check (status in ('open', 'pending_payment', 'closed', 'merged', 'voided')),
  merged_into_tab_id uuid references tabs(id),
  opened_by          uuid not null references staff(id),
  opened_at          timestamptz not null default now(),
  closed_by          uuid references staff(id),
  closed_at          timestamptz,
  version            integer not null default 1,
  constraint tabs_label_or_table check (table_id is not null or label is not null)
);

create table orders (
  id         uuid primary key, -- client-generated
  tab_id     uuid not null references tabs(id),
  created_by uuid not null references staff(id),
  status     text not null check (status in ('open', 'void')),
  created_at timestamptz not null default now()
);

create table order_items (
  id          uuid primary key, -- client-generated
  order_id    uuid not null references orders(id),
  product_id  uuid not null references products(id),
  quantity    integer not null check (quantity > 0),
  unit_price  numeric(10, 2) not null check (unit_price >= 0), -- price snapshot at sale time
  line_status text not null check (line_status in ('active', 'voided')),
  created_at  timestamptz not null default now()
);

create table payments (
  id                         uuid primary key, -- client-generated
  tab_id                     uuid not null references tabs(id),
  method                     text not null check (method in ('cash', 'mpesa')),
  amount                     numeric(10, 2) not null check (amount > 0),
  status                     text not null check (status in ('pending', 'completed', 'failed')),
  mpesa_checkout_request_id  text unique,
  mpesa_receipt_number       text,
  recorded_by                uuid references staff(id), -- null for mpesa-callback writes
  created_at                 timestamptz not null default now(),
  completed_at               timestamptz
);

create table stock_movements (
  id            uuid primary key, -- client-generated
  product_id    uuid not null references products(id),
  change_qty    integer not null, -- negative = decrement
  reason        text not null check (reason in ('sale', 'restock', 'adjustment', 'void_return')),
  order_item_id uuid references order_items(id),
  staff_id      uuid not null references staff(id),
  created_at    timestamptz not null default now(),
  constraint stock_movements_sale_has_order_item
    check (reason != 'sale' or order_item_id is not null)
);

-- Idempotent decrement: at most one 'sale' movement per order_item, so replaying
-- a queued insert on reconnect can never double-decrement stock.
create unique index stock_movements_sale_unique
  on stock_movements(order_item_id) where reason = 'sale';

create index tabs_status_idx on tabs(status);
create index orders_tab_id_idx on orders(tab_id);
create index order_items_order_id_idx on order_items(order_id);
create index order_items_product_id_idx on order_items(product_id);
create index payments_tab_id_idx on payments(tab_id);
create index stock_movements_product_id_idx on stock_movements(product_id);

-- =========================================================================
-- tab_totals view — balance computed on read, not a denormalized column
-- (a stored total fed from two insert paths — items and payments — is
-- exactly what drifts under offline replay).
-- =========================================================================

create view tab_totals as
select
  t.id as tab_id,
  coalesce(sum(oi.quantity * oi.unit_price) filter (where oi.line_status = 'active'), 0) as items_total,
  coalesce((
    select sum(p.amount) from payments p
    where p.tab_id = t.id and p.status = 'completed'
  ), 0) as paid_total,
  coalesce(sum(oi.quantity * oi.unit_price) filter (where oi.line_status = 'active'), 0)
    - coalesce((
      select sum(p.amount) from payments p
      where p.tab_id = t.id and p.status = 'completed'
    ), 0) as balance
from tabs t
left join orders o on o.tab_id = t.id and o.status = 'open'
left join order_items oi on oi.order_id = o.id
group by t.id;

-- =========================================================================
-- Triggers
-- =========================================================================

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_products_updated_at
  before update on products
  for each row execute function set_updated_at();

-- stock_movements insert -> atomically update products.stock_qty
create or replace function apply_stock_movement() returns trigger as $$
begin
  update products
    set stock_qty = stock_qty + new.change_qty
    where id = new.product_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_stock_movements_apply
  after insert on stock_movements
  for each row execute function apply_stock_movement();

-- tabs update -> bump optimistic-concurrency version
create or replace function bump_tab_version() returns trigger as $$
begin
  new.version = old.version + 1;
  return new;
end;
$$ language plpgsql;

create trigger trg_tabs_bump_version
  before update on tabs
  for each row execute function bump_tab_version();

-- payments -> completed -> recompute balance, auto-close the tab.
-- Shared by both the cash path and the mpesa-callback path, so there's one
-- source of truth for "is this tab paid".
create or replace function handle_payment_completed() returns trigger as $$
declare
  v_balance numeric(10, 2);
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select balance into v_balance from tab_totals where tab_id = new.tab_id;

    if v_balance is not null and v_balance <= 0 then
      update tabs
        set status = 'closed', closed_at = now()
        where id = new.tab_id and status not in ('closed', 'voided', 'merged');
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_payments_completed
  after update on payments
  for each row execute function handle_payment_completed();

-- =========================================================================
-- update_tab_status RPC — the one place concurrent devices need a real
-- guard (double-close / double-pay). A version mismatch raises so the
-- client's sync engine can mark that outbox entry 'conflict' (not 'failed')
-- and surface it for a human to resolve rather than auto-merging it.
-- =========================================================================

create or replace function update_tab_status(
  p_tab_id uuid,
  p_expected_version integer,
  p_new_status text,
  p_closed_by uuid default null
) returns tabs as $$
declare
  v_tab tabs;
begin
  update tabs
    set status = p_new_status,
        closed_by = coalesce(p_closed_by, closed_by)
    where id = p_tab_id and version = p_expected_version
    returning * into v_tab;

  if v_tab.id is null then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  return v_tab;
end;
$$ language plpgsql security definer;

-- =========================================================================
-- RLS — current_staff_id()/current_staff_role() read straight off the
-- custom JWT's app_metadata claims (see supabase/functions/staff-login),
-- no extra table lookup per policy check.
-- =========================================================================

create or replace function current_staff_id() returns uuid
language sql stable as $$
  select (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid;
$$;

create or replace function current_staff_role() returns text
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'staff_role', '');
$$;

alter table staff enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table tables enable row level security;
alter table tabs enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table stock_movements enable row level security;

-- staff: admins see/manage all; cashiers see only their own row.
create policy staff_select on staff for select
  using (id = current_staff_id() or current_staff_role() = 'admin');
create policy staff_admin_insert on staff for insert
  with check (current_staff_role() = 'admin');
create policy staff_admin_update on staff for update
  using (current_staff_role() = 'admin');

-- categories / products / tables: any staff reads; only admin writes.
create policy categories_select on categories for select
  using (current_staff_role() in ('admin', 'cashier'));
create policy categories_admin_insert on categories for insert
  with check (current_staff_role() = 'admin');
create policy categories_admin_update on categories for update
  using (current_staff_role() = 'admin');

create policy products_select on products for select
  using (current_staff_role() in ('admin', 'cashier'));
create policy products_admin_insert on products for insert
  with check (current_staff_role() = 'admin');
create policy products_admin_update on products for update
  using (current_staff_role() = 'admin');

create policy tables_select on tables for select
  using (current_staff_role() in ('admin', 'cashier'));
create policy tables_admin_insert on tables for insert
  with check (current_staff_role() = 'admin');
create policy tables_admin_update on tables for update
  using (current_staff_role() = 'admin');

-- tabs/orders/order_items/payments/stock_movements: any staff can read and
-- insert (append-only facts); update restricted to the row's owner or admin.
create policy tabs_select on tabs for select
  using (current_staff_role() in ('admin', 'cashier'));
create policy tabs_insert on tabs for insert
  with check (current_staff_role() in ('admin', 'cashier'));
create policy tabs_update on tabs for update
  using (opened_by = current_staff_id() or current_staff_role() = 'admin');

create policy orders_select on orders for select
  using (current_staff_role() in ('admin', 'cashier'));
create policy orders_insert on orders for insert
  with check (current_staff_role() in ('admin', 'cashier'));
create policy orders_update on orders for update
  using (created_by = current_staff_id() or current_staff_role() = 'admin');

create policy order_items_select on order_items for select
  using (current_staff_role() in ('admin', 'cashier'));
create policy order_items_insert on order_items for insert
  with check (current_staff_role() in ('admin', 'cashier'));
create policy order_items_update on order_items for update
  using (
    current_staff_role() = 'admin'
    or exists (
      select 1 from orders o
      where o.id = order_items.order_id and o.created_by = current_staff_id()
    )
  );

create policy payments_select on payments for select
  using (current_staff_role() in ('admin', 'cashier'));
create policy payments_insert on payments for insert
  with check (current_staff_role() in ('admin', 'cashier'));
create policy payments_update on payments for update
  using (recorded_by = current_staff_id() or current_staff_role() = 'admin');

create policy stock_movements_select on stock_movements for select
  using (current_staff_role() in ('admin', 'cashier'));
create policy stock_movements_insert on stock_movements for insert
  with check (current_staff_role() in ('admin', 'cashier'));
-- No update policy: stock_movements is an append-only audit trail by design.

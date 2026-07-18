-- KL Chicken Wings POS - initial operational schema
-- Generated with Supabase CLI. All public tables have RLS and explicit grants.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum (
  'owner_admin',
  'manager',
  'cashier',
  'kitchen',
  'rider'
);

create type public.order_channel as enum (
  'dine_in',
  'takeout',
  'store_delivery',
  'grabfood'
);

create type public.order_status as enum (
  'draft',
  'confirmed',
  'accepted',
  'preparing',
  'ready',
  'ready_for_dispatch',
  'out_for_delivery',
  'served',
  'released',
  'picked_up',
  'delivered',
  'cancelled',
  'failed',
  'returned',
  'completed'
);

create type public.shift_status as enum ('open', 'closed', 'reviewed');

create type public.payment_method as enum (
  'cash',
  'gcash',
  'maya',
  'card',
  'split',
  'grabfood_prepaid',
  'store_delivery_prepaid',
  'store_delivery_cod'
);

create type public.payment_status as enum (
  'pending',
  'paid',
  'partially_refunded',
  'refunded',
  'voided'
);

create type public.inventory_movement_type as enum (
  'receiving',
  'sale',
  'return',
  'wastage',
  'staff_meal',
  'count_adjustment'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) >= 2),
  role public.app_role not null default 'cashier',
  permissions text[] not null default '{}',
  employee_code text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text,
  timezone text not null default 'Asia/Manila',
  currency_code text not null default 'PHP' check (currency_code ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.terminals (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  name text not null,
  code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, code)
);

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  display_order integer not null default 0 check (display_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid not null references public.menu_categories(id) on delete restrict,
  sku text,
  name text not null,
  description text,
  base_price numeric(12,2) not null check (base_price >= 0),
  requires_flavor boolean not null default false,
  is_available boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, sku)
);

create table public.product_channel_prices (
  product_id uuid not null references public.products(id) on delete cascade,
  channel public.order_channel not null,
  price numeric(12,2) not null check (price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, channel)
);

create table public.modifiers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  modifier_type text not null check (modifier_type in ('flavor', 'size', 'add_on', 'dip', 'other')),
  name text not null,
  price_delta numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, modifier_type, name)
);

create table public.product_modifiers (
  product_id uuid not null references public.products(id) on delete cascade,
  modifier_id uuid not null references public.modifiers(id) on delete cascade,
  is_required boolean not null default false,
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer not null default 1 check (max_select >= min_select),
  primary key (product_id, modifier_id)
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  terminal_id uuid not null references public.terminals(id) on delete restrict,
  cashier_id uuid not null references public.profiles(id) on delete restrict,
  status public.shift_status not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash numeric(12,2) not null default 0 check (opening_cash >= 0),
  expected_cash numeric(12,2),
  actual_cash numeric(12,2),
  variance numeric(12,2),
  closing_notes text,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'open' and closed_at is null) or (status <> 'open' and closed_at is not null))
);

create unique index shifts_one_open_per_terminal_idx
  on public.shifts (terminal_id)
  where status = 'open';

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  store_id uuid not null references public.stores(id) on delete restrict,
  shift_id uuid references public.shifts(id) on delete restrict,
  cashier_id uuid not null references public.profiles(id) on delete restrict,
  assigned_rider_id uuid references public.profiles(id) on delete restrict,
  channel public.order_channel not null,
  status public.order_status not null default 'draft',
  table_number text,
  customer_name text,
  customer_mobile text,
  special_instructions text,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  approved_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_total <= subtotal),
  check (total = subtotal - discount_total + delivery_fee),
  check (channel = 'dine_in' or table_number is null),
  check (assigned_rider_id is null or channel = 'store_delivery')
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  product_name text not null,
  sku text,
  quantity numeric(10,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  notes text,
  created_at timestamptz not null default now(),
  check (line_total = round(quantity * unit_price, 2))
);

create table public.order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  modifier_id uuid references public.modifiers(id) on delete restrict,
  modifier_name text not null,
  price_delta numeric(12,2) not null default 0,
  quantity numeric(10,3) not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  method public.payment_method not null,
  status public.payment_status not null default 'pending',
  amount numeric(12,2) not null check (amount > 0),
  tendered_amount numeric(12,2),
  change_amount numeric(12,2),
  external_reference text,
  received_by uuid references public.profiles(id) on delete restrict,
  paid_at timestamptz,
  refunded_amount numeric(12,2) not null default 0 check (refunded_amount >= 0 and refunded_amount <= amount),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tendered_amount is null or tendered_amount >= amount),
  check (change_amount is null or change_amount >= 0)
);

create table public.grabfood_details (
  order_id uuid primary key references public.orders(id) on delete restrict,
  grab_reference text not null unique,
  gross_amount numeric(12,2) not null check (gross_amount >= 0),
  commission_amount numeric(12,2) not null default 0 check (commission_amount >= 0),
  other_deductions numeric(12,2) not null default 0 check (other_deductions >= 0),
  net_receivable numeric(12,2) generated always as (gross_amount - commission_amount - other_deductions) stored,
  settlement_reference text,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (commission_amount + other_deductions <= gross_amount)
);

create table public.store_delivery_details (
  order_id uuid primary key references public.orders(id) on delete restrict,
  address_line text not null,
  barangay text,
  landmark text,
  delivery_instructions text,
  delivery_zone text,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  delivery_confirmation text,
  cod_amount numeric(12,2) not null default 0 check (cod_amount >= 0),
  cod_remitted_amount numeric(12,2) not null default 0 check (cod_remitted_amount >= 0 and cod_remitted_amount <= cod_amount),
  cod_remitted_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  from_status public.order_status,
  to_status public.order_status not null,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  reason text,
  changed_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  sku text,
  name text not null,
  unit text not null,
  quantity_on_hand numeric(14,3) not null default 0,
  reorder_level numeric(14,3) not null default 0 check (reorder_level >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, sku)
);

create table public.product_recipes (
  product_id uuid not null references public.products(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity_required numeric(14,3) not null check (quantity_required > 0),
  primary key (product_id, inventory_item_id)
);

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  movement_type public.inventory_movement_type not null,
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  store_id uuid references public.stores(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Foreign-key and access-pattern indexes.
create index terminals_store_id_idx on public.terminals (store_id);
create index menu_categories_store_active_idx on public.menu_categories (store_id, display_order) where is_active;
create index products_store_category_idx on public.products (store_id, category_id);
create index products_active_category_idx on public.products (category_id, name) where is_active;
create index products_sku_idx on public.products (store_id, sku) where sku is not null;
create index modifiers_store_type_idx on public.modifiers (store_id, modifier_type) where is_active;
create index product_modifiers_modifier_id_idx on public.product_modifiers (modifier_id);
create index shifts_store_opened_idx on public.shifts (store_id, opened_at desc);
create index shifts_cashier_id_idx on public.shifts (cashier_id);
create index shifts_reviewed_by_idx on public.shifts (reviewed_by) where reviewed_by is not null;
create index orders_store_created_idx on public.orders (store_id, created_at desc);
create index orders_store_status_created_idx on public.orders (store_id, status, created_at desc);
create index orders_cashier_id_idx on public.orders (cashier_id);
create index orders_shift_id_idx on public.orders (shift_id) where shift_id is not null;
create index orders_assigned_rider_idx on public.orders (assigned_rider_id, status) where assigned_rider_id is not null;
create index orders_active_queue_idx on public.orders (channel, created_at)
  where status in ('confirmed', 'accepted', 'preparing', 'ready', 'ready_for_dispatch', 'out_for_delivery');
create index orders_approved_by_idx on public.orders (approved_by) where approved_by is not null;
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id) where product_id is not null;
create index order_item_modifiers_item_id_idx on public.order_item_modifiers (order_item_id);
create index order_item_modifiers_modifier_id_idx on public.order_item_modifiers (modifier_id) where modifier_id is not null;
create index payments_order_id_idx on public.payments (order_id);
create index payments_received_by_idx on public.payments (received_by) where received_by is not null;
create index payments_pending_idx on public.payments (created_at) where status = 'pending';
create index order_status_history_order_changed_idx on public.order_status_history (order_id, changed_at);
create index order_status_history_changed_by_idx on public.order_status_history (changed_by);
create index inventory_items_store_active_idx on public.inventory_items (store_id, name) where is_active;
create index product_recipes_inventory_item_idx on public.product_recipes (inventory_item_id);
create index inventory_movements_store_created_idx on public.inventory_movements (store_id, created_at desc);
create index inventory_movements_item_created_idx on public.inventory_movements (inventory_item_id, created_at desc);
create index inventory_movements_order_id_idx on public.inventory_movements (order_id) where order_id is not null;
create index inventory_movements_created_by_idx on public.inventory_movements (created_by);
create index audit_logs_store_created_idx on public.audit_logs (store_id, created_at desc);
create index audit_logs_actor_id_idx on public.audit_logs (actor_id) where actor_id is not null;
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id) where entity_id is not null;

-- Timestamp maintenance remains private and cannot be called as a public API function.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger stores_set_updated_at before update on public.stores for each row execute function private.set_updated_at();
create trigger menu_categories_set_updated_at before update on public.menu_categories for each row execute function private.set_updated_at();
create trigger products_set_updated_at before update on public.products for each row execute function private.set_updated_at();
create trigger product_channel_prices_set_updated_at before update on public.product_channel_prices for each row execute function private.set_updated_at();
create trigger modifiers_set_updated_at before update on public.modifiers for each row execute function private.set_updated_at();
create trigger shifts_set_updated_at before update on public.shifts for each row execute function private.set_updated_at();
create trigger orders_set_updated_at before update on public.orders for each row execute function private.set_updated_at();
create trigger payments_set_updated_at before update on public.payments for each row execute function private.set_updated_at();
create trigger grabfood_details_set_updated_at before update on public.grabfood_details for each row execute function private.set_updated_at();
create trigger store_delivery_details_set_updated_at before update on public.store_delivery_details for each row execute function private.set_updated_at();
create trigger inventory_items_set_updated_at before update on public.inventory_items for each row execute function private.set_updated_at();

-- Authorization helpers perform only internal lookups and always bind to auth.uid().
create or replace function private.has_role(allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and is_active
        and role = any(allowed_roles)
    );
$$;

create or replace function private.can_access_order(target_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.orders o
      join public.profiles p on p.id = (select auth.uid()) and p.is_active
      where o.id = target_order_id
        and (
          p.role in ('owner_admin', 'manager', 'kitchen')
          or o.cashier_id = (select auth.uid())
          or o.assigned_rider_id = (select auth.uid())
        )
    );
$$;

create or replace function private.can_access_financials(target_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.orders o
      join public.profiles p on p.id = (select auth.uid()) and p.is_active
      where o.id = target_order_id
        and (p.role in ('owner_admin', 'manager') or o.cashier_id = (select auth.uid()))
    );
$$;

revoke execute on function private.has_role(public.app_role[]) from public, anon;
revoke execute on function private.can_access_order(uuid) from public, anon;
revoke execute on function private.can_access_financials(uuid) from public, anon;
grant execute on function private.has_role(public.app_role[]) to authenticated;
grant execute on function private.can_access_order(uuid) to authenticated;
grant execute on function private.can_access_financials(uuid) to authenticated;

-- RLS is enabled on every table in the exposed public schema.
alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.terminals enable row level security;
alter table public.menu_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_channel_prices enable row level security;
alter table public.modifiers enable row level security;
alter table public.product_modifiers enable row level security;
alter table public.shifts enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_modifiers enable row level security;
alter table public.payments enable row level security;
alter table public.grabfood_details enable row level security;
alter table public.store_delivery_details enable row level security;
alter table public.order_status_history enable row level security;
alter table public.inventory_items enable row level security;
alter table public.product_recipes enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.audit_logs enable row level security;

-- Explicit grants support Supabase projects where Data API exposure is opt-in.
grant usage on schema public to authenticated;
grant select on public.profiles, public.stores, public.terminals,
  public.menu_categories, public.products, public.product_channel_prices,
  public.modifiers, public.product_modifiers, public.shifts, public.orders,
  public.order_items, public.order_item_modifiers, public.payments,
  public.grabfood_details, public.store_delivery_details,
  public.order_status_history, public.inventory_items, public.product_recipes,
  public.inventory_movements, public.audit_logs to authenticated;

-- No anon table grants. Mutations are intentionally withheld until guarded API
-- commands and transaction functions are introduced in later migrations.

create policy profiles_read_self
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy stores_read_active
  on public.stores for select to authenticated
  using (is_active);

create policy terminals_read_active
  on public.terminals for select to authenticated
  using (is_active);

create policy menu_categories_read_active
  on public.menu_categories for select to authenticated
  using (is_active);

create policy products_read_active
  on public.products for select to authenticated
  using (is_active);

create policy product_channel_prices_read
  on public.product_channel_prices for select to authenticated
  using (true);

create policy modifiers_read_active
  on public.modifiers for select to authenticated
  using (is_active);

create policy product_modifiers_read
  on public.product_modifiers for select to authenticated
  using (true);

create policy shifts_read_authorized
  on public.shifts for select to authenticated
  using (
    cashier_id = (select auth.uid())
    or (select private.has_role(array['owner_admin', 'manager']::public.app_role[]))
  );

create policy orders_read_authorized
  on public.orders for select to authenticated
  using (
    cashier_id = (select auth.uid())
    or assigned_rider_id = (select auth.uid())
    or (select private.has_role(array['owner_admin', 'manager', 'kitchen']::public.app_role[]))
  );

create policy order_items_read_authorized
  on public.order_items for select to authenticated
  using ((select private.can_access_order(order_id)));

create policy order_item_modifiers_read_authorized
  on public.order_item_modifiers for select to authenticated
  using (
    exists (
      select 1 from public.order_items oi
      where oi.id = order_item_id
        and (select private.can_access_order(oi.order_id))
    )
  );

create policy payments_read_authorized
  on public.payments for select to authenticated
  using ((select private.can_access_financials(order_id)));

create policy grabfood_details_read_authorized
  on public.grabfood_details for select to authenticated
  using ((select private.can_access_financials(order_id)));

create policy store_delivery_details_read_authorized
  on public.store_delivery_details for select to authenticated
  using ((select private.can_access_order(order_id)));

create policy order_status_history_read_authorized
  on public.order_status_history for select to authenticated
  using ((select private.can_access_order(order_id)));

create policy inventory_items_read_authorized
  on public.inventory_items for select to authenticated
  using ((select private.has_role(array['owner_admin', 'manager', 'kitchen']::public.app_role[])));

create policy product_recipes_read_authorized
  on public.product_recipes for select to authenticated
  using ((select private.has_role(array['owner_admin', 'manager', 'kitchen']::public.app_role[])));

create policy inventory_movements_read_authorized
  on public.inventory_movements for select to authenticated
  using ((select private.has_role(array['owner_admin', 'manager']::public.app_role[])));

create policy audit_logs_read_authorized
  on public.audit_logs for select to authenticated
  using ((select private.has_role(array['owner_admin', 'manager']::public.app_role[])));

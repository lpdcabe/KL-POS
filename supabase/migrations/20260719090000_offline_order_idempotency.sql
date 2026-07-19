alter table public.orders
  add column if not exists client_order_id uuid;

create unique index if not exists orders_cashier_client_order_uidx
  on public.orders (cashier_id, client_order_id)
  where client_order_id is not null;

comment on column public.orders.client_order_id is
  'Client-generated idempotency key used when a POS order is synchronized after an offline checkout.';

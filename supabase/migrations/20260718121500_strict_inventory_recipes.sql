-- Strict recipe configuration and inventory consumption for confirmed orders.

create unique index if not exists inventory_sale_once_per_order_item_idx
  on public.inventory_movements (order_id, inventory_item_id)
  where movement_type = 'sale';

create or replace function public.replace_product_recipe(
  target_product_id uuid,
  components jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_store_id uuid;
begin
  select store_id into target_store_id
  from public.products
  where id = target_product_id and is_active
  for update;

  if target_store_id is null then
    raise exception 'Product not found.';
  end if;

  if jsonb_typeof(components) <> 'array' or jsonb_array_length(components) = 0 then
    raise exception 'At least one recipe ingredient is required.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(components) as component(inventory_item_id uuid, quantity_required numeric)
    left join public.inventory_items item on item.id = component.inventory_item_id
    where item.id is null
      or item.store_id <> target_store_id
      or not item.is_active
      or component.quantity_required is null
      or component.quantity_required <= 0
  ) then
    raise exception 'Every recipe ingredient must be active, belong to this store, and have a positive quantity.';
  end if;

  if exists (
    select inventory_item_id
    from jsonb_to_recordset(components) as component(inventory_item_id uuid, quantity_required numeric)
    group by inventory_item_id
    having count(*) > 1
  ) then
    raise exception 'A recipe cannot contain the same ingredient twice.';
  end if;

  delete from public.product_recipes where product_id = target_product_id;
  insert into public.product_recipes (product_id, inventory_item_id, quantity_required)
  select target_product_id, inventory_item_id, quantity_required
  from jsonb_to_recordset(components) as component(inventory_item_id uuid, quantity_required numeric);
end;
$$;

create or replace function public.deduct_order_inventory(
  target_order_id uuid,
  inventory_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_store_id uuid;
  missing_product text;
  stock_error text;
  requirement record;
  movement_count integer := 0;
begin
  select store_id into target_store_id
  from public.orders
  where id = target_order_id
    and status not in ('cancelled', 'failed', 'returned')
  for update;

  if target_store_id is null then
    raise exception 'Order is unavailable for inventory deduction.';
  end if;

  if exists (
    select 1 from public.inventory_movements
    where order_id = target_order_id and movement_type = 'sale'
  ) then
    return jsonb_build_object('deducted', false, 'already_deducted', true);
  end if;

  select oi.product_name into missing_product
  from public.order_items oi
  left join public.product_recipes recipe on recipe.product_id = oi.product_id
  where oi.order_id = target_order_id
  group by oi.id, oi.product_id, oi.product_name
  having oi.product_id is null or count(recipe.inventory_item_id) = 0
  limit 1;

  if missing_product is not null then
    raise exception 'Recipe required for "%" before it can be sold.', missing_product;
  end if;

  perform item.id
  from public.inventory_items item
  where item.id in (
    select recipe.inventory_item_id
    from public.order_items oi
    join public.product_recipes recipe on recipe.product_id = oi.product_id
    where oi.order_id = target_order_id
  )
  order by item.id
  for update;

  with required as (
    select recipe.inventory_item_id, sum(oi.quantity * recipe.quantity_required) as quantity
    from public.order_items oi
    join public.product_recipes recipe on recipe.product_id = oi.product_id
    where oi.order_id = target_order_id
    group by recipe.inventory_item_id
  )
  select format(
    '%s requires %s %s, but only %s %s is available.',
    item.name, required.quantity, item.unit, item.quantity_on_hand, item.unit
  ) into stock_error
  from required
  join public.inventory_items item on item.id = required.inventory_item_id
  where item.store_id <> target_store_id
    or not item.is_active
    or item.quantity_on_hand < required.quantity
  limit 1;

  if stock_error is not null then
    raise exception '%', stock_error;
  end if;

  for requirement in
    select recipe.inventory_item_id, sum(oi.quantity * recipe.quantity_required) as quantity
    from public.order_items oi
    join public.product_recipes recipe on recipe.product_id = oi.product_id
    where oi.order_id = target_order_id
    group by recipe.inventory_item_id
  loop
    update public.inventory_items
    set quantity_on_hand = quantity_on_hand - requirement.quantity
    where id = requirement.inventory_item_id;

    insert into public.inventory_movements (
      store_id, inventory_item_id, order_id, movement_type,
      quantity_delta, reason, created_by
    ) values (
      target_store_id, requirement.inventory_item_id, target_order_id, 'sale',
      -requirement.quantity, 'Automatic deduction for confirmed order', inventory_actor_id
    );
    movement_count := movement_count + 1;
  end loop;

  return jsonb_build_object('deducted', true, 'movement_count', movement_count);
end;
$$;

revoke execute on function public.replace_product_recipe(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.deduct_order_inventory(uuid, uuid) from public, anon, authenticated;
grant execute on function public.replace_product_recipe(uuid, jsonb) to service_role;
grant execute on function public.deduct_order_inventory(uuid, uuid) to service_role;


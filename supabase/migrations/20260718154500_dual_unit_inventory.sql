-- Track inventory in a strict primary unit while displaying a converted secondary unit.

alter table public.inventory_items
  add column secondary_unit text,
  add column secondary_quantity_per_primary numeric(14,6)
    check (secondary_quantity_per_primary is null or secondary_quantity_per_primary > 0),
  add column secondary_quantity_on_hand numeric(18,6)
    generated always as (
      case
        when secondary_unit is null or secondary_quantity_per_primary is null then null
        else quantity_on_hand * secondary_quantity_per_primary
      end
    ) stored,
  add constraint inventory_secondary_unit_complete check (
    (secondary_unit is null and secondary_quantity_per_primary is null)
    or
    (secondary_unit is not null and secondary_quantity_per_primary is not null and lower(secondary_unit) <> lower(unit))
  ),
  add constraint inventory_piece_quantities_are_whole check (
    lower(unit) not in ('pc', 'pcs', 'piece', 'pieces')
    or (quantity_on_hand = trunc(quantity_on_hand) and reorder_level = trunc(reorder_level))
  );

create or replace function private.enforce_whole_piece_recipe()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  inventory_unit text;
begin
  select unit into inventory_unit
  from public.inventory_items
  where id = new.inventory_item_id;

  if lower(inventory_unit) in ('pc', 'pcs', 'piece', 'pieces')
    and new.quantity_required <> trunc(new.quantity_required) then
    raise exception 'Piece-based recipe quantities must be whole numbers.';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_whole_piece_recipe() from public, anon, authenticated;

create trigger product_recipes_enforce_whole_pieces
before insert or update on public.product_recipes
for each row execute function private.enforce_whole_piece_recipe();


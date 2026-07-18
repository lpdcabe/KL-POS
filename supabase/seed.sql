-- Development seed template.
-- Create Auth users in the Supabase dashboard first, then insert matching
-- profile rows with their real auth.users UUID values. Do not commit credentials.

insert into public.stores (name, code, address)
values ('KL Chicken Wings - Angeles City', 'KLCW-AC', 'Angeles City, Pampanga')
on conflict (code) do nothing;

insert into public.menu_categories (store_id, name, display_order)
select id, category.name, category.display_order
from public.stores
cross join (
  values
    ('Wings', 10),
    ('Combos', 20),
    ('Sides', 30),
    ('Drinks', 40),
    ('Add-ons', 50)
) as category(name, display_order)
where stores.code = 'KLCW-AC'
on conflict (store_id, name) do nothing;

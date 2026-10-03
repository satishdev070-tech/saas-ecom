-- DEV ONLY. Removes exact duplicates created by running the old seed.sql twice
-- (menu items, FAQs, reviews, shipping rates).
-- inventory_movements is append-only by design (audit ledger), so duplicate "initial stock" history rows
-- are left in place. Current stock is correct: inventory_levels was set to absolute values by the seed.
-- Keeps one copy of each duplicated row. Safe to run more than once.
begin;

delete from public.menu_items a using public.menu_items b
 where a.menu_id = b.menu_id and a.title = b.title and a.position = b.position
   and a.id > b.id;

delete from public.faqs a using public.faqs b
 where a.tenant_id = b.tenant_id and a.question = b.question
   and a.id > b.id;

delete from public.reviews a using public.reviews b
 where a.product_id = b.product_id and a.title = b.title and a.author_name = b.author_name
   and a.id > b.id;

delete from public.shipping_rates a using public.shipping_rates b
 where a.tenant_id = b.tenant_id and a.name = b.name
   and a.id > b.id;

commit;

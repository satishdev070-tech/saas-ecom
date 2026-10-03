-- =============================================================================
-- LOCAL / DEV SEED. Never run against production.
-- Users (password for all: Paliya@12345):
--   owner@aangan.test      owner of "Aangan Jaipur"   (aangan.localhost)
--   staff@aangan.test      staff of "Aangan Jaipur"
--   owner@rangrez.test     owner of "Rangrez Studio"  (rangrez.localhost)
--   shopper@example.test   customer of Aangan
--   admin@paliya.test      platform super_admin
-- =============================================================================

do $$
declare
  u record;
begin
  for u in select * from (values
    ('00000000-0000-4000-a000-000000000001'::uuid, 'owner@aangan.test', 'Asha Mehta'),
    ('00000000-0000-4000-a000-000000000002'::uuid, 'staff@aangan.test', 'Ravi Kumar'),
    ('00000000-0000-4000-a000-000000000003'::uuid, 'owner@rangrez.test', 'Farah Khan'),
    ('00000000-0000-4000-a000-000000000004'::uuid, 'shopper@example.test', 'Neha Sharma'),
    ('00000000-0000-4000-a000-000000000005'::uuid, 'admin@paliya.test', 'Platform Admin')
  ) as t(id, email, name)
  loop
    -- Token columns must be '' (not NULL) or GoTrue sign-in fails with "Database error querying schema".
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
            extensions.crypt('Paliya@12345', extensions.gen_salt('bf')), now(), '', '', '', '',
            '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', u.name), now(), now())
    on conflict (id) do nothing;
    -- Real Supabase needs an identity row for email/password sign-in.
    if to_regclass('auth.identities') is not null then
      execute 'insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
               values (gen_random_uuid(), $1, $1::text, ''email'', jsonb_build_object(''sub'', $1::text, ''email'', $2), now(), now(), now())
               on conflict do nothing' using u.id, u.email;
    end if;
  end loop;
end $$;

insert into public.platform_memberships (user_id, role) values ('00000000-0000-4000-a000-000000000005', 'super_admin') on conflict do nothing;

-- Tenants ----------------------------------------------------------------------
insert into public.tenants (id, name, slug, status, plan_id, trial_ends_at, created_by)
select '10000000-0000-4000-a000-00000000000a'::uuid, 'Aangan Jaipur', 'aangan', 'active', (select id from public.plans where code = 'growth'), null::timestamptz, '00000000-0000-4000-a000-000000000001'::uuid
union all
select '10000000-0000-4000-a000-00000000000b'::uuid, 'Rangrez Studio', 'rangrez', 'trial', (select id from public.plans where code = 'starter'), now() + interval '14 days', '00000000-0000-4000-a000-000000000003'::uuid
on conflict do nothing;

insert into public.stores (tenant_id, name, tagline, email, phone, address, social, gstin, legal_name, seo) values
  ('10000000-0000-4000-a000-00000000000a', 'Aangan Jaipur', 'Hand block printed everyday wear from Jaipur', 'hello@aangan.test', '+919876543210',
   '{"line1": "12 Johari Bazaar", "city": "Jaipur", "state": "Rajasthan", "postal_code": "302003", "country": "IN"}',
   '{"instagram": "https://instagram.com/aangan", "facebook": "https://facebook.com/aangan"}', '08AABCU9603R1ZM', 'Aangan Textiles Pvt Ltd',
   '{"title": "Aangan Jaipur — Hand block printed kurtas, suits & sarees", "description": "Shop hand block printed cotton kurtas, suit sets, sarees and dupattas, made by artisans in Jaipur."}'),
  ('10000000-0000-4000-a000-00000000000b', 'Rangrez Studio', 'Natural dyes, modern silhouettes', 'studio@rangrez.test', '+919812345678',
   '{"city": "Ahmedabad", "state": "Gujarat", "postal_code": "380001", "country": "IN"}', '{}', null, null, '{}')
on conflict do nothing;

insert into public.domains (tenant_id, hostname, type, status, verified_at, ssl_status, is_primary) values
  ('10000000-0000-4000-a000-00000000000a', 'aangan.localhost', 'platform_subdomain', 'verified', now(), 'not_applicable', true),
  ('10000000-0000-4000-a000-00000000000b', 'rangrez.localhost', 'platform_subdomain', 'verified', now(), 'not_applicable', true)
on conflict do nothing;

insert into public.tenant_memberships (tenant_id, user_id, role) values
  ('10000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-000000000001', 'owner'),
  ('10000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-000000000002', 'staff'),
  ('10000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-000000000003', 'owner')
on conflict do nothing;

insert into public.inventory_locations (id, tenant_id, name, is_default) values
  ('20000000-0000-4000-a000-00000000000a', '10000000-0000-4000-a000-00000000000a', 'Jaipur warehouse', true),
  ('20000000-0000-4000-a000-00000000000b', '10000000-0000-4000-a000-00000000000b', 'Studio', true)
on conflict do nothing;

-- Catalog (Aangan) --------------------------------------------------------------
insert into public.size_charts (id, tenant_id, name, unit, chart) values
  ('30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-00000000000a', 'Women''s kurta', 'in',
   '{"columns": ["Size", "Bust", "Waist", "Hip", "Length"], "rows": [["XS","32","26","36","44"],["S","34","28","38","44"],["M","36","30","40","45"],["L","38","32","42","45"],["XL","40","34","44","46"],["XXL","42","36","46","46"]], "note": "Garment measurements. For a relaxed fit, choose one size up."}')
on conflict do nothing;

insert into public.categories (id, tenant_id, name, slug, position) values
  ('31000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-00000000000a', 'Kurtas', 'kurtas', 1),
  ('31000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-00000000000a', 'Suit sets', 'suit-sets', 2),
  ('31000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-00000000000a', 'Sarees', 'sarees', 3),
  ('31000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-00000000000a', 'Dupattas', 'dupattas', 4),
  ('31000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-00000000000a', 'Co-ord sets', 'co-ord-sets', 5)
on conflict do nothing;

insert into public.products (id, tenant_id, category_id, size_chart_id, title, slug, short_description, description, product_type, brand, status, featured, tags, attributes, care_instructions, shipping_info, return_info, hsn_code) values
  ('32000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-00000000000a', '31000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Indigo Dabu Straight Kurta', 'indigo-dabu-straight-kurta', 'Mud-resist dabu print on soft cotton.',
   'A straight-cut kurta in breathable cotton, hand printed with the dabu mud-resist technique and dyed in natural indigo. Three-quarter sleeves, side slits, and a round neck with a keyhole placket.',
   'kurta', 'Aangan', 'active', true, '{new,bestseller,indigo}', '{"fabric": "Cotton", "occasion": ["Casual", "Work"], "style": "Straight", "length": "Calf", "work": "Dabu print"}',
   'Hand wash separately in cold water. Dry in shade.', 'Ships in 2-3 working days.', 'Easy 7-day returns.', '6204'),
  ('32000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-00000000000a', '31000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   'Rose Sanganeri A-line Kurta', 'rose-sanganeri-a-line-kurta', 'Delicate Sanganeri florals, A-line flare.',
   'An A-line kurta with fine Sanganeri floral buttis, finished with pintucks at the yoke and lace at the hem.',
   'kurta', 'Aangan', 'active', true, '{new,floral}', '{"fabric": "Cotton", "occasion": ["Casual", "Festive"], "style": "A-line", "length": "Calf", "work": "Hand block print"}',
   'Hand wash separately in cold water.', 'Ships in 2-3 working days.', 'Easy 7-day returns.', '6204'),
  ('32000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-00000000000a', '31000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000001',
   'Mustard Bagru Suit Set with Dupatta', 'mustard-bagru-suit-set', 'Kurta, pants and mulmul dupatta.',
   'Three-piece set: straight kurta, straight pants with elasticated waist, and a mulmul dupatta, all hand printed in Bagru.',
   'suit', 'Aangan', 'active', false, '{festive,bestseller}', '{"fabric": "Cotton", "occasion": ["Festive"], "style": "Straight", "work": "Bagru print"}',
   'Dry clean recommended for the first wash.', 'Ships in 3-5 working days.', 'Easy 7-day returns.', '6204'),
  ('32000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-00000000000a', '31000000-0000-4000-a000-000000000003', null,
   'Ajrakh Mul Cotton Saree', 'ajrakh-mul-cotton-saree', 'Ajrakh-printed mul cotton with a running blouse piece.',
   'A lightweight mul cotton saree hand printed with traditional ajrakh geometry. 5.5 m saree with 0.8 m running blouse piece.',
   'saree', 'Aangan', 'active', true, '{sale}', '{"fabric": "Mul cotton", "occasion": ["Festive", "Work"], "work": "Ajrakh"}',
   'Dry clean only.', 'Ships in 2-3 working days.', 'Returns accepted if unused with tags.', '5208'),
  ('32000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-00000000000a', '31000000-0000-4000-a000-000000000004', null,
   'Kota Doria Leheriya Dupatta', 'kota-doria-leheriya-dupatta', 'Tie-dyed leheriya on sheer Kota doria.',
   'A sheer Kota doria dupatta, tie-dyed in the leheriya wave pattern with gota trim.',
   'dupatta', 'Aangan', 'active', false, '{new}', '{"fabric": "Kota doria", "occasion": ["Festive"], "work": "Leheriya"}',
   'Dry clean only.', 'Ships in 2-3 working days.', 'Non-returnable.', '6214'),
  ('32000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-00000000000a', '31000000-0000-4000-a000-000000000005', '30000000-0000-4000-a000-000000000001',
   'Sage Kalamkari Co-ord Set', 'sage-kalamkari-co-ord-set', 'Relaxed shirt and pant co-ord.',
   'A relaxed button-down shirt and straight pant in sage, printed with kalamkari motifs.',
   'co_ord_set', 'Aangan', 'draft', false, '{}', '{"fabric": "Cotton", "occasion": ["Casual"]}', null, null, null, '6204')
on conflict do nothing;

insert into public.product_options (tenant_id, product_id, position, name)
select '10000000-0000-4000-a000-00000000000a', p, 1, 'Size'
from unnest(array['32000000-0000-4000-a000-000000000001','32000000-0000-4000-a000-000000000002','32000000-0000-4000-a000-000000000003','32000000-0000-4000-a000-000000000006']::uuid[]) p
on conflict do nothing;

-- sized products: XS..XXL
insert into public.product_variants (tenant_id, product_id, sku, title, option1, price, compare_at_price, position)
select '10000000-0000-4000-a000-00000000000a', p.id, p.sku || '-' || s.size, s.size, s.size, p.price, p.cmp, s.pos
from (values
  ('32000000-0000-4000-a000-000000000001'::uuid, 'AAN-IDK', 1499.00, 1999.00),
  ('32000000-0000-4000-a000-000000000002'::uuid, 'AAN-RSK', 1699.00, null),
  ('32000000-0000-4000-a000-000000000003'::uuid, 'AAN-MBS', 3299.00, 3999.00),
  ('32000000-0000-4000-a000-000000000006'::uuid, 'AAN-SKC', 2799.00, null)
) as p(id, sku, price, cmp)
cross join (values ('XS', 1), ('S', 2), ('M', 3), ('L', 4), ('XL', 5), ('XXL', 6)) as s(size, pos)
on conflict do nothing;

insert into public.product_variants (tenant_id, product_id, sku, title, price, compare_at_price) values
  ('10000000-0000-4000-a000-00000000000a', '32000000-0000-4000-a000-000000000004', 'AAN-AJS', 'Default', 2499.00, 3499.00),
  ('10000000-0000-4000-a000-00000000000a', '32000000-0000-4000-a000-000000000005', 'AAN-KDL', 'Default', 899.00, null)
on conflict do nothing;

-- opening stock
insert into public.inventory_movements (tenant_id, location_id, variant_id, delta, available_after, reason, reference_type, note)
select v.tenant_id, '20000000-0000-4000-a000-00000000000a', v.id, q.qty, q.qty, 'initial', 'import', 'Seed'
from public.product_variants v
cross join lateral (select case when v.option1 in ('XS', 'XXL') then 2 when v.sku = 'AAN-KDL' then 25 else 8 end as qty) q
where v.tenant_id = '10000000-0000-4000-a000-00000000000a'
  and not exists (select 1 from public.inventory_movements m where m.variant_id = v.id and m.reason = 'initial');
update public.inventory_levels l set available = case when v.option1 in ('XS', 'XXL') then 2 when v.sku = 'AAN-KDL' then 25 else 8 end
from public.product_variants v where v.id = l.variant_id and v.tenant_id = '10000000-0000-4000-a000-00000000000a';

insert into public.collections (id, tenant_id, title, slug, description, type, rules, sort_order, position) values
  ('33000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-00000000000a', 'New Arrivals', 'new-arrivals', 'Fresh off the printing tables.', 'automated',
   '{"match": "all", "conditions": [{"field": "tag", "op": "eq", "value": "new"}]}', 'newest', 1),
  ('33000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-00000000000a', 'Bestsellers', 'bestsellers', 'Our most-loved pieces.', 'automated',
   '{"match": "all", "conditions": [{"field": "tag", "op": "eq", "value": "bestseller"}]}', 'best_selling', 2),
  ('33000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-00000000000a', 'Festive Edit', 'festive-edit', 'Celebration-ready prints.', 'manual',
   '{"match": "all", "conditions": []}', 'manual', 3),
  ('33000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-00000000000a', 'Sale', 'sale', 'Limited-time prices.', 'automated',
   '{"match": "all", "conditions": [{"field": "on_sale", "op": "eq", "value": true}]}', 'price_asc', 4)
on conflict do nothing;
insert into public.collection_products (tenant_id, collection_id, product_id, position) values
  ('10000000-0000-4000-a000-00000000000a', '33000000-0000-4000-a000-000000000003', '32000000-0000-4000-a000-000000000003', 1),
  ('10000000-0000-4000-a000-00000000000a', '33000000-0000-4000-a000-000000000003', '32000000-0000-4000-a000-000000000005', 2),
  ('10000000-0000-4000-a000-00000000000a', '33000000-0000-4000-a000-000000000003', '32000000-0000-4000-a000-000000000004', 3)
on conflict do nothing;

-- re-runnable: skip when Aangan already has shipping_rates
do $$ begin
  if not exists (select 1 from public.shipping_rates where tenant_id = '10000000-0000-4000-a000-00000000000a') then
    insert into public.shipping_rates (tenant_id, name, price, min_subtotal, max_subtotal, estimated_days_min, estimated_days_max, position) values
  ('10000000-0000-4000-a000-00000000000a', 'Standard', 99, 0, 1499.99, 3, 6, 1),
  ('10000000-0000-4000-a000-00000000000a', 'Free shipping', 0, 1500, null, 3, 6, 2),
  ('10000000-0000-4000-a000-00000000000b', 'Standard', 79, 0, null, 4, 8, 1);
  end if;
end $$;

insert into public.discounts (tenant_id, code, title, type, value, min_subtotal, max_discount) values
  ('10000000-0000-4000-a000-00000000000a', 'WELCOME10', '10% off your first order', 'percentage', 10, 999, 500)
on conflict do nothing;

insert into public.menus (id, tenant_id, handle, title) values
  ('34000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-00000000000a', 'main', 'Main menu'),
  ('34000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-00000000000a', 'footer', 'Footer')
on conflict do nothing;
-- re-runnable: skip when Aangan already has menu_items
do $$ begin
  if not exists (select 1 from public.menu_items where tenant_id = '10000000-0000-4000-a000-00000000000a') then
    insert into public.menu_items (tenant_id, menu_id, title, link_type, link_ref, url, position, highlight) values
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000001', 'New', 'collection', '33000000-0000-4000-a000-000000000001', null, 1, false),
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000001', 'Kurtas', 'category', '31000000-0000-4000-a000-000000000001', null, 2, false),
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000001', 'Suit sets', 'category', '31000000-0000-4000-a000-000000000002', null, 3, false),
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000001', 'Sarees', 'category', '31000000-0000-4000-a000-000000000003', null, 4, false),
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000001', 'Festive', 'collection', '33000000-0000-4000-a000-000000000003', null, 5, false),
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000001', 'Sale', 'collection', '33000000-0000-4000-a000-000000000004', null, 6, true),
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000002', 'Shipping policy', 'url', null, '/pages/shipping-policy', 1, false),
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000002', 'Returns & exchanges', 'url', null, '/pages/returns', 2, false),
  ('10000000-0000-4000-a000-00000000000a', '34000000-0000-4000-a000-000000000002', 'Contact us', 'url', null, '/pages/contact', 3, false);
  end if;
end $$;

insert into public.pages (tenant_id, title, slug, kind, status, published_at, body) values
  ('10000000-0000-4000-a000-00000000000a', 'Shipping policy', 'shipping-policy', 'policy', 'published', now(),
   '[{"type": "paragraph", "text": "We ship across India. Orders are dispatched within 2-3 working days and usually arrive in 3-6 days."}, {"type": "paragraph", "text": "Shipping is free on orders above ₹1,500."}]'),
  ('10000000-0000-4000-a000-00000000000a', 'Returns & exchanges', 'returns', 'policy', 'published', now(),
   '[{"type": "paragraph", "text": "Unused items with tags can be returned within 7 days of delivery."}]'),
  ('10000000-0000-4000-a000-00000000000a', 'Contact us', 'contact', 'contact', 'published', now(),
   '[{"type": "paragraph", "text": "Write to hello@aangan.test or WhatsApp us at +91 98765 43210, Monday to Saturday, 10am to 6pm."}]')
on conflict do nothing;

-- re-runnable: skip when Aangan already has faqs
do $$ begin
  if not exists (select 1 from public.faqs where tenant_id = '10000000-0000-4000-a000-00000000000a') then
    insert into public.faqs (tenant_id, question, answer, position) values
  ('10000000-0000-4000-a000-00000000000a', 'Do you offer Cash on Delivery?', 'Yes, COD is available on orders up to ₹10,000 across most PIN codes.', 1),
  ('10000000-0000-4000-a000-00000000000a', 'Will the colours bleed?', 'Hand block prints use natural dyes; wash separately in cold water for the first few washes.', 2);
  end if;
end $$;

insert into public.customers (id, tenant_id, auth_user_id, email, phone, first_name, last_name, accepts_marketing) values
  ('35000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-000000000004', 'shopper@example.test', '+919900112233', 'Neha', 'Sharma', true)
on conflict do nothing;

-- re-runnable: skip when Aangan already has reviews
do $$ begin
  if not exists (select 1 from public.reviews where tenant_id = '10000000-0000-4000-a000-00000000000a') then
    insert into public.reviews (tenant_id, product_id, rating, title, body, author_name, status, verified_purchase) values
  ('10000000-0000-4000-a000-00000000000a', '32000000-0000-4000-a000-000000000001', 5, 'Beautiful indigo', 'The print is crisp and the cotton is so soft.', 'Priya', 'approved', true),
  ('10000000-0000-4000-a000-00000000000a', '32000000-0000-4000-a000-000000000001', 4, 'Runs slightly large', 'Lovely kurta, size down if between sizes.', 'Meera', 'approved', true);
  end if;
end $$;

-- Rangrez: one product so isolation tests have something to (not) see
insert into public.products (id, tenant_id, title, slug, product_type, status) values
  ('32000000-0000-4000-a000-0000000000b1', '10000000-0000-4000-a000-00000000000b', 'Madder Red Wrap Dress', 'madder-red-wrap-dress', 'dress', 'active')
on conflict do nothing;
insert into public.product_variants (tenant_id, product_id, sku, title, price) values
  ('10000000-0000-4000-a000-00000000000b', '32000000-0000-4000-a000-0000000000b1', 'RGZ-MRD', 'Default', 4200.00)
on conflict do nothing;

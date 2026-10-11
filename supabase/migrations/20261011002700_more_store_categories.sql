-- =============================================================================
-- 2700 MORE STORE CATEGORIES
-- Sixteen more industries for stores and the theme marketplace. Additive only: inserts
-- reference rows (skipped when the slug exists) and moves "General / Multi-category" last.
-- Mirrors src/features/stores/industries.ts.
-- Down: delete from public.store_categories where slug in (<the slugs below>);
--       (stores.category_id is ON DELETE SET NULL, so stores keep working.)
-- =============================================================================

insert into public.store_categories (slug, name, description, icon, position) values
  ('eyewear', 'Eyewear & Sunglasses', 'Frames, sunglasses, lenses and eyewear accessories.', 'glasses', 21),
  ('fragrances', 'Perfumes & Fragrances', 'Perfumes, attars, deodorants and body mists.', 'spray-can', 22),
  ('home-decor', 'Home Décor & Lighting', 'Decor, lighting, wall art and festive decor.', 'lamp', 23),
  ('kitchen', 'Kitchen & Dining', 'Cookware, tableware, storage and kitchen tools.', 'cooking-pot', 24),
  ('home-textiles', 'Home Textiles & Furnishings', 'Bedding, curtains, rugs, towels and cushions.', 'bed-double', 25),
  ('toys', 'Toys & Games', 'Toys, board games, puzzles and learning kits.', 'puzzle', 26),
  ('gifts', 'Gifts & Personalised', 'Hampers, personalised and occasion gifts.', 'gift', 27),
  ('plants', 'Plants & Gardening', 'Plants, planters, seeds, soil and garden tools.', 'sprout', 28),
  ('pooja', 'Pooja & Spiritual', 'Pooja essentials, idols, diyas and festival kits.', 'flame', 29),
  ('tools', 'Hardware & Tools', 'Hand and power tools, hardware and electricals.', 'wrench', 30),
  ('music', 'Musical Instruments', 'Instruments, studio gear and accessories.', 'guitar', 31),
  ('art', 'Art & Collectibles', 'Original art, prints, collectibles and art supplies.', 'frame', 32),
  ('beverages', 'Tea, Coffee & Beverages', 'Tea, coffee, health drinks and beverages.', 'coffee', 33),
  ('sweets', 'Sweets & Snacks', 'Mithai, namkeen, chips and healthy snacks.', 'candy', 34),
  ('mobile-accessories', 'Mobile & Computer Accessories', 'Covers, chargers, cables and laptop accessories.', 'smartphone', 35),
  ('ayurveda', 'Ayurveda & Herbal', 'Ayurvedic, herbal and natural wellness products.', 'leaf', 36)
on conflict (slug) do nothing;

update public.store_categories set position = 99 where slug = 'general' and position < 99;

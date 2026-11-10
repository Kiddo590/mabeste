-- Local dev seed data for Mabeste POS.
-- PINs here are seed-only placeholders (admin: 0000, cashier: 1111) — never
-- reuse these in a real deployment. pgcrypto's crypt()/gen_salt('bf')
-- produces standard bcrypt hashes, verifiable the same way the staff-login
-- Edge Function verifies PINs entered through the app.

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin@mabeste.local', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cashier1@mabeste.local', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}');

insert into staff (id, auth_user_id, name, phone, pin_hash, role, is_active) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Mabeste Admin', '254700000001', extensions.crypt('0000', extensions.gen_salt('bf')), 'admin', true),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'Cashier One', '254700000002', extensions.crypt('1111', extensions.gen_salt('bf')), 'cashier', true);

insert into categories (id, name, sort_order) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Beer', 1),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Spirits', 2),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'Soft Drinks', 3),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'Food', 4);

insert into products (category_id, name, price, sku, stock_qty, low_stock_threshold) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Tusker Lager', 350, 'BEER-001', 120, 24),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'White Cap', 350, 'BEER-002', 100, 24),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Guinness', 400, 'BEER-003', 80, 24),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Smirnoff Ice', 400, 'SPIRIT-001', 60, 12),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Jameson (shot)', 500, 'SPIRIT-002', 150, 30),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Chrome Vodka (shot)', 300, 'SPIRIT-003', 150, 30),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'Coca-Cola', 150, 'SOFT-001', 200, 24),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'Water (500ml)', 100, 'SOFT-002', 200, 24),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'Beef Samosa', 150, 'FOOD-001', 40, 10),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'Chicken Wings', 600, 'FOOD-002', 30, 10);

insert into tables (label) values
  ('Table 1'), ('Table 2'), ('Table 3'), ('Table 4'),
  ('VIP 1'), ('VIP 2'), ('Bar');

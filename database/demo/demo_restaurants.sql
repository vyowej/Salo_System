-- =============================================================================
-- SALO Demo Seed Proposal: Public Restaurants, Categories, Operating Hours & Menus
-- =============================================================================
-- Target database: salo_db (DO NOT run automatically; review and load manually)
-- Command to load:
--   C:\xampp\mysql\bin\mysql.exe -u root salo_db < database/demo/demo_restaurants.sql
-- =============================================================================

USE salo_db;

START TRANSACTION;

-- 1. Location hierarchy & addresses
INSERT INTO provinces (province_name) VALUES ('Metro Manila');
SET @province_id = LAST_INSERT_ID();

INSERT INTO cities (province_id, city_name) VALUES (@province_id, 'Quezon City');
SET @city_qc = LAST_INSERT_ID();

INSERT INTO cities (province_id, city_name) VALUES (@province_id, 'Makati');
SET @city_makati = LAST_INSERT_ID();

INSERT INTO barangays (city_id, barangay_name) VALUES (@city_qc, 'Laging Handa');
SET @brgy_qc = LAST_INSERT_ID();

INSERT INTO barangays (city_id, barangay_name) VALUES (@city_makati, 'Poblacion');
SET @brgy_makati = LAST_INSERT_ID();

INSERT INTO addresses (barangay_id, street, postal_code)
VALUES (@brgy_qc, '42 Scout Gandia St.', '1103');
SET @addr_dalisay = LAST_INSERT_ID();

INSERT INTO addresses (barangay_id, street, postal_code)
VALUES (@brgy_makati, '5890 Alfonso St.', '1210');
SET @addr_iloko = LAST_INSERT_ID();

INSERT INTO addresses (barangay_id, street, postal_code)
VALUES (@brgy_qc, '18 Maginhawa St.', '1101');
SET @addr_kape = LAST_INSERT_ID();

-- 2. Active restaurant categories
INSERT INTO restaurant_categories (category_name, description, is_active) VALUES
('Filipino', 'Classic regional Filipino comfort food and heritage dishes.', 1),
('Grill & BBQ', 'Charcoal-grilled meats, seafood, and inasal specialties.', 1),
('Cafe & Bakery', 'Specialty coffee, pastries, and artisan breads.', 1);

SELECT category_id INTO @cat_filipino FROM restaurant_categories WHERE category_name = 'Filipino' LIMIT 1;
SELECT category_id INTO @cat_grill FROM restaurant_categories WHERE category_name = 'Grill & BBQ' LIMIT 1;
SELECT category_id INTO @cat_cafe FROM restaurant_categories WHERE category_name = 'Cafe & Bakery' LIMIT 1;

-- 3. Three approved & active restaurants
INSERT INTO restaurants (
    restaurant_name, business_type, ownership_structure, description,
    contact_phone, business_email, address_id,
    offers_delivery, offers_pickup, offers_dine_in, accepts_reservations,
    accepting_orders, accepting_reservations, restaurant_status
) VALUES (
    'Dalisay Heritage Grill & Bistro', 'restaurant', 'sole_proprietorship',
    'Authentic Filipino charcoal-grilled specialties and family-style classics.',
    '+63 917 555 0101', 'dalisay-demo@salo.local', @addr_dalisay,
    1, 1, 1, 1, 1, 1, 'active'
);
SET @rest_dalisay = LAST_INSERT_ID();

INSERT INTO restaurants (
    restaurant_name, business_type, ownership_structure, description,
    contact_phone, business_email, address_id,
    offers_delivery, offers_pickup, offers_dine_in, accepts_reservations,
    accepting_orders, accepting_reservations, restaurant_status
) VALUES (
    'Casa Iloko Kitchen', 'restaurant', 'partnership',
    'Northern Luzon favorites featuring bagnet, pinakbet, and late-night grill plates.',
    '+63 917 555 0102', 'casailoko-demo@salo.local', @addr_iloko,
    1, 1, 1, 0, 1, 1, 'active'
);
SET @rest_iloko = LAST_INSERT_ID();

INSERT INTO restaurants (
    restaurant_name, business_type, ownership_structure, description,
    contact_phone, business_email, address_id,
    offers_delivery, offers_pickup, offers_dine_in, accepts_reservations,
    accepting_orders, accepting_reservations, restaurant_status
) VALUES (
    'Kape & Tinapay Bakehouse', 'cafe', 'sole_proprietorship',
    'Local single-origin barako coffee, ensaymada, and sourdough pandesal.',
    '+63 917 555 0103', 'kape-demo@salo.local', @addr_kape,
    1, 1, 0, 0, 1, 1, 'active'
);
SET @rest_kape = LAST_INSERT_ID();

INSERT INTO restaurant_category_map (restaurant_id, category_id) VALUES
(@rest_dalisay, @cat_filipino),
(@rest_dalisay, @cat_grill),
(@rest_iloko, @cat_filipino),
(@rest_kape, @cat_cafe);

-- 4. Operating hours (0 = Sunday ... 6 = Saturday)
-- Dalisay: Daily 10:00 - 22:00
INSERT INTO operating_hours (restaurant_id, day_of_week, opening_time, closing_time, closes_next_day, is_closed) VALUES
(@rest_dalisay, 0, '10:00:00', '22:00:00', 0, 0),
(@rest_dalisay, 1, '10:00:00', '22:00:00', 0, 0),
(@rest_dalisay, 2, '10:00:00', '22:00:00', 0, 0),
(@rest_dalisay, 3, '10:00:00', '22:00:00', 0, 0),
(@rest_dalisay, 4, '10:00:00', '22:00:00', 0, 0),
(@rest_dalisay, 5, '10:00:00', '22:00:00', 0, 0),
(@rest_dalisay, 6, '10:00:00', '22:00:00', 0, 0);

-- Casa Iloko: Daily split shift + overnight closing at 02:00 next day
INSERT INTO operating_hours (restaurant_id, day_of_week, opening_time, closing_time, closes_next_day, is_closed) VALUES
(@rest_iloko, 0, '11:00:00', '14:30:00', 0, 0),
(@rest_iloko, 0, '17:30:00', '02:00:00', 1, 0),
(@rest_iloko, 1, '11:00:00', '14:30:00', 0, 0),
(@rest_iloko, 1, '17:30:00', '02:00:00', 1, 0),
(@rest_iloko, 2, '11:00:00', '14:30:00', 0, 0),
(@rest_iloko, 2, '17:30:00', '02:00:00', 1, 0),
(@rest_iloko, 3, '11:00:00', '14:30:00', 0, 0),
(@rest_iloko, 3, '17:30:00', '02:00:00', 1, 0),
(@rest_iloko, 4, '11:00:00', '14:30:00', 0, 0),
(@rest_iloko, 4, '17:30:00', '02:00:00', 1, 0),
(@rest_iloko, 5, '11:00:00', '14:30:00', 0, 0),
(@rest_iloko, 5, '17:30:00', '02:00:00', 1, 0),
(@rest_iloko, 6, '11:00:00', '14:30:00', 0, 0),
(@rest_iloko, 6, '17:30:00', '02:00:00', 1, 0);

-- Kape & Tinapay: Daily 07:00 - 19:00
INSERT INTO operating_hours (restaurant_id, day_of_week, opening_time, closing_time, closes_next_day, is_closed) VALUES
(@rest_kape, 0, '07:00:00', '19:00:00', 0, 0),
(@rest_kape, 1, '07:00:00', '19:00:00', 0, 0),
(@rest_kape, 2, '07:00:00', '19:00:00', 0, 0),
(@rest_kape, 3, '07:00:00', '19:00:00', 0, 0),
(@rest_kape, 4, '07:00:00', '19:00:00', 0, 0),
(@rest_kape, 5, '07:00:00', '19:00:00', 0, 0),
(@rest_kape, 6, '07:00:00', '19:00:00', 0, 0);

-- 5. Menu categories & items (including available, sold_out, temporarily_unavailable, and hidden)
INSERT INTO menu_categories (restaurant_id, category_name, sort_order, is_active)
VALUES (@rest_dalisay, 'Grilled Mains', 1, 1);
SET @mc_dalisay_mains = LAST_INSERT_ID();

INSERT INTO menu_categories (restaurant_id, category_name, sort_order, is_active)
VALUES (@rest_dalisay, 'Desserts & Drinks', 2, 1);
SET @mc_dalisay_desserts = LAST_INSERT_ID();

INSERT INTO menu_items (restaurant_id, menu_category_id, item_name, description, base_price, availability_status, approval_status, sort_order)
VALUES (@rest_dalisay, @mc_dalisay_mains, 'Chicken Inasal (Quarter Leg)', 'Bacolod-style charbroiled chicken with annatto glaze and sinamak.', 195.00, 'available', 'approved', 1);
SET @item_inasal = LAST_INSERT_ID();

INSERT INTO menu_items (restaurant_id, menu_category_id, item_name, description, base_price, availability_status, approval_status, sort_order) VALUES
(@rest_dalisay, @mc_dalisay_mains, 'Crispy Pork Belly Liempo', 'Slow-roasted pork belly fried crisp with spiced vinegar.', 320.00, 'sold_out', 'approved', 2),
(@rest_dalisay, @mc_dalisay_desserts, 'Halo-Halo Especial', 'Shaved ice with leche flan, ube halaya, and macapuno.', 145.00, 'available', 'approved', 1),
(@rest_dalisay, @mc_dalisay_desserts, 'Internal Test Dish (Hidden)', 'Should never appear in customer menu.', 99.00, 'hidden', 'pending', 2);

INSERT INTO add_on_groups (menu_item_id, group_name, is_required, minimum_selections, maximum_selections, sort_order)
VALUES (@item_inasal, 'Choice of Rice', 1, 1, 1, 1);
SET @ag_rice = LAST_INSERT_ID();

INSERT INTO add_on_options (add_on_group_id, option_name, additional_price, is_available, sort_order) VALUES
(@ag_rice, 'Steamed Garlic Rice', 0.00, 1, 1),
(@ag_rice, 'Java Rice', 25.00, 1, 2);

INSERT INTO menu_categories (restaurant_id, category_name, sort_order, is_active)
VALUES (@rest_iloko, 'Ilocano Classics', 1, 1);
SET @mc_iloko = LAST_INSERT_ID();

INSERT INTO menu_items (restaurant_id, menu_category_id, item_name, description, base_price, availability_status, approval_status, sort_order) VALUES
(@rest_iloko, @mc_iloko, 'Bagnet Kare-Kare', 'Crispy pork bagnet served with rich peanut sauce and bagoong.', 385.00, 'available', 'approved', 1),
(@rest_iloko, @mc_iloko, 'Pinakbet Iloko', 'Native vegetables simmered with bagnet bits and bagoong isda.', 240.00, 'temporarily_unavailable', 'approved', 2);

INSERT INTO menu_categories (restaurant_id, category_name, sort_order, is_active)
VALUES (@rest_kape, 'Coffee & Pastries', 1, 1);
SET @mc_kape = LAST_INSERT_ID();

INSERT INTO menu_items (restaurant_id, menu_category_id, item_name, description, base_price, availability_status, approval_status, sort_order) VALUES
(@rest_kape, @mc_kape, 'Iced Barako Latte', 'Batangas liberica espresso over milk and muscovado syrup.', 135.00, 'available', 'approved', 1),
(@rest_kape, @mc_kape, 'Queso de Bola Ensaymada', 'Brioche pastry topped with buttercream and aged edam cheese.', 110.00, 'available', 'approved', 2);

COMMIT;

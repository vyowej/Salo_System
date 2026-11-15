-- ============================================================================
-- SALO Baseline Seed Proposal (AUDIT / PROPOSAL ONLY — DO NOT EXECUTE AS-IS)
-- ============================================================================
-- Target database: salo_db (authoritative schema: database/salo_db.sql)
--
-- IMPORTANT:
--   Per SALO_DEVELOPMENT_RULES.md and Step 2 instructions, this file does NOT
--   invent unapproved account codes, locations, categories, fees, rates, or
--   admin credentials.
--
--   Every table below was identified in the Step 2 audit as requiring baseline
--   rows before the platform can operate, OR requiring explicit product/schema
--   decisions before concrete INSERT statements can be finalized.
--   See the Step 2 "Decisions needed" report section for each open item.
-- ============================================================================

-- USE salo_db;

-- ----------------------------------------------------------------------------
-- 1. LOCATION HIERARCHY: provinces, cities, barangays
-- ----------------------------------------------------------------------------
-- Why required:
--   - addresses.barangay_id -> barangays(barangay_id) (NOT NULL, RESTRICT)
--   - barangays.city_id     -> cities(city_id)       (NOT NULL, RESTRICT)
--   - cities.province_id    -> provinces(province_id)(NOT NULL, RESTRICT)
--   - riders.base_city_id   -> cities(city_id)       (NOT NULL, RESTRICT)
--   - service_areas.city_id -> cities(city_id)       (NOT NULL, RESTRICT)
--   Without these rows, no user address, restaurant, rider, or service area
--   can be created.
-- Sources:
--   - database/salo_db.sql lines 53-98, 105-120, 288-310, 396, 409, 501, 526
--   - documentation/requirements/ADMIN_SIDE.md lines 874, 1094
--   - documentation/requirements/RESTAURANT_SIDE.md lines 283, 302-303
--   - documentation/requirements/CUSTOMER_SIDE.md line 513
-- Status:
--   DECISION NEEDED — Supported initial provinces, cities, and barangays
--   (e.g., NCR / Metro Manila pilot vs. full Philippine PSGC dataset) are not
--   specified in the authoritative schema or business rules.
--
-- Template (populate after approval):
-- INSERT INTO provinces (province_name) VALUES ('...');
-- INSERT INTO cities (province_id, city_name) VALUES (LAST_INSERT_ID(), '...');
-- INSERT INTO barangays (city_id, barangay_name) VALUES (LAST_INSERT_ID(), '...');

-- ----------------------------------------------------------------------------
-- 2. CHART OF ACCOUNTS: ledger_accounts
-- ----------------------------------------------------------------------------
-- Why required:
--   - ledger_entries.account_id -> ledger_accounts(account_id) (NOT NULL, RESTRICT)
--   - No payment, sales, commission, delivery fee, rider pay, tip, deposit,
--     service fee, refund, COD collection/remittance, or payout journal can be
--     posted without ledger_accounts rows.
--   - chk_ledger_accounts_required enforces account_type IS NOT NULL
--     ('asset','liability','revenue','expense').
-- Sources:
--   - database/salo_db.sql lines 38, 1191-1218, 1276-1302
--   - documentation/SALO_BUSINESS_RULES.md Section 2.4 (lines 74-93),
--     Section 65 (lines 1589-1611)
--   - documentation/LEDGER_CHART_OF_ACCOUNTS_PROPOSAL.md (approved 1010-5030)
-- Status:
--   APPROVED PROPOSAL (16 accounts 1010-5030) — ready for execution after
--   final sign-off; USE salo_db remains commented out in this proposal file.

INSERT INTO ledger_accounts (account_code, account_name, account_type, is_active) VALUES
  -- Assets (SALO_BUSINESS_RULES.md §5.1 Model B, §6.1, §14, §26, §36, §36.5, §37, §40)
  ('1010', 'Platform Cash / Bank', 'asset', 1),
  ('1020', 'Payment Provider Receivable / Clearing', 'asset', 1),
  ('1030', 'Rider COD Cash Receivable', 'asset', 1),
  ('1040', 'Restaurant Receivable / Clawback', 'asset', 1),
  -- Liabilities (SALO_BUSINESS_RULES.md §2.4, §3.1, §7-13, §16.1, §17-22, §35, §38, §40, §41.1)
  ('2010', 'Customer Unallocated / Clearing Liability', 'liability', 1),
  ('2020', 'Restaurant Payable', 'liability', 1),
  ('2030', 'Rider Payable', 'liability', 1),
  ('2040', 'Reservation Deposit Liability', 'liability', 1),
  ('2050', 'Refunds Payable', 'liability', 1),
  -- Revenue (SALO_BUSINESS_RULES.md §2.4, §16, §16.2, §19, §21, §33, §35, §38, §39)
  ('4010', 'Platform Commission Revenue', 'revenue', 1),
  ('4020', 'Delivery Fee Revenue', 'revenue', 1),
  ('4030', 'Reservation Service Fee Revenue', 'revenue', 1),
  ('4040', 'Reservation Cancellation / Forfeiture Revenue', 'revenue', 1),
  -- Expenses (SALO_BUSINESS_RULES.md §2.4, §26, §30, §30.1, §35, §36.6, §67)
  ('5010', 'Rider Compensation Expense', 'expense', 1),
  ('5020', 'Platform Promo / Discount Expense', 'expense', 1),
  ('5030', 'Ledger Adjustment / Discrepancy Expense', 'expense', 1);

-- ----------------------------------------------------------------------------
-- 3. RESTAURANT CATEGORIES: restaurant_categories
-- ----------------------------------------------------------------------------
-- Why required (operational):
--   - restaurant_category_map.category_id -> restaurant_categories(category_id)
--     (NOT NULL, RESTRICT).
--   - Required for restaurant onboarding cuisine/category tagging and customer
--     discovery filters.
-- Sources:
--   - database/salo_db.sql lines 237-260
--   - docs/API_CONTRACT.md line 124
-- Status:
--   DECISION NEEDED — Initial category_name list is not specified in the docs
--   ("fully dynamic" per salo_db.sql line 237).
--
-- Template (populate after approval):
-- INSERT INTO restaurant_categories (category_name, description, is_active) VALUES
--   ('...', '...', 1);

-- ----------------------------------------------------------------------------
-- 4. FIRST ADMINISTRATOR ACCOUNT: users
-- ----------------------------------------------------------------------------
-- Why required:
--   - ADMIN_SIDE.md Section 3.1 (lines 148-165) requires admin accounts to be
--     created by invitation from an existing Super Admin.
--   - At least one initial admin user (user_role = 'admin', account_status =
--     'active') must exist to bootstrap admin invitations, application reviews
--     (reviewed_by FK), and platform governance.
-- Sources:
--   - database/salo_db.sql lines 132-156
--   - documentation/requirements/ADMIN_SIDE.md lines 148-165
-- Security rule:
--   DO NOT place any password or password_hash in SQL. Create the first admin
--   via a dedicated one-time interactive CLI command (see Step 2 report).

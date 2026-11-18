-- ============================================================================
-- SCHEMA CHANGE: Restaurant Inventory Deduction Mode
-- Target schema: database/salo_db.sql (salo_db / salo_test)
-- ============================================================================

ALTER TABLE restaurants
    ADD COLUMN inventory_deduction_mode ENUM('manual', 'on_completion') NOT NULL DEFAULT 'manual'
    AFTER accepting_reservations;

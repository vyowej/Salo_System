-- ============================================================================
-- SALO — One-off Data Normalization Script (Reviewable, NOT auto-applied)
-- Purpose: Normalize any existing restaurants.logo_image, restaurants.cover_image,
--          and menu_items.photo_image values that were saved with a '/storage/'
--          or 'storage/' URL prefix so only the relative storage disk path
--          (e.g. 'restaurants/1/uuid.png') is stored in the database.
--
-- Target: Run ONLY after explicit approval and DB backup.
-- ============================================================================

-- Preview rows that would be updated:
-- SELECT restaurant_id, logo_image, cover_image
-- FROM restaurants
-- WHERE logo_image LIKE '/storage/%' OR logo_image LIKE 'storage/%'
--    OR cover_image LIKE '/storage/%' OR cover_image LIKE 'storage/%';
--
-- SELECT menu_item_id, restaurant_id, photo_image
-- FROM menu_items
-- WHERE photo_image LIKE '/storage/%' OR photo_image LIKE 'storage/%';

START TRANSACTION;

UPDATE restaurants
SET logo_image = CASE
    WHEN logo_image LIKE '/storage/%' THEN SUBSTRING(logo_image, 10)
    WHEN logo_image LIKE 'storage/%' THEN SUBSTRING(logo_image, 9)
    ELSE logo_image
END,
cover_image = CASE
    WHEN cover_image LIKE '/storage/%' THEN SUBSTRING(cover_image, 10)
    WHEN cover_image LIKE 'storage/%' THEN SUBSTRING(cover_image, 9)
    ELSE cover_image
END
WHERE logo_image LIKE '/storage/%'
   OR logo_image LIKE 'storage/%'
   OR cover_image LIKE '/storage/%'
   OR cover_image LIKE 'storage/%';

UPDATE menu_items
SET photo_image = CASE
    WHEN photo_image LIKE '/storage/%' THEN SUBSTRING(photo_image, 10)
    WHEN photo_image LIKE 'storage/%' THEN SUBSTRING(photo_image, 9)
    ELSE photo_image
END
WHERE photo_image LIKE '/storage/%'
   OR photo_image LIKE 'storage/%';

COMMIT;

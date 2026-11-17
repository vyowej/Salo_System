const LEGACY_DEMO_STORAGE_KEYS = [
  'salo_demo_store_v1',
  'salo_customer_addresses',
  'salo_addresses',
  'salo_favorites',
  'salo_notifications',
  'salo_owner_restaurant',
  'salo_admin_restaurants',
  'salo_admin_riders',
  'salo_admin_users',
  'salo_admin_config',
  'salo_admin_audit_logs',
  'salo_admin_disputes',
  'salo_admin_applications',
  'salo_partner_applications',
  'salo_rider_delivery_progress',
];

const CART_STORAGE_KEYS = [
  'salo_multi_cart',
  'salo_cart_fulfillment',
  'salo_cart_addresses',
  'salo_cart_address_modes',
  'salo_cart_item_addresses',
];

const CLEANUP_FLAG_KEY = 'salo_legacy_demo_cleaned_v2';

function purgeLegacyDemoCartItems(storage) {
  try {
    const raw = storage.getItem('salo_multi_cart');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      CART_STORAGE_KEYS.forEach((key) => storage.removeItem(key));
      return;
    }

    const realItems = parsed.filter((item) => /^\d+$/.test(String(item?.restaurantId ?? '')));
    if (realItems.length === 0) {
      CART_STORAGE_KEYS.forEach((key) => storage.removeItem(key));
    } else if (realItems.length !== parsed.length) {
      storage.setItem('salo_multi_cart', JSON.stringify(realItems));
    }
  } catch {
    CART_STORAGE_KEYS.forEach((key) => storage.removeItem(key));
  }
}

/**
 * One-time cleanup of known legacy demo-mode localStorage keys and legacy demo cart items.
 * Never touches auth, theme, drafts, or per-role onboarding keys.
 */
export function cleanupLegacyDemoStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    if (window.localStorage.getItem(CLEANUP_FLAG_KEY) === '1') return;

    for (const key of LEGACY_DEMO_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
    window.localStorage.removeItem('salo_legacy_demo_cleaned_v1');

    purgeLegacyDemoCartItems(window.localStorage);

    window.localStorage.setItem(CLEANUP_FLAG_KEY, '1');
  } catch {
    // Ignore storage access errors in restricted environments.
  }
}

export default cleanupLegacyDemoStorage;

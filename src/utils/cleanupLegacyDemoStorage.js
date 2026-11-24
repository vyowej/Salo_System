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

const CLEANUP_FLAG_KEY = 'salo_legacy_demo_cleaned_v3';

function purgeUnscopedDraftsAndStaleKeys(storage) {
  try {
    const rawRiderDraft = storage.getItem('salo_rider_app_draft_v1');
    if (rawRiderDraft) {
      const parsed = JSON.parse(rawRiderDraft);
      if (!parsed?.ownerUserId || !parsed?.ownerEmail) {
        storage.removeItem('salo_rider_app_draft_v1');
      }
    }
  } catch {
    storage.removeItem('salo_rider_app_draft_v1');
  }

  storage.removeItem('salo_rider_applications');

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const rawPartnerDraft = window.sessionStorage.getItem('salo_partner_app_draft');
      if (rawPartnerDraft) {
        const parsed = JSON.parse(rawPartnerDraft);
        if (!parsed?._ownerUserId || !parsed?._ownerEmail) {
          window.sessionStorage.removeItem('salo_partner_app_draft');
        }
      }
    } catch {
      window.sessionStorage.removeItem('salo_partner_app_draft');
    }
  }
}

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
    window.localStorage.removeItem('salo_legacy_demo_cleaned_v2');

    purgeLegacyDemoCartItems(window.localStorage);
    purgeUnscopedDraftsAndStaleKeys(window.localStorage);

    window.localStorage.setItem(CLEANUP_FLAG_KEY, '1');
  } catch {
    // Ignore storage access errors in restricted environments.
  }
}

export default cleanupLegacyDemoStorage;

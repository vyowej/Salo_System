let activeRestaurantIdHeader = null;

export function getSelectedRestaurantStorageKey(user) {
  const userId = user?.user_id ?? user?.id;
  if (!userId) return null;
  return `salo_selected_restaurant_${String(userId)}`;
}

export function readStoredSelectedRestaurantId(user) {
  const key = getSelectedRestaurantStorageKey(user);
  if (!key || typeof localStorage === 'undefined') return null;
  try {
    const val = localStorage.getItem(key);
    return val && val.trim() !== '' ? val.trim() : null;
  } catch {
    return null;
  }
}

export function writeStoredSelectedRestaurantId(user, restaurantId) {
  const key = getSelectedRestaurantStorageKey(user);
  if (!key || typeof localStorage === 'undefined') return;
  try {
    if (restaurantId) {
      localStorage.setItem(key, String(restaurantId));
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function setActiveRestaurantIdHeader(restaurantId) {
  activeRestaurantIdHeader = restaurantId ? String(restaurantId) : null;
}

export function getActiveRestaurantIdHeader() {
  return activeRestaurantIdHeader;
}

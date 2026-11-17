const STORAGE_BASE_URL = (import.meta.env?.VITE_STORAGE_URL || '/storage').replace(/\/$/, '');

export function sanitizeStorageFileName(fileName = 'image.webp') {
  const base = String(fileName || 'image')
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'image';
  return `${base}.webp`;
}

/**
 * Builds the relative storage path intended for Laravel's `public` disk
 * (`storage/app/public/restaurants/{restaurant_id}/{logo|cover|menu|gallery}/...`).
 * Store this relative path in MySQL rather than binary image data.
 */
export function buildRestaurantStoragePath(restaurantId = '{restaurant_id}', category = 'gallery', fileName = 'image.webp') {
  const safeRestaurantId = String(restaurantId || '{restaurant_id}').trim() || '{restaurant_id}';
  const allowedCategories = new Set(['logo', 'cover', 'menu', 'gallery']);
  const safeCategory = allowedCategories.has(category) ? category : 'gallery';
  return `restaurants/${safeRestaurantId}/${safeCategory}/${sanitizeStorageFileName(fileName)}`;
}

/**
 * Resolves a relative database file path (e.g. `restaurants/1/logo/brand.webp`)
 * into a public URL served via Laravel's `public/storage` symbolic link.
 */
export function resolvePublicStorageUrl(value) {
  if (!value) return '';
  const raw = typeof value === 'string' ? value.trim() : String(value.src || value.url || value.path || '').trim();
  if (!raw) return '';
  if (/^(https?:|data:|blob:)/i.test(raw) || raw.startsWith('/')) {
    return raw;
  }
  const normalizedPath = raw.replace(/^storage\/app\/public\//, '').replace(/^public\//, '').replace(/^\/+/, '');
  return `${STORAGE_BASE_URL}/${normalizedPath}`;
}

export async function getImageUrl(image) {
  return resolvePublicStorageUrl(image);
}

export async function uploadImage() {
  throw new Error('Image upload is not available yet. The backend media upload API is pending implementation.');
}

export async function removeImage() {
  return undefined;
}

export function getOperatingHours() {
  return null;
}

export function updateOperatingHours() {
  throw new Error('Updating operating hours is not available yet. The backend API is pending implementation.');
}

export const restaurantService = {
  buildRestaurantStoragePath,
  resolvePublicStorageUrl,
  getImageUrl,
  uploadImage,
  removeImage,
  getOperatingHours,
  updateOperatingHours,
};

export default restaurantService;

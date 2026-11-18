/** Slugify a string to a safe username fragment */
export function toUsernameSlug(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20);
}

/**
 * Sanitize optional middle initial:
 * - Strips typed periods
 * - Letters only (A-Z)
 * - Auto-uppercases
 * - Max 1 letter
 */
export function sanitizeMiddleInitial(rawValue) {
  if (!rawValue) return '';
  return String(rawValue)
    .replace(/\./g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 1);
}

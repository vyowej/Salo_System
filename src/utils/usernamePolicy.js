/**
 * SALO — Shared Username Policy (mirrors backend AuthService / RegisterRequest)
 * Rule: 3 to 30 characters, letters, numbers, and underscores only (no spaces).
 */

export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

export function validateUsernameFormat(rawUsername = '') {
  const username = String(rawUsername || '').trim();
  if (!username) {
    return { valid: false, message: 'Please enter a username.' };
  }
  if (/\s/.test(username)) {
    return { valid: false, message: 'Username cannot contain spaces.' };
  }
  if (username.length < 3 || username.length > 30) {
    return { valid: false, message: 'Username must be between 3 and 30 characters.' };
  }
  if (!USERNAME_REGEX.test(username)) {
    return { valid: false, message: 'Username may only contain letters, numbers, and underscores (_).' };
  }
  return { valid: true, message: '' };
}

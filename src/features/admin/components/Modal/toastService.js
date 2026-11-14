export const TOAST_EVENT = 'salo-admin-toast';

export function showAdminToast(message, tone = 'success') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { id: `${Date.now()}-${Math.random()}`, message, tone } }));
}

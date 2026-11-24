/**
 * SALO — Safe Reference-Counted Body Scroll Lock
 *
 * Prevents nested/overlapping modals or re-running effects from capturing
 * `document.body.style.overflow = 'hidden'` as their "previous" overflow value
 * and leaving the page permanently unscrollable after closing.
 */

const activeLocks = new Set();

const MODAL_OVERLAY_SELECTOR = [
  '.modal-overlay',
  '.salo-onboarding-backdrop',
  '.salo-modal-backdrop',
  '.admin-detail-drawer',
  '.app-review-drawer-backdrop',
  '.confirm-dialog-backdrop',
  '.warning-dialog-backdrop',
].join(', ');

function syncBodyOverflow() {
  if (typeof document === 'undefined' || !document.body) return;

  if (activeLocks.size > 0) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
    if (document.documentElement) {
      document.documentElement.style.overflow = '';
    }
  }
}

/**
 * Acquires a body scroll lock and returns an idempotent release function.
 */
export function acquireBodyScrollLock() {
  const token = Symbol('salo-scroll-lock');
  activeLocks.add(token);
  syncBodyOverflow();

  return () => {
    if (!activeLocks.has(token)) return;
    activeLocks.delete(token);
    syncBodyOverflow();
  };
}

/**
 * Safeguard called on route transitions and HMR boot: if no modal/drawer overlay
 * is present in the DOM (or if activeLocks is empty), ensure body scroll is unlocked.
 */
export function ensureBodyScrollUnlockedIfNoModal() {
  if (typeof document === 'undefined' || !document.body) return;

  const hasVisibleModal = Boolean(
    typeof document.querySelector === 'function' && document.querySelector(MODAL_OVERLAY_SELECTOR),
  );

  if (!hasVisibleModal || activeLocks.size === 0) {
    if (!hasVisibleModal) {
      activeLocks.clear();
    }
    if (activeLocks.size === 0) {
      document.body.style.overflow = '';
      if (document.documentElement) {
        document.documentElement.style.overflow = '';
      }
    }
  }
}

// Immediate self-heal on load / HMR in case a previous modal left body overflow stuck
if (typeof document !== 'undefined') {
  ensureBodyScrollUnlockedIfNoModal();
}

export default acquireBodyScrollLock;

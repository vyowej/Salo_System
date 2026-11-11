import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useCart } from '../../../hooks/useCart';
import OrderPanel from './OrderPanel';
import './MobileOrderBar.css';

/**
 * MobileOrderBar
 *
 * Rendered at the bottom of the page (below the two-column layout).
 * Only visible below the 1024 px breakpoint (enforced by CSS).
 *
 * When the cart has at least one item, shows a fixed floating bar.
 * Tapping the bar opens the same OrderPanel inside a bottom sheet.
 *
 * Props
 * ─────
 * @param {string} restaurantId   - Current restaurant id (passed to OrderPanel)
 * @param {string} restaurantName - Current restaurant name (passed to OrderPanel)
 */
export default function MobileOrderBar({ restaurantId, restaurantName }) {
  const { totalItemCount, itemsSubtotal } = useCart();
  const [open, setOpen] = useState(false);
  const closeRef = useRef(null);
  const sheetRef = useRef(null);

  const closeSheet = useCallback(() => setOpen(false), []);

  // Keyboard: Escape closes the sheet
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeSheet();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeSheet]);

  // Focus trap inside the sheet
  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    if (!sheet) return;

    const focusable = sheet.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // Move initial focus to close button
    closeRef.current?.focus();

    const trap = (e) => {
      if (e.key !== 'Tab') return;
      if (focusable.length === 0) { e.preventDefault(); return; }
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };

    sheet.addEventListener('keydown', trap);
    return () => sheet.removeEventListener('keydown', trap);
  }, [open]);

  // Lock body scroll when sheet is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (totalItemCount === 0) return null;

  const displayTotal = `₱${itemsSubtotal.toLocaleString()}`;

  return (
    <>
      {/* ── Floating bottom bar ──────────────────── */}
      <button
        type="button"
        className="mob-bar"
        onClick={() => setOpen(true)}
        aria-label={`View your order: ${totalItemCount} items, ${displayTotal}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="mob-bar-left">
          <span className="mob-bar-count">{totalItemCount}</span>
          <span className="mob-bar-label">
            {totalItemCount === 1 ? '1 item' : `${totalItemCount} items`}
          </span>
          <span aria-hidden="true">·</span>
          <span className="mob-bar-total">{displayTotal}</span>
        </span>
        <span className="mob-bar-cta">
          View order
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </span>
      </button>

      {/* ── Bottom sheet portal ──────────────────── */}
      {open &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              className="mob-backdrop"
              aria-hidden="true"
              onClick={closeSheet}
            />

            {/* Sheet */}
            <div
              ref={sheetRef}
              className="mob-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Your order"
            >
              {/* Handle + close */}
              <div className="mob-sheet-handle" aria-hidden="true">
                <div className="mob-sheet-handle-bar" />
              </div>
              <div className="mob-sheet-topbar">
                <span className="mob-sheet-title">Your order</span>
                <button
                  ref={closeRef}
                  type="button"
                  className="mob-sheet-close"
                  onClick={closeSheet}
                  aria-label="Close order panel"
                >
                  ✕
                </button>
              </div>

              {/* Reuse the same OrderPanel component */}
              <div className="mob-sheet-panel">
                <OrderPanel
                  restaurantId={restaurantId}
                  restaurantName={restaurantName}
                />
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}

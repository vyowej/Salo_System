import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

/**
 * SALO Modal Component
 *
 * @param {boolean} open
 * @param {function} onClose
 * @param {string}  title
 * @param {string}  size    - 'sm' | 'md' | 'lg' | 'xl'
 * @param {node}    footer
 */
export default function Modal({
  open,
  onClose,
  title,
  size = 'md',
  children,
  footer,
  hideClose = false,
}) {
  const panelRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  // Focus trap: move focus to modal on open
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`modal-panel modal-${size}`}
        ref={panelRef}
        tabIndex={-1}
        style={{ outline: 'none' }}
      >
        {/* Header */}
        {(title || !hideClose) && (
          <div className="modal-header">
            {title && <h2 className="modal-title">{title}</h2>}
            {!hideClose && (
              <button
                className="modal-close"
                onClick={onClose}
                aria-label="Close modal"
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="modal-body">{children}</div>

        {/* Footer */}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

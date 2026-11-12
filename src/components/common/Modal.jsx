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
  isOpen,
  onClose,
  title,
  size = 'md',
  children,
  footer,
  hideClose = false,
}) {
  const isVisible = Boolean(open ?? isOpen);
  const panelRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    if (!isVisible) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isVisible, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (isVisible) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [isVisible]);

  // Focus trap: move focus to modal on open
  useEffect(() => {
    if (isVisible && panelRef.current) {
      panelRef.current.focus();
    }
  }, [isVisible]);

  if (!isVisible) return null;

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

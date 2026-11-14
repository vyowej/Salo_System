import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './modal.css';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export default function Modal({
  open,
  isOpen,
  onClose,
  title,
  subtitle,
  headerExtra,
  size = 'md',
  isDirty = false,
  footer,
  hideClose = false,
  children,
}) {
  const visible = Boolean(open ?? isOpen);
  const titleId = useId();
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const attemptClose = useCallback(() => {
    if (isDirty) {
      setConfirmDiscard(true);
      return;
    }
    setConfirmDiscard(false);
    onClose?.();
  }, [isDirty, onClose]);

  useEffect(() => {
    if (!visible) return undefined;
    setConfirmDiscard(false);
    previousFocusRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      if (!dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        dialogRef.current.focus();
      }
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === 'function') {
        prev.focus();
      }
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        attemptClose();
        return;
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
          (el) => el.offsetParent !== null || el === document.activeElement,
        );
        if (!focusables.length) {
          event.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, attemptClose]);

  if (!visible) return null;

  return createPortal(
    <div
      className="admin-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          attemptClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className={`admin-modal admin-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        <header className="admin-modal__header">
          <div className="admin-modal__title-wrap">
            <div className="admin-modal__title-row">
              {title && <h2 id={titleId} className="admin-modal__title">{title}</h2>}
              {headerExtra}
            </div>
            {subtitle && <p className="admin-modal__subtitle">{subtitle}</p>}
          </div>
          {!hideClose && (
            <div className="admin-modal__header-actions">
              <button
                type="button"
                className="admin-modal__close"
                onClick={attemptClose}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>
          )}
        </header>

        {confirmDiscard && (
          <div className="admin-modal__dirty-banner" role="alert">
            <span>You have unsaved changes. Discard them and close?</span>
            <div className="admin-modal__dirty-actions">
              <button
                type="button"
                className="admin-action-button"
                onClick={() => setConfirmDiscard(false)}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="admin-action-button admin-action-button--danger"
                onClick={() => {
                  setConfirmDiscard(false);
                  onClose?.();
                }}
              >
                Discard changes
              </button>
            </div>
          </div>
        )}

        <div className="admin-modal__body">{children}</div>

        {footer && <footer className="admin-modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

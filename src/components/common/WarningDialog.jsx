import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import './ConfirmDialog.css';

/**
 * Reusable warning/alert modal dialog matching ConfirmDialog styling.
 */
export default function WarningDialog({
  open = false,
  title = 'Warning',
  message,
  confirmLabel = 'OK',
  onClose,
}) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef(null);
  const okBtnRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Capture the trigger element when opening and restore focus when closing
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
      const frame = requestAnimationFrame(() => {
        okBtnRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }

    const previous = previousFocusRef.current;
    if (previous && typeof previous.focus === 'function' && previous.isConnected) {
      previous.focus();
    }
    previousFocusRef.current = null;
    return undefined;
  }, [open]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape to close + Tab focus trap
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === first || !dialogRef.current.contains(document.activeElement)) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last || !dialogRef.current.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="confirm-dialog-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className="confirm-dialog-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div className="confirm-dialog-body">
          <div className="warning-dialog-header">
            <span className="warning-dialog-icon" aria-hidden="true">!</span>
            <h2 id={titleId} className="confirm-dialog-title">
              {title}
            </h2>
          </div>
          <p id={descId} className="confirm-dialog-message">
            {message}
          </p>
        </div>

        <div className="confirm-dialog-actions">
          <Button
            ref={okBtnRef}
            type="button"
            variant="primary"
            size="md"
            onClick={onClose}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

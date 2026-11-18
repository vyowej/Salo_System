import { useEffect, useRef, useState } from 'react';
import { ErrorMessage, FormGroup, HelperText, Label } from './FormElements';
import './FormElements.css';

/**
 * Reusable PasswordField with an independent per-field eye / eye-off toggle button.
 * - Preserves input focus and caret selection when toggled.
 * - Resets to hidden when `resetKey` increments (e.g. on form submit or tab switch).
 * - Hides Edge's native ::-ms-reveal icon via CSS.
 */
export function PasswordField({
  id,
  label,
  helper,
  error,
  required,
  size = 'md',
  className = '',
  resetKey = 0,
  disabled = false,
  ...props
}) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setVisible(false);
  }, [resetKey]);

  const handleToggleMouseDown = (event) => {
    // Prevent button press from stealing focus or blurring the input field
    event.preventDefault();
  };

  const handleToggleClick = () => {
    if (disabled) return;

    const inputEl = inputRef.current;
    const wasFocused =
      typeof document !== 'undefined' && inputEl && document.activeElement === inputEl;
    const selectionStart = inputEl?.selectionStart ?? null;
    const selectionEnd = inputEl?.selectionEnd ?? null;

    setVisible((prev) => !prev);

    if (wasFocused && inputEl) {
      const restoreCaret = () => {
        try {
          if (document.activeElement !== inputEl) {
            inputEl.focus({ preventScroll: true });
          }
          if (selectionStart !== null && selectionEnd !== null) {
            inputEl.setSelectionRange(selectionStart, selectionEnd);
          }
        } catch {
          // Ignore selection errors in non-standard environments
        }
      };

      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(restoreCaret);
      } else {
        setTimeout(restoreCaret, 0);
      }
    }
  };

  const sizeClass = size === 'sm' ? 'input-sm' : size === 'lg' ? 'input-lg' : '';
  const classes = [
    'input',
    'password-field-input',
    'has-password-toggle',
    sizeClass,
    error ? 'input-error' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <FormGroup>
      {label && (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      )}
      <div className="input-wrapper password-field-wrapper">
        <input
          ref={inputRef}
          id={id}
          type={visible ? 'text' : 'password'}
          className={classes}
          required={required}
          disabled={disabled}
          {...props}
        />
        <button
          type="button"
          className="password-field-toggle"
          onMouseDown={handleToggleMouseDown}
          onPointerDown={handleToggleMouseDown}
          onClick={handleToggleClick}
          disabled={disabled}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              data-icon="eye-off"
            >
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              data-icon="eye"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {helper && !error && <HelperText>{helper}</HelperText>}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </FormGroup>
  );
}

export default PasswordField;

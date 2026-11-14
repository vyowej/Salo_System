import { useId, useState } from 'react';
import Modal from './Modal';

export default function ConfirmModal({
  open,
  title = 'Confirm this action',
  message,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
  requireReason = false,
  reasonLabel = 'Reason for this action',
  reasonPlaceholder = 'Provide an audit reason...',
  requireReauthentication = false,
  onConfirm,
  onClose,
  children,
}) {
  const formId = useId();
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  function handleClose() {
    setPassword('');
    setReason('');
    setError('');
    onClose?.();
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (requireReauthentication && !password.trim()) {
      setError('Password confirmation is required.');
      return;
    }
    if (requireReason && !reason.trim()) {
      setError('Please enter a reason before continuing.');
      return;
    }
    onConfirm?.({ password: password.trim(), reason: reason.trim() });
    handleClose();
  }

  const bodyText = message ?? description;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      size="sm"
      footer={(
        <>
          <button type="button" className="admin-action-button" onClick={handleClose}>
            {cancelLabel}
          </button>
          <button
            type="submit"
            form={formId}
            className={`admin-action-button ${danger ? 'admin-action-button--danger' : ''}`}
          >
            {confirmLabel}
          </button>
        </>
      )}
    >
      <form id={formId} className="admin-modal-form" onSubmit={handleSubmit}>
        {bodyText && <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{bodyText}</p>}
        {children}
        {requireReauthentication && (
          <div className="admin-modal-field">
            <label htmlFor={`${formId}-password`}>Re-enter your password</label>
            <input
              id={`${formId}-password`}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError('');
              }}
              required
            />
          </div>
        )}
        {requireReason && (
          <div className="admin-modal-field">
            <label htmlFor={`${formId}-reason`}>{reasonLabel}</label>
            <textarea
              id={`${formId}-reason`}
              value={reason}
              placeholder={reasonPlaceholder}
              onChange={(event) => {
                setReason(event.target.value);
                setError('');
              }}
              required
            />
          </div>
        )}
        {error && <p className="admin-modal-field__error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

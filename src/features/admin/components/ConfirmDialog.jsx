import { useState } from 'react';
import Button from '../../../components/common/Button';
import { Input } from '../../../components/forms';
import Modal from '../../../components/common/Modal';

export default function ConfirmDialog({
  open,
  title = 'Confirm this action',
  description,
  confirmLabel = 'Confirm',
  onConfirm,
  onClose,
  requireReauthentication = false,
  requireReason = false,
  children,
}) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');

  function close() {
    setPassword('');
    setReason('');
    onClose?.();
  }

  function submit(event) {
    event.preventDefault();
    if (requireReauthentication && !password.trim()) return;
    if (requireReason && !reason.trim()) return;
    onConfirm?.({ password, reason });
    close();
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={close}
      size="sm"
      footer={(
        <div className="admin-page-header__actions">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="danger" onClick={submit}>{confirmLabel}</Button>
        </div>
      )}
    >
      <form onSubmit={submit}>
        {description && <p>{description}</p>}
        {children}
        {requireReauthentication && (
          <Input id="confirm-password" label="Re-enter your password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        )}
        {requireReauthentication && <p role="note">Demo confirmation checks that a password was entered; it does not authenticate against a server.</p>}
        {requireReason && (
          <Input id="confirm-reason" label="Reason for this action" value={reason} onChange={(event) => setReason(event.target.value)} required />
        )}
      </form>
    </Modal>
  );
}

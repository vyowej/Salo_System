import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { useAuth } from '../../hooks/useAuth';
import accountService from '../../services/accountService';

export function AccountLifecycleModals({
  deactivateOpen,
  onCloseDeactivate,
  deleteOpen,
  onCloseDelete,
  onNotice,
}) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleDeactivate = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await accountService.deactivateAccount(reason.trim());
      onCloseDeactivate?.();
      setReason('');
      await logout?.();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err?.message || 'Unable to deactivate your account right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRequest = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await accountService.requestDeletion(reason.trim());
      onCloseDelete?.();
      setReason('');
      onNotice?.('Your account deletion request has been submitted for administrator review.');
    } catch (err) {
      setError(err?.message || 'Unable to submit your account deletion request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        open={Boolean(deactivateOpen)}
        onClose={submitting ? undefined : () => { setError(''); onCloseDeactivate?.(); }}
        title="Deactivate account"
        size="sm"
        footer={(
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={submitting}
              onClick={() => { setError(''); onCloseDeactivate?.(); }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={submitting}
              onClick={handleDeactivate}
            >
              Confirm deactivation
            </Button>
          </div>
        )}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Deactivating your account will sign you out and disable login access until you request reactivation.
            Past orders, deliveries, and audit records are safely preserved.
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            <span>Reason (optional)</span>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tell us why you are deactivating your account"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-primary)',
                background: 'var(--input-bg)',
                color: 'var(--text-primary)',
                font: 'inherit',
              }}
            />
          </label>
          {error && (
            <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-danger, #b91c1c)' }} role="alert">
              {error}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteOpen)}
        onClose={submitting ? undefined : () => { setError(''); onCloseDelete?.(); }}
        title="Request account deletion"
        size="sm"
        footer={(
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={submitting}
              onClick={() => { setError(''); onCloseDelete?.(); }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={submitting}
              onClick={handleDeleteRequest}
            >
              Submit deletion request
            </Button>
          </div>
        )}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Account deletion requests are reviewed by a SALO administrator. Once approved, your account login is permanently disabled while required financial, order, and audit records remain archived.
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            <span>Reason for deletion (optional)</span>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional details for the administrator"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-primary)',
                background: 'var(--input-bg)',
                color: 'var(--text-primary)',
                font: 'inherit',
              }}
            />
          </label>
          {error && (
            <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-danger, #b91c1c)' }} role="alert">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import { useServerCountdown } from '../../../hooks/useServerCountdown';
import './IncomingCallModal.css';

export default function IncomingCallModal({
  pendingCall,
  serverNow,
  riderName,
  orderReference,
  busy = false,
  error = '',
  onAccept,
  onDecline,
  onExpire,
}) {
  const secondsLeft = useServerCountdown(
    pendingCall?.expires_at,
    serverNow,
    onExpire,
  );

  const isOpen = Boolean(pendingCall) && secondsLeft > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      closeOnBackdrop={false}
      closeOnEscape={false}
      title="Incoming Call"
    >
      <div className="incoming-call-modal">
        <div className="incoming-call-pulse" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </div>

        <h3 className="incoming-call-heading">Your rider is calling you</h3>
        <p className="incoming-call-sub">
          {riderName ? `${riderName} is at your drop-off` : 'Your rider is at your drop-off'}
          {orderReference ? ` · ${orderReference}` : ''}
        </p>

        <div className="incoming-call-timer" role="timer" aria-live="polite">
          <span>Respond within</span>
          <strong>{secondsLeft}s</strong>
        </div>

        <p className="incoming-call-note">
          In-app call request only — no voice audio connection is included.
        </p>

        {error && (
          <p className="incoming-call-error" role="alert">
            {error}
          </p>
        )}

        <div className="incoming-call-actions">
          <Button
            variant="outline"
            fullWidth
            disabled={busy}
            onClick={onDecline}
          >
            {busy ? 'Please wait…' : 'Decline'}
          </Button>
          <Button
            variant="primary"
            fullWidth
            disabled={busy}
            onClick={onAccept}
          >
            {busy ? 'Connecting…' : 'Accept'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

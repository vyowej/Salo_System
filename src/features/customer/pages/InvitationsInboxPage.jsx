import { useCallback, useEffect, useState } from 'react';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { StateView } from '../../../components/feedback';
import { useAuth } from '../../../hooks/useAuth';
import CustomerLayout from '../../../layouts/CustomerLayout';
import staffInvitationService, { executeAcceptStaffInvitation } from '../../../services/staffInvitationService';
import { formatDateTimeManila } from '../../../utils/format';
import './InvitationsInboxPage.css';

const STATUS_BADGE_MAP = {
  pending: { label: 'Awaiting response', variant: 'info' },
  accepted: { label: 'Accepted', variant: 'completed' },
  declined: { label: 'Declined', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'default' },
  expired: { label: 'Expired', variant: 'default' },
};

export default function InvitationsInboxPage() {
  const { refreshUser } = useAuth();
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submittingId, setSubmittingId] = useState(null);
  const [retryingRefresh, setRetryingRefresh] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);

  const loadInvitations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await staffInvitationService.getStaffInvitations();
      setInvitations(list);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unable to load staff invitations.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const pendingCount = invitations.filter((inv) => inv.status === 'pending').length;

  const handleRetryRefreshUser = async () => {
    if (retryingRefresh || typeof refreshUser !== 'function') return;
    setRetryingRefresh(true);
    try {
      await refreshUser();
      setFeedback({
        tone: 'success',
        message: 'Account roles refreshed. Your new restaurant staff workspace is now available in the account switcher.',
        needsRefreshRetry: false,
      });
    } catch {
      setFeedback((prev) => ({
        tone: 'warning',
        message: prev?.message || 'Invitation accepted, but we could not refresh your account roles yet. Please try again or reload the page.',
        needsRefreshRetry: true,
      }));
    } finally {
      setRetryingRefresh(false);
    }
  };

  const handleDecision = async (invitation, action) => {
    if (!invitation || submittingId !== null) return;

    setSubmittingId(invitation.id);
    setFeedback(null);

    try {
      if (action === 'accept') {
        const result = await executeAcceptStaffInvitation({
          invitationId: invitation.id,
          acceptFn: staffInvitationService.acceptStaffInvitation,
          refreshUserFn: refreshUser,
          reloadInvitationsFn: loadInvitations,
        });

        if (result.userRefreshed) {
          setFeedback({
            tone: 'success',
            message: `You accepted the staff invitation to ${invitation.restaurant_name} as ${invitation.staff_position}.`,
            needsRefreshRetry: false,
          });
        } else {
          setFeedback({
            tone: 'warning',
            message: `You accepted the staff invitation to ${invitation.restaurant_name} as ${invitation.staff_position}, but we could not refresh your account roles yet.`,
            needsRefreshRetry: true,
          });
        }
      } else {
        await staffInvitationService.declineStaffInvitation(invitation.id);
        setFeedback({
          tone: 'info',
          message: `You declined the staff invitation from ${invitation.restaurant_name}.`,
          needsRefreshRetry: false,
        });
        await loadInvitations();
      }
    } catch (err) {
      setFeedback({
        tone: 'error',
        message: err?.message || 'Unable to update this invitation. Please refresh and try again.',
        needsRefreshRetry: false,
      });
      await loadInvitations();
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <CustomerLayout>
      <main className="customer-invitations-page">
        {feedback && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginBottom: 16,
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-primary)',
              background: feedback.tone === 'error' ? 'var(--danger-subtle, #fdecea)' : 'var(--surface-secondary)',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span>{feedback.message}</span>
            {feedback.needsRefreshRetry && (
              <Button
                variant="outline"
                size="sm"
                disabled={retryingRefresh}
                onClick={handleRetryRefreshUser}
              >
                {retryingRefresh ? 'Refreshing…' : 'Refresh account roles'}
              </Button>
            )}
          </div>
        )}

        {loading && invitations.length === 0 ? (
          <StateView state="loading" title="Loading invitations..." />
        ) : error ? (
          <StateView
            state="error"
            title="Unable to load invitations"
            description={error.message || 'Please check your connection and try again.'}
            action={(
              <Button variant="primary" size="sm" onClick={() => loadInvitations()}>
                Retry
              </Button>
            )}
          />
        ) : invitations.length === 0 ? (
          <StateView
            state="empty"
            title="You're all caught up"
            description="Invitations to join a restaurant team will appear here."
          />
        ) : (
          <>
            <div className="customer-invitation-list" aria-live="polite">
              {invitations.map((invitation) => {
                const badgeInfo = STATUS_BADGE_MAP[invitation.status] || {
                  label: invitation.status,
                  variant: 'default',
                };
                const isPending = invitation.status === 'pending';
                const isSubmitting = submittingId === invitation.id;

                return (
                  <article
                    key={invitation.id}
                    className="customer-invitation-card staff"
                  >
                    <div className="customer-invitation-main">
                      <div className="customer-invitation-top">
                        <div className="customer-invitation-title-group">
                          <span className="customer-invitation-mark" aria-hidden="true">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                              <circle cx="8.5" cy="7" r="4" />
                              <line x1="20" y1="8" x2="20" y2="14" />
                              <line x1="23" y1="11" x2="17" y2="11" />
                            </svg>
                          </span>
                          <span className="customer-invitation-type">STAFF INVITATION</span>
                          <h2>{invitation.restaurant_name}</h2>
                        </div>

                        <Badge variant={badgeInfo.variant} size="sm">
                          {badgeInfo.label}
                        </Badge>
                      </div>

                      <p className="customer-invitation-meta">
                        Invited by <strong>{invitation.invited_by_first_name || 'Restaurant owner'}</strong>
                        {' · '}
                        {invitation.staff_position}
                        {invitation.invited_at ? ` · ${formatDateTimeManila(invitation.invited_at)}` : ''}
                      </p>

                      {invitation.invitation_note && (
                        <p className="customer-invitation-meta" style={{ marginTop: 4 }}>
                          Note: {invitation.invitation_note}
                        </p>
                      )}

                      <div className="customer-invitation-bottom">
                        <div className="customer-invitation-chips">
                          <span className="customer-invitation-chip">
                            Role: {invitation.staff_position}
                          </span>
                          {invitation.expires_at && (
                            <span className="customer-invitation-chip">
                              Expires: {formatDateTimeManila(invitation.expires_at)}
                            </span>
                          )}
                        </div>

                        {isPending && (
                          <div className="customer-invitation-actions">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={submittingId !== null}
                              onClick={() => handleDecision(invitation, 'decline')}
                            >
                              {isSubmitting ? 'Working…' : 'Decline'}
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={submittingId !== null}
                              onClick={() => setConfirmTarget(invitation)}
                            >
                              {isSubmitting ? 'Working…' : 'Accept invitation'}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="customer-invitations-count" aria-live="polite">
              {pendingCount} {pendingCount === 1 ? 'invitation' : 'invitations'} awaiting response
            </p>
          </>
        )}
      </main>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title="Accept staff invitation?"
        message={confirmTarget ? `Accepting this invitation will add you to ${confirmTarget.restaurant_name} as ${confirmTarget.staff_position}.` : ''}
        confirmLabel="Accept invitation"
        cancelLabel="Cancel"
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => {
          const target = confirmTarget;
          setConfirmTarget(null);
          if (target) {
            handleDecision(target, 'accept');
          }
        }}
      />
    </CustomerLayout>
  );
}

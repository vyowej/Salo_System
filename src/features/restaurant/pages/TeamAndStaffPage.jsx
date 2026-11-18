import { useCallback, useEffect, useState } from 'react';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import Card from '../../../components/common/Card';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { StateView } from '../../../components/feedback';
import OwnerLayout from '../../../layouts/OwnerLayout';
import staffInvitationService, { STAFF_POSITIONS } from '../../../services/staffInvitationService';
import { formatDateTimeManila } from '../../../utils/format';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import './team/TeamAndStaffPage.css';

const STAFF_STATUS_BADGE = {
  pending: { label: 'Pending', variant: 'info' },
  accepted: { label: 'Active', variant: 'completed' },
  active: { label: 'Active', variant: 'completed' },
  declined: { label: 'Declined', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'default' },
  expired: { label: 'Expired', variant: 'default' },
  inactive: { label: 'Inactive', variant: 'default' },
};

export default function TeamAndStaffPage() {
  const access = useRestaurantAccess();
  const selectedRestaurant = access.selectedRestaurant;
  const restaurantId = selectedRestaurant?.id ? Number(selectedRestaurant.id) : null;
  const isOwner = Boolean(access.isOwner);
  const isActiveRestaurant = selectedRestaurant?.status === 'active';

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [identifier, setIdentifier] = useState('');
  const [staffPosition, setStaffPosition] = useState(STAFF_POSITIONS[1]); // Order Handler
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  const loadStaff = useCallback(async () => {
    if (!restaurantId || !isOwner || !isActiveRestaurant) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await staffInvitationService.getRestaurantStaff(restaurantId);
      setStaff(result.staff);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unable to load restaurant team.'));
    } finally {
      setLoading(false);
    }
  }, [restaurantId, isOwner, isActiveRestaurant]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const handleInviteSubmit = async (event) => {
    event.preventDefault();
    if (sending || !restaurantId) return;

    const cleanIdentifier = identifier.trim();
    if (!cleanIdentifier) {
      setFeedback({ tone: 'error', message: 'Please enter a username or email address.' });
      return;
    }

    setSending(true);
    setFeedback(null);
    try {
      const result = await staffInvitationService.sendStaffInvitation({
        restaurant_id: restaurantId,
        identifier: cleanIdentifier,
        staff_position: staffPosition,
        note,
      });
      setFeedback({ tone: 'success', message: result.message });
      setIdentifier('');
      setNote('');
      await loadStaff();
    } catch (err) {
      const firstValidationError = err?.errors
        ? Object.values(err.errors).flat()[0]
        : null;
      setFeedback({
        tone: 'error',
        message: firstValidationError || err?.message || 'Unable to send invitation.',
      });
    } finally {
      setSending(false);
    }
  };

  const handleConfirmCancel = async () => {
    const target = cancelTarget;
    setCancelTarget(null);
    if (!target || cancellingId !== null) return;

    setCancellingId(target.id);
    setFeedback(null);
    try {
      await staffInvitationService.cancelStaffInvitation(target.id);
      setFeedback({
        tone: 'info',
        message: `Cancelled pending invitation for ${target.first_name || target.username}.`,
      });
      await loadStaff();
    } catch (err) {
      setFeedback({
        tone: 'error',
        message: err?.message || 'Unable to cancel this invitation.',
      });
      await loadStaff();
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <OwnerLayout>
      <div className="team-page" style={{ padding: 'var(--space-4) 0' }}>
        {!isOwner ? (
          <StateView
            state="empty"
            title="Owner access required"
            description="Only restaurant owners can invite staff and manage team invitations."
          />
        ) : !isActiveRestaurant ? (
          <StateView
            state="empty"
            title="Restaurant not active yet"
            description="Staff invitations are available once your restaurant application is approved and active."
          />
        ) : (
          <>
            {feedback && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  marginBottom: 'var(--space-4)',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-primary)',
                  background: feedback.tone === 'error' ? 'var(--danger-subtle, #fdecea)' : 'var(--surface-secondary)',
                  color: 'var(--text-primary)',
                }}
              >
                {feedback.message}
              </div>
            )}

            <Card style={{ marginBottom: 'var(--space-4)' }}>
              <form onSubmit={handleInviteSubmit} style={{ display: 'grid', gap: 'var(--space-3)' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>Invite Staff Member</h2>
                  <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                    Invite an existing SALO user by username or email.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
                  <label className="team-field" style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Username or Email</span>
                    <input
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="username or email@example.com"
                      disabled={sending}
                      required
                    />
                  </label>

                  <label className="team-field" style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Staff Position</span>
                    <select
                      value={staffPosition}
                      onChange={(e) => setStaffPosition(e.target.value)}
                      disabled={sending}
                    >
                      {STAFF_POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>{pos}</option>
                      ))}
                    </select>
                  </label>

                  <label className="team-field" style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Optional Note</span>
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Welcome to the team"
                      maxLength={500}
                      disabled={sending}
                    />
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="submit" variant="primary" size="sm" disabled={sending}>
                    {sending ? 'Sending…' : 'Send Invitation'}
                  </Button>
                </div>
              </form>
            </Card>

            {loading && staff.length === 0 ? (
              <StateView state="loading" title="Loading team & invitations..." />
            ) : error ? (
              <StateView
                state="error"
                title="Unable to load restaurant team"
                description={error.message || 'Please check your connection and try again.'}
                action={(
                  <Button variant="primary" size="sm" onClick={() => loadStaff()}>
                    Retry
                  </Button>
                )}
              />
            ) : staff.length === 0 ? (
              <StateView
                state="empty"
                title="No staff members or invitations yet"
                description="Send an invitation above to add staff to your restaurant team."
              />
            ) : (
              <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                {staff.map((member) => {
                  const badge = STAFF_STATUS_BADGE[member.status] || {
                    label: member.status,
                    variant: 'default',
                  };
                  const isPending = member.status === 'pending';
                  const fullName = `${member.first_name} ${member.last_name}`.trim() || member.username;

                  return (
                    <Card key={member.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <strong>{fullName}</strong>
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                              @{member.username}
                            </span>
                            <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
                          </div>
                          <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                            Position: <strong>{member.staff_position}</strong>
                            {member.invited_at ? ` · Invited ${formatDateTimeManila(member.invited_at)}` : ''}
                            {isPending && member.expires_at ? ` · Expires ${formatDateTimeManila(member.expires_at)}` : ''}
                            {member.joined_at ? ` · Joined ${formatDateTimeManila(member.joined_at)}` : ''}
                          </p>
                          {member.invitation_note && (
                            <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                              Note: {member.invitation_note}
                            </p>
                          )}
                        </div>

                        {isPending && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={cancellingId === member.id}
                            onClick={() => setCancelTarget(member)}
                          >
                            {cancellingId === member.id ? 'Cancelling…' : 'Cancel invitation'}
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel staff invitation?"
        message={cancelTarget ? `Cancel the pending ${cancelTarget.staff_position} invitation for @${cancelTarget.username}?` : ''}
        confirmLabel="Cancel invitation"
        cancelLabel="Keep pending"
        onClose={() => setCancelTarget(null)}
        onConfirm={handleConfirmCancel}
      />
    </OwnerLayout>
  );
}

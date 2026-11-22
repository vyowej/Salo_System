import { useCallback, useEffect, useMemo, useState } from 'react';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import Card from '../../../components/common/Card';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { StateView } from '../../../components/feedback';
import OwnerLayout from '../../../layouts/OwnerLayout';
import staffInvitationService, { STAFF_POSITIONS } from '../../../services/staffInvitationService';
import { formatDateTimeManila } from '../../../utils/format';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import { TEAM_STAFF_COPY } from '../content/teamContent';
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
  const selectedBranchLabel = selectedRestaurant?.displayName || selectedRestaurant?.name || '';
  const isOwner = Boolean(access.isOwner);
  const isActiveRestaurant = selectedRestaurant?.status === 'active';
  const hasMultipleBranches = Boolean(access.hasMultipleBranches || access.restaurants.length > 1);

  const availablePositions = useMemo(() => {
    const serverPositions = access.user?.staff_positions;
    return Array.isArray(serverPositions) && serverPositions.length > 0 ? serverPositions : STAFF_POSITIONS;
  }, [access.user?.staff_positions]);

  const [allBranches, setAllBranches] = useState(false);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [identifier, setIdentifier] = useState('');
  const [staffPosition, setStaffPosition] = useState(() => availablePositions[1] || availablePositions[0] || '');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [editingPositions, setEditingPositions] = useState({});
  const [updatingId, setUpdatingId] = useState(null);

  const loadStaff = useCallback(async () => {
    if (!restaurantId || !isOwner || !isActiveRestaurant) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await staffInvitationService.getRestaurantStaff(restaurantId, { allBranches });
      setStaff(result.staff);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(TEAM_STAFF_COPY.loadErrorFallback));
    } finally {
      setLoading(false);
    }
  }, [restaurantId, isOwner, isActiveRestaurant, allBranches]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const handleInviteSubmit = async (event) => {
    event.preventDefault();
    if (sending || !restaurantId) return;

    const cleanIdentifier = identifier.trim();
    if (!cleanIdentifier) {
      setFeedback({ tone: 'error', message: TEAM_STAFF_COPY.identifierRequiredError });
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
        message: firstValidationError || err?.message || TEAM_STAFF_COPY.inviteFallbackError,
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
        message: TEAM_STAFF_COPY.cancelSuccess(target.first_name || target.username),
      });
      await loadStaff();
    } catch (err) {
      setFeedback({
        tone: 'error',
        message: err?.message || TEAM_STAFF_COPY.cancelFallbackError,
      });
      await loadStaff();
    } finally {
      setCancellingId(null);
    }
  };

  const handleUpdatePosition = async (member) => {
    const nextPosition = editingPositions[member.id] ?? member.staff_position;
    if (!nextPosition || nextPosition === member.staff_position || updatingId !== null) return;

    setUpdatingId(member.id);
    setFeedback(null);
    try {
      await staffInvitationService.updateStaffPosition(member.id, nextPosition);
      setFeedback({
        tone: 'success',
        message: TEAM_STAFF_COPY.updatePositionSuccess(member.first_name || member.username, nextPosition),
      });
      await loadStaff();
    } catch (err) {
      setFeedback({
        tone: 'error',
        message: err?.message || TEAM_STAFF_COPY.updatePositionError,
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleConfirmRemove = async () => {
    const target = removeTarget;
    setRemoveTarget(null);
    if (!target || removingId !== null) return;

    setRemovingId(target.id);
    setFeedback(null);
    try {
      await staffInvitationService.removeStaffMember(target.id);
      setFeedback({
        tone: 'info',
        message: TEAM_STAFF_COPY.removeSuccess(
          target.first_name || target.username,
          target.display_name || selectedBranchLabel,
        ),
      });
      await loadStaff();
    } catch (err) {
      setFeedback({
        tone: 'error',
        message: err?.message || TEAM_STAFF_COPY.removeFallbackError,
      });
      await loadStaff();
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <OwnerLayout>
      <div className="team-page" style={{ padding: 'var(--space-4) 0' }}>
        {!isOwner ? (
          <StateView
            state="empty"
            title={TEAM_STAFF_COPY.ownerRequiredTitle}
            description={TEAM_STAFF_COPY.ownerRequiredDescription}
          />
        ) : !isActiveRestaurant ? (
          <StateView
            state="empty"
            title={TEAM_STAFF_COPY.inactiveTitle}
            description={TEAM_STAFF_COPY.inactiveDescription}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>{TEAM_STAFF_COPY.inviteTitle}</h2>
                    <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                      {TEAM_STAFF_COPY.inviteSubtitle}
                    </p>
                  </div>
                  {selectedBranchLabel && (
                    <Badge variant="info" size="sm">
                      {TEAM_STAFF_COPY.targetBranchPrefix} {selectedBranchLabel}
                    </Badge>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
                  <label className="team-field" style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>{TEAM_STAFF_COPY.identifierLabel}</span>
                    <input
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={TEAM_STAFF_COPY.identifierPlaceholder}
                      disabled={sending}
                      required
                    />
                  </label>

                  <label className="team-field" style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>{TEAM_STAFF_COPY.positionLabel}</span>
                    <select
                      value={staffPosition}
                      onChange={(e) => setStaffPosition(e.target.value)}
                      disabled={sending}
                    >
                      {availablePositions.map((pos) => (
                        <option key={pos} value={pos}>{pos}</option>
                      ))}
                    </select>
                  </label>

                  <label className="team-field" style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>{TEAM_STAFF_COPY.noteLabel}</span>
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={TEAM_STAFF_COPY.notePlaceholder}
                      maxLength={500}
                      disabled={sending}
                    />
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="submit" variant="primary" size="sm" disabled={sending}>
                    {sending ? TEAM_STAFF_COPY.sendingButton : TEAM_STAFF_COPY.sendButton}
                  </Button>
                </div>
              </form>
            </Card>

            {hasMultipleBranches && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 'var(--space-3)',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                  {allBranches ? TEAM_STAFF_COPY.allBranchesViewLabel : selectedBranchLabel}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    type="button"
                    size="sm"
                    variant={!allBranches ? 'primary' : 'outline'}
                    onClick={() => setAllBranches(false)}
                  >
                    {TEAM_STAFF_COPY.selectedBranchViewLabel}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={allBranches ? 'primary' : 'outline'}
                    onClick={() => setAllBranches(true)}
                  >
                    {TEAM_STAFF_COPY.allBranchesViewLabel}
                  </Button>
                </div>
              </div>
            )}

            {loading && staff.length === 0 ? (
              <StateView state="loading" title={TEAM_STAFF_COPY.loadingTitle} />
            ) : error ? (
              <StateView
                state="error"
                title={TEAM_STAFF_COPY.loadErrorTitle}
                description={error.message || TEAM_STAFF_COPY.loadErrorFallback}
                action={(
                  <Button variant="primary" size="sm" onClick={() => loadStaff()}>
                    {TEAM_STAFF_COPY.retryButton}
                  </Button>
                )}
              />
            ) : staff.length === 0 ? (
              <StateView
                state="empty"
                title={TEAM_STAFF_COPY.emptyTitle}
                description={allBranches ? TEAM_STAFF_COPY.emptyAllBranchesDescription : TEAM_STAFF_COPY.emptyDescription}
              />
            ) : (
              <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                {staff.map((member) => {
                  const badge = STAFF_STATUS_BADGE[member.status] || {
                    label: member.status,
                    variant: 'default',
                  };
                  const isPending = member.status === 'pending';
                  const isActiveMember = member.status === 'accepted' || member.status === 'active';
                  const canMutateRow = !allBranches || member.restaurant_id === restaurantId;
                  const fullName = `${member.first_name} ${member.last_name}`.trim() || member.username;
                  const draftPosition = editingPositions[member.id] ?? member.staff_position;

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
                            {allBranches && (member.display_name || member.branch_name) && (
                              <Badge variant="default" size="sm">
                                {TEAM_STAFF_COPY.branchColumnLabel}: {member.branch_name || member.display_name}
                              </Badge>
                            )}
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

                        {canMutateRow && (isPending || isActiveMember) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <select
                              aria-label={`${TEAM_STAFF_COPY.positionLabel} for ${fullName}`}
                              value={draftPosition}
                              disabled={updatingId === member.id}
                              onChange={(e) => setEditingPositions((prev) => ({ ...prev, [member.id]: e.target.value }))}
                              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-primary)' }}
                            >
                              {availablePositions.map((pos) => (
                                <option key={pos} value={pos}>{pos}</option>
                              ))}
                            </select>
                            {draftPosition !== member.staff_position && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={updatingId === member.id}
                                onClick={() => handleUpdatePosition(member)}
                              >
                                {updatingId === member.id
                                  ? TEAM_STAFF_COPY.updatingPositionButton
                                  : TEAM_STAFF_COPY.updatePositionButton}
                              </Button>
                            )}
                            {isPending && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={cancellingId === member.id}
                                onClick={() => setCancelTarget(member)}
                              >
                                {cancellingId === member.id
                                  ? TEAM_STAFF_COPY.cancellingButton
                                  : TEAM_STAFF_COPY.cancelButton}
                              </Button>
                            )}
                            {isActiveMember && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={removingId === member.id}
                                onClick={() => setRemoveTarget(member)}
                              >
                                {removingId === member.id
                                  ? TEAM_STAFF_COPY.removingButton
                                  : TEAM_STAFF_COPY.removeButton}
                              </Button>
                            )}
                          </div>
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
        title={TEAM_STAFF_COPY.cancelDialogTitle}
        message={cancelTarget ? TEAM_STAFF_COPY.cancelDialogMessage(cancelTarget.staff_position, cancelTarget.username) : ''}
        confirmLabel={TEAM_STAFF_COPY.cancelDialogConfirm}
        cancelLabel={TEAM_STAFF_COPY.cancelDialogKeep}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleConfirmCancel}
      />

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title={TEAM_STAFF_COPY.removeDialogTitle}
        message={
          removeTarget
            ? TEAM_STAFF_COPY.removeDialogMessage(
                `${removeTarget.first_name} ${removeTarget.last_name}`.trim() || removeTarget.username,
                removeTarget.username,
                removeTarget.display_name || selectedBranchLabel,
              )
            : ''
        }
        confirmLabel={TEAM_STAFF_COPY.removeDialogConfirm}
        cancelLabel={TEAM_STAFF_COPY.removeDialogCancel}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleConfirmRemove}
      />
    </OwnerLayout>
  );
}

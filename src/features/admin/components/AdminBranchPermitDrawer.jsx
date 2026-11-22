import { useCallback, useEffect, useState } from 'react';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import { Textarea } from '../../../components/forms';
import adminApiService from '../../../services/adminApiService';
import { formatDateTime } from '../utils/format';
import {
  getAdminBranchPermitBadge,
  getAvailableAdminPermitActions,
  mapAdminPermitActionError,
  validateAdminPermitActionNote,
} from '../utils/branchPermitAdminUtils';

export default function AdminBranchPermitDrawer({
  open,
  permitId,
  onClose,
  onUpdated,
}) {
  const [permit, setPermit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [submittingAction, setSubmittingAction] = useState('');
  const [pendingNoteAction, setPendingNoteAction] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [openingFile, setOpeningFile] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!open || !permitId) return;
    setLoading(true);
    setError('');
    setActionError('');
    try {
      const detail = await adminApiService.getBranchPermitDetail(permitId);
      setPermit(detail);
    } catch (err) {
      setError(err?.message || 'Unable to load branch permit details.');
    } finally {
      setLoading(false);
    }
  }, [open, permitId]);

  useEffect(() => {
    if (!open) {
      setPendingNoteAction(null);
      setReviewNote('');
      setActionError('');
      return;
    }
    loadDetail();
  }, [open, loadDetail]);

  const handleOpenFile = async () => {
    if (!permit?.has_file || openingFile) return;
    const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
    setOpeningFile(true);
    setActionError('');
    try {
      const blob = await adminApiService.fetchBranchPermitFileBlob(permit.permit_id);
      const blobUrl = URL.createObjectURL(blob);
      if (popup && !popup.closed) {
        popup.location.href = blobUrl;
      } else {
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err) {
      if (popup && !popup.closed) popup.close();
      setActionError(err?.message || 'Unable to open permit file.');
    } finally {
      setOpeningFile(false);
    }
  };

  const executeAction = async (action, note = '') => {
    if (!permit || submittingAction) return;
    const noteErr = validateAdminPermitActionNote(action, note);
    if (noteErr) {
      setActionError(noteErr);
      return;
    }

    setSubmittingAction(action);
    setActionError('');
    try {
      const updated = await adminApiService.reviewBranchPermitAction(permit.permit_id, action, {
        review_note: note.trim() || null,
      });
      setPermit(updated);
      setPendingNoteAction(null);
      setReviewNote('');
      onUpdated?.(updated);
    } catch (err) {
      setActionError(mapAdminPermitActionError(err));
    } finally {
      setSubmittingAction('');
    }
  };

  const badge = permit ? getAdminBranchPermitBadge(permit.permit_status) : null;
  const availableActions = getAvailableAdminPermitActions(permit);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={permit ? `Branch Permit — ${permit.display_name}` : 'Branch Permit Review'}
      description={permit ? `Brand: ${permit.brand_name} · Owner/Applicant: ${permit.owner_name || '—'}` : undefined}
      size="lg"
      footer={(
        <Button type="button" variant="secondary" onClick={onClose} disabled={Boolean(submittingAction)}>
          Close
        </Button>
      )}
    >
      {loading ? (
        <p style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>Loading branch permit details...</p>
      ) : error ? (
        <div role="alert" style={{ color: 'var(--salo-error, #b91c1c)', fontSize: 'var(--font-size-sm)' }}>
          {error}
        </div>
      ) : permit ? (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                {permit.is_required_locally ? 'Permit file required' : 'Local exemption declared'}
              </span>
            </div>
            {permit.has_file && (
              <Button type="button" variant="outline" size="sm" loading={openingFile} onClick={handleOpenFile}>
                {openingFile ? 'Opening...' : 'View submitted permit'}
              </Button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)' }}>
            <div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Brand</div>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{permit.brand_name || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Branch</div>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{permit.branch_name || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Owner / Applicant</div>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{permit.owner_name || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Submitted</div>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>{permit.uploaded_at ? formatDateTime(permit.uploaded_at) : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Last Reviewed</div>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>
                {permit.reviewed_at ? `${formatDateTime(permit.reviewed_at)}${permit.reviewed_by_name ? ` by ${permit.reviewed_by_name}` : ''}` : '—'}
              </div>
            </div>
          </div>

          {!permit.is_required_locally && permit.exemption_reason && (
            <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-secondary)' }}>
              <strong style={{ fontSize: 'var(--font-size-xs)', display: 'block', marginBottom: 4 }}>Exemption Explanation</strong>
              <p style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>{permit.exemption_reason}</p>
            </div>
          )}

          {permit.review_note && (
            <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-warning, #f59e0b)', background: 'var(--bg-warning-subtle, rgba(245,158,11,0.08))' }}>
              <strong style={{ fontSize: 'var(--font-size-xs)', display: 'block', marginBottom: 4 }}>Current Review Note</strong>
              <p style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>{permit.review_note}</p>
            </div>
          )}

          {actionError && (
            <div role="alert" style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', fontSize: 'var(--font-size-sm)' }}>
              {actionError}
            </div>
          )}

          {pendingNoteAction ? (
            <div style={{ display: 'grid', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
              <label htmlFor="admin-permit-review-note" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                Review note for {pendingNoteAction.label} (10–500 characters)
              </label>
              <Textarea
                id="admin-permit-review-note"
                value={reviewNote}
                rows={3}
                maxLength={500}
                placeholder="Provide a clear reason or instruction (10–500 characters)..."
                onChange={(e) => {
                  setReviewNote(e.target.value);
                  setActionError('');
                }}
              />
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <Button
                  type="button"
                  variant={pendingNoteAction.variant}
                  size="sm"
                  loading={submittingAction === pendingNoteAction.action}
                  onClick={() => executeAction(pendingNoteAction.action, reviewNote)}
                >
                  Confirm {pendingNoteAction.label}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={Boolean(submittingAction)}
                  onClick={() => {
                    setPendingNoteAction(null);
                    setReviewNote('');
                    setActionError('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : availableActions.length > 0 ? (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {availableActions.map((act) => (
                <Button
                  key={act.action}
                  type="button"
                  variant={act.variant}
                  size="sm"
                  loading={submittingAction === act.action}
                  disabled={Boolean(submittingAction)}
                  onClick={() => {
                    setActionError('');
                    if (act.requiresNote) {
                      setPendingNoteAction(act);
                      setReviewNote('');
                    } else {
                      executeAction(act.action);
                    }
                  }}
                >
                  {act.label}
                </Button>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
              No admin review actions are available while this permit is waiting for owner submission.
            </p>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

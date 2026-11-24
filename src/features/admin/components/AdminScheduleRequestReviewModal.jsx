import { useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import Modal from './Modal/Modal';
import StatusBadge from './StatusBadge';
import {
  formatScheduleDate,
  getDayLabel,
  getShiftMeta,
} from '../../rider/utils/riderScheduleRequests';

function setsDiffer(a = [], b = []) {
  const left = [...new Set(a)].sort().join('|');
  const right = [...new Set(b)].sort().join('|');
  return left !== right;
}

export default function AdminScheduleRequestReviewModal({
  open,
  onClose,
  request,
  currentApproved,
  onApprove,
  onReject,
}) {
  const [remarks, setRemarks] = useState('');
  const [remarkError, setRemarkError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [confirmDecision, setConfirmDecision] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRemarks('');
    setRemarkError('');
    setSubmitError('');
    setConfirmDecision(null);
    setSubmitting(false);
  }, [open, request?.id]);

  if (!request) return null;

  const isPending = request.status === 'pending';
  const baseline = currentApproved || request.previous_schedule || {
    available_days: [],
    preferred_shifts: [],
    preferred_hubs: [],
  };

  const daysChanged = setsDiffer(baseline.available_days, request.available_days);
  const shiftsChanged = setsDiffer(baseline.preferred_shifts, request.preferred_shifts);
  const hubsChanged = setsDiffer(baseline.preferred_hubs, request.preferred_hubs);

  const handleRequestReject = () => {
    if (remarks.trim().length < 5) {
      setRemarkError('Please provide rejection remarks (minimum 5 characters).');
      return;
    }
    setRemarkError('');
    setConfirmDecision('reject');
  };

  const handleRequestApprove = () => {
    setRemarkError('');
    setConfirmDecision('approve');
  };

  const handleConfirmDecision = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      if (confirmDecision === 'approve') {
        await onApprove?.(request.id, remarks);
      } else if (confirmDecision === 'reject') {
        await onReject?.(request.id, remarks);
      }
      setConfirmDecision(null);
    } catch (err) {
      setSubmitError(err?.message || 'Unable to process schedule request decision.');
      setConfirmDecision(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={`Schedule Request #${request.id}`}
      subtitle={`${request.rider_name} (@${request.rider_username}) · ${request.rider_zone || 'Metro Manila'}`}
      headerExtra={(
        <StatusBadge
          status={request.entry_type === 'admin_update' ? 'Approved' : request.status}
        />
      )}
      size="lg"
      footer={
        isPending ? (
          confirmDecision ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', width: '100%', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', fontWeight: 'var(--font-weight-semibold)' }}>
                {confirmDecision === 'approve'
                  ? 'Confirm approval? This will update the rider’s official approved schedule.'
                  : 'Confirm rejection? The rider’s approved schedule will remain unchanged.'}
              </span>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDecision(null)} disabled={submitting}>
                  Back
                </Button>
                <Button
                  type="button"
                  variant={confirmDecision === 'reject' ? 'danger' : 'primary'}
                  size="sm"
                  loading={submitting}
                  onClick={handleConfirmDecision}
                >
                  {confirmDecision === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
              <Button type="button" variant="danger-outline" size="sm" onClick={handleRequestReject}>
                Reject Request
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={handleRequestApprove}>
                Approve Request
              </Button>
            </div>
          )
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        )
      }
    >
      <div className="admin-schedule-section">
        {submitError && (
          <div className="admin-schedule-notice admin-schedule-notice--warning" role="alert" style={{ borderColor: 'var(--salo-error)', color: 'var(--salo-error)' }}>
            {submitError}
          </div>
        )}
        {/* Request Information */}
        <div className="admin-schedule-history-card">
          <div className="admin-schedule-history-top">
            <strong>{request.entry_type === 'admin_update' ? 'Admin-Initiated Schedule Update' : 'Request Information'}</strong>
            <span className="admin-muted">
              Submitted {formatScheduleDate(request.submitted_at)} · Effective {formatScheduleDate(request.effective_date)}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
            <strong>{request.entry_type === 'admin_update' ? 'Admin Reason:' : 'Rider Reason:'}</strong> {request.reason}
          </p>
          {!isPending && request.reviewed_by && (
            <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
              Reviewed by <strong>{request.reviewed_by}</strong> on {formatScheduleDate(request.reviewed_at)}
              {request.admin_remarks ? ` — “${request.admin_remarks}”` : ''}
            </p>
          )}
        </div>

        {/* Side-by-side Schedule Comparison */}
        <div className="admin-schedule-compare-grid">
          <section className="admin-schedule-compare-card" aria-label="Current Approved Schedule">
            <h3 className="admin-schedule-compare-title">
              <span>Current Approved Schedule</span>
            </h3>

            <div className="admin-schedule-field-block">
              <span className="admin-schedule-field-label">Available Days</span>
              <div className="admin-schedule-chip-list">
                {(baseline.available_days || []).length > 0 ? (
                  baseline.available_days.map((d) => (
                    <span key={d} className="admin-schedule-chip admin-schedule-chip--approved">
                      {getDayLabel(d, { short: true })}
                    </span>
                  ))
                ) : (
                  <span className="admin-muted">None on file</span>
                )}
              </div>
            </div>

            <div className="admin-schedule-field-block">
              <span className="admin-schedule-field-label">Preferred Shifts</span>
              <div className="admin-schedule-chip-list">
                {(baseline.preferred_shifts || []).length > 0 ? (
                  baseline.preferred_shifts.map((s) => (
                    <span key={s} className="admin-schedule-chip admin-schedule-chip--approved">
                      {getShiftMeta(s).label}
                    </span>
                  ))
                ) : (
                  <span className="admin-muted">None on file</span>
                )}
              </div>
            </div>

            <div className="admin-schedule-field-block">
              <span className="admin-schedule-field-label">Preferred Hubs</span>
              <div className="admin-schedule-chip-list">
                {(baseline.preferred_hubs || []).length > 0 ? (
                  baseline.preferred_hubs.map((h) => (
                    <span key={h} className="admin-schedule-chip">{h}</span>
                  ))
                ) : (
                  <span className="admin-muted">No specific hubs</span>
                )}
              </div>
            </div>
          </section>

          <section className="admin-schedule-compare-card admin-schedule-compare-card--requested" aria-label="Requested Schedule">
            <h3 className="admin-schedule-compare-title">
              <span>{request.entry_type === 'admin_update' ? 'Updated Schedule' : 'Requested Schedule'}</span>
              {(daysChanged || shiftsChanged || hubsChanged) && (
                <span className="admin-schedule-change-tag">Modified</span>
              )}
            </h3>

            <div className="admin-schedule-field-block">
              <span className="admin-schedule-field-label">
                Requested Days {daysChanged ? '(Changed)' : '(Unchanged)'}
              </span>
              <div className="admin-schedule-chip-list">
                {(request.available_days || []).map((d) => (
                  <span
                    key={d}
                    className={`admin-schedule-chip ${daysChanged ? 'admin-schedule-chip--changed' : ''}`}
                  >
                    {getDayLabel(d, { short: true })}
                  </span>
                ))}
              </div>
            </div>

            <div className="admin-schedule-field-block">
              <span className="admin-schedule-field-label">
                Requested Shifts {shiftsChanged ? '(Changed)' : '(Unchanged)'}
              </span>
              <div className="admin-schedule-chip-list">
                {(request.preferred_shifts || []).map((s) => (
                  <span
                    key={s}
                    className={`admin-schedule-chip ${shiftsChanged ? 'admin-schedule-chip--changed' : ''}`}
                  >
                    {getShiftMeta(s).label}
                  </span>
                ))}
              </div>
            </div>

            <div className="admin-schedule-field-block">
              <span className="admin-schedule-field-label">
                Requested Hubs {hubsChanged ? '(Changed)' : '(Unchanged)'}
              </span>
              <div className="admin-schedule-chip-list">
                {(request.preferred_hubs || []).length > 0 ? (
                  request.preferred_hubs.map((h) => (
                    <span
                      key={h}
                      className={`admin-schedule-chip ${hubsChanged ? 'admin-schedule-chip--changed' : ''}`}
                    >
                      {h}
                    </span>
                  ))
                ) : (
                  <span className="admin-muted">No specific hubs</span>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Review Remarks Input for Pending Requests */}
        {isPending && (
          <div className="admin-schedule-field-block">
            <label htmlFor="admin-review-remarks" className="admin-schedule-field-label">
              Administrative Remarks (Optional for approval, required for rejection)
            </label>
            <textarea
              id="admin-review-remarks"
              rows={3}
              maxLength={500}
              value={remarks}
              onChange={(e) => {
                setRemarkError('');
                setRemarks(e.target.value);
              }}
              placeholder="Add review remarks or reason for approval/rejection..."
              className="admin-schedule-textarea"
            />
            {remarkError && (
              <p role="alert" className="admin-schedule-error">{remarkError}</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

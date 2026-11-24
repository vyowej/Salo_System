import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { StateView as GlobalStateView } from '../../../components/feedback';
import riderService from '../../../services/riderService';
import PageHeader from '../components/PageHeader';
import ScheduleChangeRequestModal from '../components/ScheduleChangeRequestModal';
import {
  DAY_OPTIONS,
  formatScheduleDate,
  getDayLabel,
  getShiftMeta,
  parseHubTags,
} from '../utils/riderScheduleRequests';
import './RiderSchedulePage.css';

const HISTORY_STATUS_CONFIG = {
  approved: { label: 'Approved', variant: 'completed' },
  rejected: { label: 'Rejected', variant: 'cancelled' },
  cancelled: { label: 'Cancelled', variant: 'default' },
  pending: { label: 'Pending', variant: 'upcoming' },
};

export default function RiderSchedulePage() {
  const [profile, setProfile] = useState(null);
  const [scheduleData, setScheduleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [profileRes, scheduleRes] = await Promise.all([
        riderService.getProfile(),
        riderService.getSchedule(),
      ]);
      setProfile(profileRes);
      setScheduleData(scheduleRes);
    } catch (err) {
      setLoadError(err?.message || 'Unable to load rider schedule.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const approvedSchedule = useMemo(() => {
    const approved = scheduleData?.approved_schedule;
    const availableDays = Array.isArray(approved?.available_days)
      ? approved.available_days
      : Array.isArray(profile?.available_days)
        ? profile.available_days
        : [];
    const preferredShifts = Array.isArray(approved?.preferred_shifts)
      ? approved.preferred_shifts
      : Array.isArray(profile?.preferred_shifts)
        ? profile.preferred_shifts
        : [];
    const hubTags = Array.isArray(approved?.preferred_hubs)
      ? approved.preferred_hubs
      : parseHubTags(profile?.preferred_hubs);
    const effectiveDate = approved?.effective_date || profile?.approved_at || null;

    return {
      availableDays,
      preferredShifts,
      hubTags,
      effectiveDate,
    };
  }, [scheduleData, profile]);

  const upcomingSchedule = scheduleData?.upcoming_schedule || null;
  const pendingRequest = scheduleData?.pending_request || null;
  const hasPending = Boolean(pendingRequest);
  const requestHistory = useMemo(
    () => (Array.isArray(scheduleData?.history) ? scheduleData.history : []),
    [scheduleData],
  );

  const handleOpenRequestModal = () => {
    if (hasPending) return;
    setActionNotice('');
    setActionError('');
    setRequestModalOpen(true);
  };

  const handleSubmitScheduleRequest = async (formPayload) => {
    if (hasPending) return;
    await riderService.submitScheduleChangeRequest(formPayload);
    await loadSchedule();
    setRequestModalOpen(false);
    setActionNotice(
      'Schedule change request submitted for administrator review. Your approved availability remains unchanged until approved.',
    );
  };

  const handleConfirmCancelRequest = async () => {
    if (!cancelTargetId || cancelling) return;
    setCancelling(true);
    setActionError('');
    try {
      await riderService.cancelScheduleChangeRequest(cancelTargetId);
      setCancelTargetId(null);
      await loadSchedule();
      setActionNotice('Pending schedule change request cancelled.');
    } catch (err) {
      setActionError(err?.message || 'Unable to cancel pending schedule change request.');
      setCancelTargetId(null);
    } finally {
      setCancelling(false);
    }
  };

  const isOnline = Boolean(
    profile?.availability?.is_online || profile?.availability?.status === 'online',
  );
  const availabilityLabel = isOnline
    ? 'Online & Available'
    : profile?.availability?.status === 'temporarily_unavailable'
      ? 'Temporarily Unavailable'
      : 'Offline';

  return (
    <div className="rider-page-shell">
      <PageHeader
        title="Shift schedule"
        subtitle="View your approved delivery availability and request schedule adjustments."
        eyebrow="Schedule"
      />

      {loading ? (
        <GlobalStateView state="loading" title="Loading shift schedule..." />
      ) : loadError ? (
        <GlobalStateView
          state="error"
          title="Could not load shift schedule"
          description={loadError}
          onRetry={loadSchedule}
        />
      ) : (
        <div className="rider-schedule-stack">
          {/* 1. Current Duty Status (Online/Offline remains separate) */}
          <Card>
            <CardBody className="rider-schedule-duty-body">
              <div>
                <div className="rider-schedule-duty-title-row">
                  <strong>Current Duty Status</strong>
                  <Badge variant={isOnline ? 'success' : 'default'} size="sm" dot>
                    {availabilityLabel}
                  </Badge>
                </div>
                <p className="rider-schedule-muted-copy">
                  {profile?.base_city ? `Base city: ${profile.base_city} · ` : ''}
                  Toggle your live availability before accepting deliveries.
                </p>
              </div>
              <Link to="/rider/go-online">
                <Button variant="outline" size="sm">
                  Manage Online Status
                </Button>
              </Link>
            </CardBody>
          </Card>

          {actionError && (
            <div className="rider-schedule-notice rider-schedule-notice--error" role="alert">
              <span>{actionError}</span>
              <button
                type="button"
                className="rider-schedule-notice-dismiss"
                onClick={() => setActionError('')}
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}

          {actionNotice && (
            <div className="rider-schedule-notice rider-schedule-notice--success" role="status">
              <span>{actionNotice}</span>
              <button
                type="button"
                className="rider-schedule-notice-dismiss"
                onClick={() => setActionNotice('')}
                aria-label="Dismiss notice"
              >
                ×
              </button>
            </div>
          )}

          {/* 2. Pending Request (if one exists) */}
          {pendingRequest && (
            <Card className="rider-schedule-pending-card">
              <CardBody className="rider-schedule-section-body">
                <div className="rider-schedule-card-header">
                  <div>
                    <div className="rider-schedule-title-row">
                      <h2 className="rider-schedule-card-title">Pending Schedule Change Request</h2>
                      <Badge variant="upcoming" size="sm" dot>
                        Pending Review
                      </Badge>
                    </div>
                    <p className="rider-schedule-muted-copy">
                      Submitted {formatScheduleDate(pendingRequest.submitted_at)} · Request #{pendingRequest.id}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={cancelling}
                    onClick={() => setCancelTargetId(pendingRequest.id)}
                  >
                    Cancel Request
                  </Button>
                </div>

                <div className="rider-schedule-notice rider-schedule-notice--warning" role="status">
                  Your schedule change request is awaiting administrator review. Your current approved availability remains active until this request is approved.
                </div>

                <div className="rider-schedule-summary-grid">
                  <div className="rider-schedule-summary-item">
                    <span className="rider-schedule-summary-label">Requested Effective Date</span>
                    <strong className="rider-schedule-summary-value">
                      {formatScheduleDate(pendingRequest.effective_date)}
                    </strong>
                  </div>
                  <div className="rider-schedule-summary-item">
                    <span className="rider-schedule-summary-label">Requested Available Days</span>
                    <div className="rider-schedule-chip-list">
                      {(pendingRequest.available_days || []).map((day) => (
                        <span key={day} className="rider-schedule-chip rider-schedule-chip--pending">
                          {getDayLabel(day, { short: true })}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rider-schedule-summary-item">
                    <span className="rider-schedule-summary-label">Requested Preferred Shifts</span>
                    <div className="rider-schedule-chip-list">
                      {(pendingRequest.preferred_shifts || []).map((shift) => {
                        const meta = getShiftMeta(shift);
                        return (
                          <span key={shift} className="rider-schedule-chip rider-schedule-chip--pending">
                            {meta.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="rider-schedule-summary-item">
                    <span className="rider-schedule-summary-label">Requested Delivery Hubs</span>
                    <div className="rider-schedule-chip-list">
                      {(pendingRequest.preferred_hubs || []).length > 0 ? (
                        pendingRequest.preferred_hubs.map((hub) => (
                          <span key={hub} className="rider-schedule-chip">
                            {hub}
                          </span>
                        ))
                      ) : (
                        <span className="rider-schedule-muted-copy">No specific hub preference</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rider-schedule-reason-box">
                  <span className="rider-schedule-summary-label">Reason for Change</span>
                  <p className="rider-schedule-reason-text">{pendingRequest.reason}</p>
                </div>
              </CardBody>
            </Card>
          )}

          {/* 3. Approved Upcoming Schedule (if approved for a future effective date) */}
          {upcomingSchedule && (
            <Card>
              <CardBody className="rider-schedule-section-body">
                <div className="rider-schedule-card-header">
                  <div>
                    <div className="rider-schedule-title-row">
                      <h2 className="rider-schedule-card-title">Upcoming Approved Schedule</h2>
                      <Badge variant="info" size="sm" dot>
                        Effective {formatScheduleDate(upcomingSchedule.effective_date)}
                      </Badge>
                    </div>
                    <p className="rider-schedule-muted-copy">
                      Approved and scheduled to replace your current availability on{' '}
                      {formatScheduleDate(upcomingSchedule.effective_date)}.
                    </p>
                  </div>
                </div>
                <div className="rider-schedule-summary-grid">
                  <div className="rider-schedule-summary-item">
                    <span className="rider-schedule-summary-label">Upcoming Days</span>
                    <div className="rider-schedule-chip-list">
                      {(upcomingSchedule.available_days || []).map((day) => (
                        <span key={day} className="rider-schedule-chip">
                          {getDayLabel(day, { short: true })}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rider-schedule-summary-item">
                    <span className="rider-schedule-summary-label">Upcoming Shifts</span>
                    <div className="rider-schedule-chip-list">
                      {(upcomingSchedule.preferred_shifts || []).map((shift) => (
                        <span key={shift} className="rider-schedule-chip">
                          {getShiftMeta(shift).label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rider-schedule-summary-item">
                    <span className="rider-schedule-summary-label">Upcoming Hubs</span>
                    <div className="rider-schedule-chip-list">
                      {(upcomingSchedule.preferred_hubs || []).length > 0 ? (
                        upcomingSchedule.preferred_hubs.map((hub) => (
                          <span key={hub} className="rider-schedule-chip">
                            {hub}
                          </span>
                        ))
                      ) : (
                        <span className="rider-schedule-muted-copy">No specific hub preference</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {/* 4. Approved Availability (Read-Only) + Request Schedule Change Action */}
          <Card>
            <CardBody className="rider-schedule-section-body">
              <div className="rider-schedule-card-header">
                <div>
                  <div className="rider-schedule-title-row">
                    <h2 className="rider-schedule-card-title">Approved Availability</h2>
                    <Badge variant="completed" size="sm" dot>
                      Approved &amp; Active
                    </Badge>
                  </div>
                  <p className="rider-schedule-muted-copy">
                    {approvedSchedule.effectiveDate
                      ? `Effective since ${formatScheduleDate(approvedSchedule.effectiveDate)} · `
                      : ''}
                    Official schedule on file.
                  </p>
                </div>

                <div className="rider-schedule-action-wrap">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={hasPending}
                    onClick={handleOpenRequestModal}
                  >
                    Request Schedule Change
                  </Button>
                  {hasPending && (
                    <span className="rider-schedule-action-hint">
                      Pending request in review
                    </span>
                  )}
                </div>
              </div>

              <div className="rider-schedule-notice rider-schedule-notice--info" role="note">
                Your approved availability is shown here. Changes to your schedule require approval.
              </div>

              {/* Approved Available Days */}
              <section className="rider-schedule-readonly-section" aria-label="Approved available days">
                <h3 className="rider-schedule-section-title">Available Days</h3>
                <div className="rider-schedule-days-readonly">
                  {DAY_OPTIONS.map((day) => {
                    const isApproved = approvedSchedule.availableDays.includes(day.value);
                    return (
                      <div
                        key={day.value}
                        className={`rider-schedule-day-card ${isApproved ? 'is-approved' : 'is-off'}`}
                      >
                        <span className="rider-schedule-day-name">{day.label}</span>
                        <span className="rider-schedule-day-state">
                          {isApproved ? 'Approved' : 'Off'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Approved Preferred Shifts */}
              <section className="rider-schedule-readonly-section" aria-label="Approved preferred shifts">
                <h3 className="rider-schedule-section-title">Preferred Shifts</h3>
                {approvedSchedule.preferredShifts.length > 0 ? (
                  <div className="rider-schedule-shifts-readonly">
                    {approvedSchedule.preferredShifts.map((shiftValue) => {
                      const meta = getShiftMeta(shiftValue);
                      return (
                        <div key={shiftValue} className="rider-schedule-shift-card-readonly">
                          <div className="rider-schedule-shift-card-label">{meta.label}</div>
                          {meta.hours && (
                            <div className="rider-schedule-shift-card-hours">{meta.hours}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rider-schedule-empty-inline">
                    No approved shift preferences on file.
                  </p>
                )}
              </section>

              {/* Approved Preferred Delivery Hubs */}
              <section className="rider-schedule-readonly-section" aria-label="Approved preferred delivery hubs">
                <h3 className="rider-schedule-section-title">Preferred Delivery Hubs</h3>
                {approvedSchedule.hubTags.length > 0 ? (
                  <div className="rider-schedule-hub-tags">
                    {approvedSchedule.hubTags.map((hub) => (
                      <span key={hub} className="rider-schedule-hub-tag">
                        {hub}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="rider-schedule-empty-inline">
                    No specific delivery hubs configured.
                  </p>
                )}
              </section>
            </CardBody>
          </Card>

          {/* 5. Schedule Change Request History */}
          <Card>
            <CardBody className="rider-schedule-section-body">
              <div className="rider-schedule-card-header">
                <div>
                  <h2 className="rider-schedule-card-title">Schedule Change History</h2>
                  <p className="rider-schedule-muted-copy">
                    Past schedule change requests and administrator review remarks.
                  </p>
                </div>
              </div>

              {requestHistory.length === 0 ? (
                <p className="rider-schedule-empty-inline">
                  No past schedule change requests yet.
                </p>
              ) : (
                <div className="rider-schedule-history-list">
                  {requestHistory.map((req) => {
                    const statusMeta = HISTORY_STATUS_CONFIG[req.status] || {
                      label: req.status,
                      variant: 'default',
                    };
                    return (
                      <article key={req.id} className="rider-schedule-history-item">
                        <div className="rider-schedule-history-top">
                          <div className="rider-schedule-title-row">
                            <strong className="rider-schedule-history-id">
                              {req.entry_type === 'admin_update' ? `Admin Update #${req.id}` : `Request #${req.id}`}
                            </strong>
                            <Badge variant={statusMeta.variant} size="sm">
                              {req.entry_type === 'admin_update' ? 'Admin-Initiated' : statusMeta.label}
                            </Badge>
                          </div>
                          <span className="rider-schedule-muted-copy">
                            Submitted {formatScheduleDate(req.submitted_at)} · Effective{' '}
                            {formatScheduleDate(req.effective_date)}
                          </span>
                        </div>

                        <div className="rider-schedule-history-details">
                          <span>
                            <strong>Days:</strong>{' '}
                            {(req.available_days || []).map((d) => getDayLabel(d, { short: true })).join(', ') || '—'}
                          </span>
                          <span>
                            <strong>Shifts:</strong>{' '}
                            {(req.preferred_shifts || []).map((s) => getShiftMeta(s).label).join(', ') || '—'}
                          </span>
                          {(req.preferred_hubs || []).length > 0 && (
                            <span>
                              <strong>Hubs:</strong> {req.preferred_hubs.join(', ')}
                            </span>
                          )}
                        </div>

                        <p className="rider-schedule-history-reason">
                          <strong>Reason:</strong> {req.reason}
                        </p>

                        {req.admin_remarks && (
                          <div className="rider-schedule-admin-remarks">
                            <strong>Admin Remarks:</strong> {req.admin_remarks}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      <ScheduleChangeRequestModal
        open={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        approvedSchedule={approvedSchedule}
        onSubmitRequest={handleSubmitScheduleRequest}
      />

      <ConfirmDialog
        open={Boolean(cancelTargetId)}
        title="Cancel Schedule Change Request?"
        message="This will withdraw your pending schedule change request. Your current approved availability will remain unchanged."
        confirmLabel={cancelling ? 'Cancelling...' : 'Yes, Cancel Request'}
        cancelLabel="Keep Pending"
        onConfirm={handleConfirmCancelRequest}
        onCancel={() => { if (!cancelling) setCancelTargetId(null); }}
      />
    </div>
  );
}

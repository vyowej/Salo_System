import { useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import Modal from './Modal/Modal';
import {
  DAY_OPTIONS,
  SHIFT_OPTIONS,
  extractScheduleFieldErrors,
  getTodayIsoDate,
  toggleShiftSelection,
  validateScheduleChangeRequest,
} from '../../rider/utils/riderScheduleRequests';

const FORM_ID = 'admin-manage-rider-schedule-form';

export default function AdminManageRiderScheduleModal({
  open,
  onClose,
  rider,
  approvedSchedule,
  hasPendingRequest,
  onSaveDirectUpdate,
}) {
  const todayIso = getTodayIsoDate();
  const [availableDays, setAvailableDays] = useState([]);
  const [preferredShifts, setPreferredShifts] = useState([]);
  const [hubTags, setHubTags] = useState([]);
  const [hubInput, setHubInput] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(todayIso);
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAvailableDays(Array.isArray(approvedSchedule?.available_days) ? [...approvedSchedule.available_days] : []);
    setPreferredShifts(Array.isArray(approvedSchedule?.preferred_shifts) ? [...approvedSchedule.preferred_shifts] : []);
    setHubTags(Array.isArray(approvedSchedule?.preferred_hubs) ? [...approvedSchedule.preferred_hubs] : []);
    setHubInput('');
    setEffectiveDate(todayIso);
    setReason('');
    setFieldErrors({});
    setSubmitError('');
    setSaving(false);
  }, [open, approvedSchedule, todayIso]);

  const clearError = (key) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleToggleDay = (dayValue) => {
    clearError('available_days');
    setAvailableDays((prev) =>
      prev.includes(dayValue) ? prev.filter((d) => d !== dayValue) : [...prev, dayValue],
    );
  };

  const handleToggleShift = (shiftValue) => {
    clearError('preferred_shifts');
    setPreferredShifts((prev) => toggleShiftSelection(prev, shiftValue));
  };

  const handleAddHub = () => {
    const trimmed = hubInput.trim();
    if (!trimmed) return;
    clearError('preferred_hubs');
    if (!hubTags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setHubTags((prev) => [...prev, trimmed]);
    }
    setHubInput('');
  };

  const handleRemoveHub = (tag) => {
    clearError('preferred_hubs');
    setHubTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    const pendingHub = hubInput.trim();
    const nextHubs =
      pendingHub && !hubTags.some((t) => t.toLowerCase() === pendingHub.toLowerCase())
        ? [...hubTags, pendingHub]
        : hubTags;

    if (pendingHub) {
      setHubTags(nextHubs);
      setHubInput('');
    }

    const payload = {
      available_days: availableDays,
      preferred_shifts: preferredShifts,
      preferred_hubs: nextHubs,
      effective_date: effectiveDate,
      reason,
    };

    const { errors, isValid } = validateScheduleChangeRequest(payload, todayIso);
    if (!isValid) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    setSubmitError('');
    try {
      await onSaveDirectUpdate?.(payload);
    } catch (err) {
      const serverErrors = extractScheduleFieldErrors(err);
      if (Object.keys(serverErrors).length > 0) {
        setFieldErrors(serverErrors);
      }
      setSubmitError(err?.message || 'Unable to update rider schedule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={`Manage Schedule${rider?.name ? ` — ${rider.name}` : ''}`}
      subtitle="Admin-initiated update to official approved rider availability."
      size="lg"
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" size="sm" loading={saving}>
            Save Approved Schedule
          </Button>
        </div>
      )}
    >
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="admin-schedule-form">
        {submitError && (
          <div className="admin-schedule-notice admin-schedule-notice--warning" role="alert" style={{ borderColor: 'var(--salo-error)', color: 'var(--salo-error)' }}>
            {submitError}
          </div>
        )}
        <div className="admin-schedule-notice admin-schedule-notice--info" role="note">
          This is an Admin-initiated schedule update. It updates the rider&apos;s official approved availability directly and is recorded in schedule history.
        </div>

        {hasPendingRequest && (
          <div className="admin-schedule-notice admin-schedule-notice--warning" role="status">
            Note: This rider currently has a pending schedule change request. Saving this update will not silently approve, overwrite, or delete their pending request.
          </div>
        )}

        <div className="admin-schedule-field-block">
          <span className="admin-schedule-field-label">Approved Available Days *</span>
          <div className="admin-schedule-day-pills">
            {DAY_OPTIONS.map((day) => {
              const selected = availableDays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => handleToggleDay(day.value)}
                  className={`admin-schedule-day-pill ${selected ? 'is-selected' : ''}`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          {fieldErrors.available_days && (
            <p role="alert" className="admin-schedule-error">{fieldErrors.available_days}</p>
          )}
        </div>

        <div className="admin-schedule-field-block">
          <span className="admin-schedule-field-label">Approved Preferred Shifts *</span>
          <div className="admin-schedule-shift-grid">
            {SHIFT_OPTIONS.map((shift) => {
              const selected = preferredShifts.includes(shift.value);
              return (
                <button
                  key={shift.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => handleToggleShift(shift.value)}
                  className={`admin-schedule-shift-option ${selected ? 'is-selected' : ''}`}
                >
                  <span className="admin-schedule-shift-label">{shift.label}</span>
                  <span className="admin-schedule-shift-hours">{shift.hours}</span>
                </button>
              );
            })}
          </div>
          {fieldErrors.preferred_shifts && (
            <p role="alert" className="admin-schedule-error">{fieldErrors.preferred_shifts}</p>
          )}
        </div>

        <div className="admin-schedule-field-block">
          <span className="admin-schedule-field-label">Preferred Delivery Hubs (Optional)</span>
          <div className="admin-schedule-hub-row">
            <input
              type="text"
              value={hubInput}
              onChange={(e) => {
                clearError('preferred_hubs');
                setHubInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddHub();
                }
              }}
              placeholder="e.g., Diliman, Katipunan, Cubao"
              maxLength={100}
              aria-label="Add delivery hub"
              className="admin-schedule-input"
            />
            <Button type="button" variant="outline" size="sm" onClick={handleAddHub}>
              Add Hub
            </Button>
          </div>
          {hubTags.length > 0 && (
            <div className="admin-schedule-chip-list" style={{ marginTop: 'var(--space-1)' }}>
              {hubTags.map((tag) => (
                <span key={tag} className="admin-schedule-chip">
                  <span>{tag}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveHub(tag)}
                    aria-label={`Remove ${tag}`}
                    className="admin-schedule-hub-remove"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {fieldErrors.preferred_hubs && (
            <p role="alert" className="admin-schedule-error">{fieldErrors.preferred_hubs}</p>
          )}
        </div>

        <div className="admin-schedule-field-block">
          <label htmlFor="admin-schedule-effective-date" className="admin-schedule-field-label">
            Effective Date *
          </label>
          <input
            id="admin-schedule-effective-date"
            type="date"
            min={todayIso}
            value={effectiveDate}
            onChange={(e) => {
              clearError('effective_date');
              setEffectiveDate(e.target.value);
            }}
            className="admin-schedule-input"
          />
          {fieldErrors.effective_date && (
            <p role="alert" className="admin-schedule-error">{fieldErrors.effective_date}</p>
          )}
        </div>

        <div className="admin-schedule-field-block">
          <label htmlFor="admin-schedule-reason" className="admin-schedule-field-label">
            Administrative Reason / Note *
          </label>
          <textarea
            id="admin-schedule-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => {
              clearError('reason');
              setReason(e.target.value);
            }}
            placeholder="Explain why this approved schedule is being updated (e.g., hub coverage rebalance, rider onboarding adjustment)..."
            className="admin-schedule-textarea"
          />
          {fieldErrors.reason && (
            <p role="alert" className="admin-schedule-error">{fieldErrors.reason}</p>
          )}
        </div>
      </form>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import {
  DAY_OPTIONS,
  SHIFT_OPTIONS,
  getTodayIsoDate,
  toggleShiftSelection,
  validateScheduleChangeRequest,
} from '../utils/riderScheduleRequests';

const FORM_ID = 'rider-schedule-change-request-form';

export default function ScheduleChangeRequestModal({
  open,
  onClose,
  approvedSchedule,
  onSubmitRequest,
}) {
  const todayIso = getTodayIsoDate();

  const [availableDays, setAvailableDays] = useState([]);
  const [preferredShifts, setPreferredShifts] = useState([]);
  const [hubTags, setHubTags] = useState([]);
  const [hubInput, setHubInput] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setAvailableDays(Array.isArray(approvedSchedule?.availableDays) ? [...approvedSchedule.availableDays] : []);
    setPreferredShifts(Array.isArray(approvedSchedule?.preferredShifts) ? [...approvedSchedule.preferredShifts] : []);
    setHubTags(Array.isArray(approvedSchedule?.hubTags) ? [...approvedSchedule.hubTags] : []);
    setHubInput('');
    setEffectiveDate('');
    setReason('');
    setFieldErrors({});
  }, [open, approvedSchedule]);

  const clearFieldError = (key) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleToggleDay = (dayValue) => {
    clearFieldError('available_days');
    setAvailableDays((prev) =>
      prev.includes(dayValue) ? prev.filter((d) => d !== dayValue) : [...prev, dayValue],
    );
  };

  const handleToggleShift = (shiftValue) => {
    clearFieldError('preferred_shifts');
    setPreferredShifts((prev) => toggleShiftSelection(prev, shiftValue));
  };

  const handleAddHub = () => {
    const trimmed = hubInput.trim();
    if (!trimmed) return;
    clearFieldError('preferred_hubs');
    if (!hubTags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setHubTags((prev) => [...prev, trimmed]);
    }
    setHubInput('');
  };

  const handleRemoveHub = (tag) => {
    clearFieldError('preferred_hubs');
    setHubTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

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

    onSubmitRequest?.(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request Schedule Change"
      size="lg"
      footer={(
        <div className="rider-schedule-modal-footer">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" size="sm">
            Submit Request
          </Button>
        </div>
      )}
    >
      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="rider-schedule-form">
        <div className="rider-schedule-notice rider-schedule-notice--info" role="note">
          Submitting a schedule change request does not alter your current approved availability. Changes take effect only after administrator approval.
        </div>

        <section className="rider-schedule-form-section">
          <div className="rider-schedule-form-header">
            <h3 className="rider-schedule-form-title">Requested Available Days</h3>
            <span className="rider-schedule-required">Required</span>
          </div>
          <p className="rider-schedule-form-hint">
            Select the days of the week you are proposing to be available.
          </p>
          <div className="rider-schedule-day-pills">
            {DAY_OPTIONS.map((day) => {
              const selected = availableDays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => handleToggleDay(day.value)}
                  className={`rider-schedule-day-pill ${selected ? 'is-selected' : ''}`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          {fieldErrors.available_days && (
            <p role="alert" className="rider-schedule-field-error">
              {fieldErrors.available_days}
            </p>
          )}
        </section>

        <section className="rider-schedule-form-section">
          <div className="rider-schedule-form-header">
            <h3 className="rider-schedule-form-title">Requested Preferred Shifts</h3>
            <span className="rider-schedule-required">Required</span>
          </div>
          <p className="rider-schedule-form-hint">
            Choose your proposed shift windows. Selecting Flexible (Anytime) covers all shift windows and replaces individual window selections.
          </p>
          <div className="rider-schedule-shift-grid">
            {SHIFT_OPTIONS.map((shift) => {
              const selected = preferredShifts.includes(shift.value);
              return (
                <button
                  key={shift.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => handleToggleShift(shift.value)}
                  className={`rider-schedule-shift-option ${selected ? 'is-selected' : ''}`}
                >
                  <span className="rider-schedule-shift-option-label">{shift.label}</span>
                  <span className="rider-schedule-shift-option-hours">{shift.hours}</span>
                </button>
              );
            })}
          </div>
          {fieldErrors.preferred_shifts && (
            <p role="alert" className="rider-schedule-field-error">
              {fieldErrors.preferred_shifts}
            </p>
          )}
        </section>

        <section className="rider-schedule-form-section">
          <div className="rider-schedule-form-header">
            <h3 className="rider-schedule-form-title">Requested Preferred Delivery Hubs</h3>
            <span className="rider-schedule-optional">Optional</span>
          </div>
          <p className="rider-schedule-form-hint">
            Add preferred pickup areas or hubs (max 255 characters total).
          </p>
          <div className="rider-schedule-hub-input-row">
            <input
              type="text"
              value={hubInput}
              onChange={(e) => {
                clearFieldError('preferred_hubs');
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
              aria-label="Add preferred hub"
              className="rider-schedule-input"
            />
            <Button type="button" variant="outline" size="sm" onClick={handleAddHub}>
              Add Hub
            </Button>
          </div>
          {hubTags.length > 0 && (
            <div className="rider-schedule-hub-tags">
              {hubTags.map((tag) => (
                <span key={tag} className="rider-schedule-hub-tag rider-schedule-hub-tag--editable">
                  <span>{tag}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveHub(tag)}
                    aria-label={`Remove ${tag}`}
                    className="rider-schedule-hub-remove"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {fieldErrors.preferred_hubs && (
            <p role="alert" className="rider-schedule-field-error">
              {fieldErrors.preferred_hubs}
            </p>
          )}
        </section>

        <div className="rider-schedule-form-split">
          <section className="rider-schedule-form-section">
            <label htmlFor="rider-schedule-effective-date" className="rider-schedule-form-header">
              <span className="rider-schedule-form-title">Requested Effective Date</span>
              <span className="rider-schedule-required">Required</span>
            </label>
            <input
              id="rider-schedule-effective-date"
              type="date"
              min={todayIso}
              value={effectiveDate}
              onChange={(e) => {
                clearFieldError('effective_date');
                setEffectiveDate(e.target.value);
              }}
              aria-invalid={Boolean(fieldErrors.effective_date)}
              className="rider-schedule-input"
            />
            {fieldErrors.effective_date && (
              <p role="alert" className="rider-schedule-field-error">
                {fieldErrors.effective_date}
              </p>
            )}
          </section>

          <section className="rider-schedule-form-section">
            <label htmlFor="rider-schedule-reason" className="rider-schedule-form-header">
              <span className="rider-schedule-form-title">Reason for Schedule Change</span>
              <span className="rider-schedule-required">Required</span>
            </label>
            <textarea
              id="rider-schedule-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => {
                clearFieldError('reason');
                setReason(e.target.value);
              }}
              placeholder="Explain why you need this schedule adjustment (e.g., class schedule change, family commitments)..."
              aria-invalid={Boolean(fieldErrors.reason)}
              className="rider-schedule-textarea"
            />
            <div className="rider-schedule-textarea-meta">
              {fieldErrors.reason ? (
                <p role="alert" className="rider-schedule-field-error">
                  {fieldErrors.reason}
                </p>
              ) : (
                <span className="rider-schedule-form-hint">Minimum 5 characters</span>
              )}
              <span className="rider-schedule-char-count">{reason.trim().length}/500</span>
            </div>
          </section>
        </div>
      </form>
    </Modal>
  );
}

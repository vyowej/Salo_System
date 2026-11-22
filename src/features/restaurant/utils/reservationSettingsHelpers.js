export function validateReservationSettings(form = {}) {
  const errors = {};

  const minNotice = Number(form.reservation_min_notice_hours ?? 2);
  const maxParty = Number(form.reservation_max_party_size ?? 8);
  const duration = Number(form.reservation_duration_minutes ?? 90);
  const maxAdvance = Number(form.reservation_max_advance_days ?? 30);
  const cutoff = Number(form.reservation_cancellation_cutoff_minutes ?? 120);
  const expiry = Number(form.reservation_pending_expiry_minutes ?? 120);
  const autoConfirm = Boolean(form.reservation_auto_confirm);
  const depositRequired = Boolean(form.reservation_deposit_required);
  const depositAmount = Number(form.reservation_deposit_amount ?? 0);
  const serviceFee = Number(form.reservation_service_fee ?? 0);

  if (!Number.isInteger(minNotice) || minNotice < 0 || minNotice > 168) {
    errors.reservation_min_notice_hours = 'Minimum notice must be between 0 and 168 hours.';
  }
  if (!Number.isInteger(maxParty) || maxParty < 1 || maxParty > 100) {
    errors.reservation_max_party_size = 'Max party size must be between 1 and 100 guests.';
  }
  if (!Number.isInteger(duration) || duration < 30 || duration > 240 || duration % 15 !== 0) {
    errors.reservation_duration_minutes = 'Reservation length must be 30–240 minutes in 15-minute steps.';
  }
  if (!Number.isInteger(maxAdvance) || maxAdvance < 1 || maxAdvance > 365) {
    errors.reservation_max_advance_days = 'Booking window must be between 1 and 365 days.';
  }
  if (!Number.isInteger(cutoff) || cutoff < 0 || cutoff > 1440) {
    errors.reservation_cancellation_cutoff_minutes = 'Cancellation cutoff must be between 0 and 1440 minutes.';
  }
  if (!Number.isInteger(expiry) || expiry < 15 || expiry > 1440) {
    errors.reservation_pending_expiry_minutes = 'Pending request expiry must be between 15 and 1440 minutes.';
  }
  if (!Number.isFinite(depositAmount) || depositAmount < 0 || depositAmount > 100000) {
    errors.reservation_deposit_amount = 'Deposit amount must be between ₱0 and ₱100,000.';
  }
  if (!Number.isFinite(serviceFee) || serviceFee < 0 || serviceFee > 100000) {
    errors.reservation_service_fee = 'Service fee must be between ₱0 and ₱100,000.';
  }

  // Cross-field rules
  if (depositRequired && (!Number.isFinite(depositAmount) || depositAmount <= 0)) {
    errors.reservation_deposit_amount = 'Enter a deposit amount greater than ₱0 when deposits are required.';
  }
  if (depositRequired && autoConfirm) {
    errors.reservation_auto_confirm = 'Auto-confirm cannot be enabled while a deposit is required (deposit must be received first).';
  }
  if (Number.isFinite(minNotice) && Number.isFinite(maxAdvance) && minNotice > maxAdvance * 24) {
    errors.reservation_min_notice_hours = 'Minimum notice hours cannot exceed the booking window (max advance days × 24).';
  }

  return errors;
}

export function mapBackendSettingsErrors(err) {
  const rawErrors = err?.errors;
  if (!rawErrors || typeof rawErrors !== 'object') return {};
  const mapped = {};
  Object.entries(rawErrors).forEach(([field, messages]) => {
    if (Array.isArray(messages) && messages.length > 0) {
      mapped[field] = String(messages[0]);
    } else if (typeof messages === 'string' && messages.trim()) {
      mapped[field] = messages;
    }
  });
  return mapped;
}

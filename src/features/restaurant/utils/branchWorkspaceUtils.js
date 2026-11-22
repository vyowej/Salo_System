export function createInitialAddBranchForm() {
  return {
    main_branch_name: '',
    branch_name: '',
    contact_phone: '',
    province: 'Metro Manila',
    city: 'Quezon City',
    barangay: 'South Triangle',
    street: '',
    house_number: '',
    postal_code: '',
    landmark: '',
    latitude: null,
    longitude: null,
    mapPinned: false,
    offers_delivery: true,
    offers_pickup: true,
    offers_dine_in: true,
    accepts_reservations: false,
    copy_operating_hours: true,
    copy_menu: true,
  };
}

export function validateAddBranchForm(form = {}, { rootHasNoBranchName = false } = {}) {
  const errors = {};

  if (rootHasNoBranchName && !String(form.main_branch_name || '').trim()) {
    errors.main_branch_name = 'Main branch name is required when adding your first additional branch.';
  }

  const branchName = String(form.branch_name || '').trim();
  if (!branchName) {
    errors.branch_name = 'Branch name is required.';
  } else if (
    rootHasNoBranchName &&
    String(form.main_branch_name || '').trim().toLowerCase() === branchName.toLowerCase()
  ) {
    errors.branch_name = 'New branch name must be different from the main branch name.';
  }

  if (!String(form.province || '').trim()) {
    errors.province = 'Province is required.';
  }
  if (!String(form.city || '').trim()) {
    errors.city = 'City / municipality is required.';
  }
  if (!String(form.barangay || '').trim()) {
    errors.barangay = 'Barangay is required.';
  }

  const postal = String(form.postal_code || '').trim();
  if (postal && !/^[0-9]{4}$/.test(postal)) {
    errors.postal_code = 'Postal code must be 4 digits.';
  }

  const hasLat = form.latitude !== null && form.latitude !== undefined && String(form.latitude).trim() !== '';
  const hasLng = form.longitude !== null && form.longitude !== undefined && String(form.longitude).trim() !== '';
  if (hasLat !== hasLng) {
    if (!hasLat) errors.latitude = 'Latitude is required when longitude is provided.';
    if (!hasLng) errors.longitude = 'Longitude is required when latitude is provided.';
  } else if (hasLat && hasLng) {
    const latNum = Number(form.latitude);
    const lngNum = Number(form.longitude);
    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
      errors.latitude = 'Latitude must be between -90 and 90.';
    }
    if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
      errors.longitude = 'Longitude must be between -180 and 180.';
    }
  }

  if (!form.offers_delivery && !form.offers_pickup && !form.offers_dine_in) {
    errors.offers_delivery = 'At least one service option (delivery, pickup, or dine-in) must be enabled.';
  }

  return errors;
}

export function buildCreateBranchPayload(form = {}, { rootHasNoBranchName = false } = {}) {
  const payload = {
    branch_name: String(form.branch_name || '').trim(),
    province: String(form.province || '').trim(),
    city: String(form.city || '').trim(),
    barangay: String(form.barangay || '').trim(),
    offers_delivery: Boolean(form.offers_delivery),
    offers_pickup: Boolean(form.offers_pickup),
    offers_dine_in: Boolean(form.offers_dine_in),
    accepts_reservations: Boolean(form.accepts_reservations),
    copy_operating_hours: form.copy_operating_hours !== false,
    copy_menu: form.copy_menu !== false,
  };

  if (rootHasNoBranchName && String(form.main_branch_name || '').trim()) {
    payload.main_branch_name = String(form.main_branch_name).trim();
  }
  if (String(form.contact_phone || '').trim()) {
    payload.contact_phone = String(form.contact_phone).trim();
  }
  if (String(form.street || '').trim()) {
    payload.street = String(form.street).trim();
  }
  if (String(form.house_number || '').trim()) {
    payload.house_number = String(form.house_number).trim();
  }
  if (String(form.postal_code || '').trim()) {
    payload.postal_code = String(form.postal_code).trim();
  }
  if (String(form.landmark || '').trim()) {
    payload.landmark = String(form.landmark).trim();
  }

  const hasLat = form.latitude !== null && form.latitude !== undefined && String(form.latitude).trim() !== '';
  const hasLng = form.longitude !== null && form.longitude !== undefined && String(form.longitude).trim() !== '';
  if (hasLat && hasLng) {
    payload.latitude = Number(form.latitude);
    payload.longitude = Number(form.longitude);
  }

  return payload;
}

export function mapAddBranchBackendErrors(error) {
  const mapped = {};
  if (error?.errors && typeof error.errors === 'object') {
    Object.entries(error.errors).forEach(([key, msgs]) => {
      const first = Array.isArray(msgs) ? msgs[0] : String(msgs);
      if (first) mapped[key] = first;
    });
  }
  return {
    fieldErrors: mapped,
    formError: Object.values(mapped)[0] || error?.message || 'Unable to create branch. Please review your details.',
  };
}

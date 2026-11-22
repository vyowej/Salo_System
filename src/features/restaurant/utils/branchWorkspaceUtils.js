import {
  BRANCH_PERMIT_ACCEPTED_MIMES,
  BRANCH_PERMIT_COPY,
  BRANCH_PERMIT_EXEMPTION_MAX_CHARS,
  BRANCH_PERMIT_EXEMPTION_MIN_CHARS,
  BRANCH_PERMIT_MAX_BYTES,
  BRANCH_PERMIT_STATUS_META,
} from '../content/branchContent.js';

export function getBranchPermitMeta(permitStatus) {
  if (!permitStatus) return null;
  return BRANCH_PERMIT_STATUS_META[permitStatus] || null;
}

export function isBranchPermitEditable(permitStatus) {
  return permitStatus === 'pending_submission'
    || permitStatus === 'additional_info_required'
    || permitStatus === 'rejected';
}

export function formatPermitFileSize(bytes) {
  const num = Number(bytes);
  if (!Number.isFinite(num) || num <= 0) return '0 B';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export function validatePermitFile(file) {
  if (!file) return BRANCH_PERMIT_COPY.fileRequiredError;
  const mime = String(file.type || '').toLowerCase();
  const ext = String(file.name || '').split('.').pop()?.toLowerCase() || '';
  const validExt = ['pdf', 'jpg', 'jpeg', 'png'].includes(ext);
  if (mime ? !BRANCH_PERMIT_ACCEPTED_MIMES.includes(mime) : !validExt) {
    return BRANCH_PERMIT_COPY.fileTypeError;
  }
  if (Number(file.size) <= 0 || Number(file.size) > BRANCH_PERMIT_MAX_BYTES) {
    return BRANCH_PERMIT_COPY.fileSizeError;
  }
  return null;
}

export function validateBranchPermitInput({
  mayors_permit = null,
  is_required_locally = true,
  exemption_reason = '',
} = {}) {
  const errors = {};
  const isRequired = is_required_locally !== false;

  if (isRequired) {
    const fileError = validatePermitFile(mayors_permit);
    if (fileError) {
      errors.mayors_permit = fileError;
    }
  } else {
    const trimmed = String(exemption_reason || '').trim();
    if (
      trimmed.length < BRANCH_PERMIT_EXEMPTION_MIN_CHARS
      || trimmed.length > BRANCH_PERMIT_EXEMPTION_MAX_CHARS
    ) {
      errors.exemption_reason = BRANCH_PERMIT_COPY.exemptionLengthError;
    }
  }

  return errors;
}

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
    is_required_locally: true,
    exemption_reason: '',
    mayors_permit: null,
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

  Object.assign(errors, validateBranchPermitInput(form));

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

  const isRequired = form.is_required_locally !== false;
  if (!isRequired) {
    payload.is_required_locally = false;
    payload.exemption_reason = String(form.exemption_reason || '').trim();
    return payload;
  }

  if (form.mayors_permit) {
    const fd = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (typeof value === 'boolean') {
        fd.append(key, value ? '1' : '0');
      } else if (value !== null && value !== undefined) {
        fd.append(key, String(value));
      }
    });
    fd.append('mayors_permit', form.mayors_permit);
    return fd;
  }

  return payload;
}

export function buildSubmitBranchPermitPayload({
  mayors_permit = null,
  is_required_locally = true,
  exemption_reason = '',
} = {}) {
  const isRequired = is_required_locally !== false;
  if (!isRequired) {
    return {
      is_required_locally: false,
      exemption_reason: String(exemption_reason || '').trim(),
    };
  }

  const fd = new FormData();
  fd.append('is_required_locally', '1');
  if (mayors_permit) {
    fd.append('mayors_permit', mayors_permit);
  }
  return fd;
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

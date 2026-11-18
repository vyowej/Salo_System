export const EMERGENCY_RELATIONSHIP_OPTIONS = [
  { value: 'parent', label: 'Parent' },
  { value: 'spouse_partner', label: 'Spouse / Partner' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'child', label: 'Child' },
  { value: 'relative', label: 'Relative' },
  { value: 'friend', label: 'Friend' },
  { value: 'colleague', label: 'Colleague' },
  { value: 'other', label: 'Other' },
];

export const PREFERRED_SHIFT_OPTIONS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'late_night', label: 'Late night' },
  { value: 'flexible', label: 'Flexible' },
];

export const AVAILABLE_DAY_OPTIONS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

const VALID_RELATIONSHIPS = new Set(EMERGENCY_RELATIONSHIP_OPTIONS.map((o) => o.value));
const VALID_SHIFTS = new Set(PREFERRED_SHIFT_OPTIONS.map((o) => o.value));
const VALID_DAYS = new Set(AVAILABLE_DAY_OPTIONS.map((o) => o.value));

export function buildRiderProfileFormState(profile) {
  return {
    emergency_contact_name: profile?.emergency_contact_name || '',
    emergency_contact_relationship: profile?.emergency_contact_relationship || '',
    emergency_contact_phone: profile?.emergency_contact_phone || '',
    emergency_contact_alt_phone: profile?.emergency_contact_alt_phone || '',
    preferred_hubs: profile?.preferred_hubs || '',
    preferred_shifts: Array.isArray(profile?.preferred_shifts)
      ? profile.preferred_shifts.filter((s) => VALID_SHIFTS.has(s))
      : [],
    available_days: Array.isArray(profile?.available_days)
      ? profile.available_days.filter((d) => VALID_DAYS.has(d))
      : [],
  };
}

export function validateRiderProfileForm(form) {
  const errors = {};
  const name = String(form?.emergency_contact_name || '').trim();
  const relationship = String(form?.emergency_contact_relationship || '').trim();
  const phone = String(form?.emergency_contact_phone || '').trim();
  const altPhone = String(form?.emergency_contact_alt_phone || '').trim();
  const hubs = String(form?.preferred_hubs || '').trim();

  if (!name) {
    errors.emergency_contact_name = 'Emergency contact name is required.';
  } else if (name.length > 150) {
    errors.emergency_contact_name = 'Emergency contact name must be 150 characters or fewer.';
  }

  if (relationship && !VALID_RELATIONSHIPS.has(relationship)) {
    errors.emergency_contact_relationship = 'Select a valid relationship.';
  }

  if (!phone) {
    errors.emergency_contact_phone = 'Emergency contact phone is required.';
  } else if (phone.length > 30) {
    errors.emergency_contact_phone = 'Emergency contact phone must be 30 characters or fewer.';
  }

  if (altPhone.length > 30) {
    errors.emergency_contact_alt_phone = 'Alternate phone must be 30 characters or fewer.';
  }

  if (hubs.length > 255) {
    errors.preferred_hubs = 'Preferred hubs must be 255 characters or fewer.';
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

export function buildRiderProfilePayload(form) {
  const payload = {
    emergency_contact_name: String(form?.emergency_contact_name || '').trim(),
    emergency_contact_phone: String(form?.emergency_contact_phone || '').trim(),
    emergency_contact_alt_phone: String(form?.emergency_contact_alt_phone || '').trim() || null,
    preferred_hubs: String(form?.preferred_hubs || '').trim() || null,
    preferred_shifts: Array.isArray(form?.preferred_shifts)
      ? form.preferred_shifts.filter((s) => VALID_SHIFTS.has(s))
      : [],
    available_days: Array.isArray(form?.available_days)
      ? form.available_days.filter((d) => VALID_DAYS.has(d))
      : [],
  };

  const relationship = String(form?.emergency_contact_relationship || '').trim();
  if (relationship && VALID_RELATIONSHIPS.has(relationship)) {
    payload.emergency_contact_relationship = relationship;
  }

  return payload;
}

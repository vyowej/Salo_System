import { formatDateTime } from './format.js';

export const SUPPORTED_RECORD_ENTITIES = new Set([
  'accounts',
  'administrators',
  'restaurants',
  'riders',
]);

export function getEntityMeta(entity) {
  switch (entity) {
    case 'accounts':
      return { title: 'Account details', backPath: '/admin/accounts', backLabel: 'Back to accounts' };
    case 'administrators':
      return { title: 'Administrator details', backPath: '/admin/administrators', backLabel: 'Back to administrators' };
    case 'restaurants':
      return { title: 'Restaurant details', backPath: '/admin/restaurants', backLabel: 'Back to restaurants' };
    case 'riders':
      return { title: 'Rider details', backPath: '/admin/riders', backLabel: 'Back to riders' };
    default:
      return { title: 'Record details', backPath: '/admin', backLabel: 'Back to dashboard' };
  }
}

export async function findRecordByIdInPages(fetchPage, idField, targetId) {
  const numericId = Number(targetId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }

  let page = 1;
  let lastPage;
  do {
    const res = await fetchPage(page);
    const items = Array.isArray(res?.items) ? res.items : [];
    const match = items.find((item) => Number(item?.[idField]) === numericId);
    if (match) return match;
    lastPage = Math.max(1, Number(res?.meta?.last_page || 1));
    page += 1;
  } while (page <= lastPage && page <= 10);

  return null;
}

export function normalizeAdminRecord(entity, raw) {
  if (!raw || typeof raw !== 'object') return null;

  if (entity === 'accounts' || entity === 'administrators') {
    const fullName = [raw.first_name, raw.middle_initial ? `${raw.middle_initial}.` : '', raw.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();

    return {
      id: raw.user_id,
      title: fullName || raw.username || raw.email || `User #${raw.user_id}`,
      subtitle: `${raw.email || '—'} · Role: ${raw.user_role || 'customer'}`,
      status: raw.account_status || 'pending',
      fields: [
        { label: 'User ID', value: String(raw.user_id) },
        { label: 'Username', value: raw.username || '—' },
        { label: 'Full Name', value: fullName || '—' },
        { label: 'Email', value: raw.email || '—' },
        { label: 'Phone', value: raw.phone_number || '—' },
        { label: 'Role', value: raw.user_role || '—' },
        { label: 'Account Status', value: raw.account_status || '—' },
        { label: 'Email Verified', value: raw.email_verified_at ? formatDateTime(raw.email_verified_at) : 'Not verified' },
        { label: 'Created', value: raw.created_at ? formatDateTime(raw.created_at) : '—' },
      ],
      raw,
    };
  }

  if (entity === 'restaurants') {
    const address = [raw.street, raw.barangay_name, raw.zone].filter(Boolean).join(', ');
    const services = [
      raw.offers_delivery && 'Delivery',
      raw.offers_pickup && 'Pickup',
      raw.offers_dine_in && 'Dine-in',
      raw.accepts_reservations && 'Reservations',
    ]
      .filter(Boolean)
      .join(', ');

    return {
      id: raw.restaurant_id,
      title: raw.restaurant_name || `Restaurant #${raw.restaurant_id}`,
      subtitle: `${raw.registered_name || '—'} · ${raw.zone || 'Zone unset'}`,
      status: raw.restaurant_status || 'pending',
      fields: [
        { label: 'Restaurant ID', value: String(raw.restaurant_id) },
        { label: 'Registered Name', value: raw.registered_name || '—' },
        { label: 'Business Type', value: raw.business_type || '—' },
        { label: 'Ownership', value: raw.ownership_structure || '—' },
        { label: 'Owner', value: raw.owner_name || '—' },
        { label: 'Business Email', value: raw.business_email || '—' },
        { label: 'Contact Phone', value: raw.contact_phone || '—' },
        { label: 'Address', value: address || '—' },
        { label: 'Services', value: services || '—' },
        { label: 'Application Status', value: raw.application_status || '—' },
        { label: 'Reference #', value: raw.reference_number || '—' },
        { label: 'Created', value: raw.created_at ? formatDateTime(raw.created_at) : '—' },
      ],
      raw,
    };
  }

  if (entity === 'riders') {
    const fullName = [raw.first_name, raw.last_name].filter(Boolean).join(' ').trim();
    const vehicle = [raw.vehicle_type, raw.vehicle_brand, raw.vehicle_model, raw.vehicle_color]
      .filter(Boolean)
      .join(' · ');

    return {
      id: raw.rider_id,
      title: fullName || raw.username || `Rider #${raw.rider_id}`,
      subtitle: `${raw.email || '—'} · ${raw.zone || 'Base city unset'}`,
      status: raw.rider_status || 'pending',
      fields: [
        { label: 'Rider ID', value: String(raw.rider_id) },
        { label: 'User ID', value: String(raw.user_id) },
        { label: 'Username', value: raw.username || '—' },
        { label: 'Email', value: raw.email || '—' },
        { label: 'Phone', value: raw.phone_number || '—' },
        { label: 'Base City', value: raw.zone || '—' },
        { label: 'Vehicle', value: vehicle || '—' },
        { label: 'Plate Number', value: raw.plate_number || '—' },
        { label: 'Emergency Contact', value: [raw.emergency_contact_name, raw.emergency_contact_phone].filter(Boolean).join(' · ') || '—' },
        { label: 'Preferred Shifts', value: raw.preferred_shifts || '—' },
        { label: 'Available Days', value: raw.available_days || '—' },
        { label: 'Approved At', value: raw.approved_at ? formatDateTime(raw.approved_at) : '—' },
      ],
      raw,
    };
  }

  return null;
}

export function getAvailableRecordActions(entity, record, permissions = {}) {
  if (!record) return [];
  const status = String(record.status || '').toLowerCase();

  if (entity === 'accounts') {
    const perms = permissions.accounts || [];
    const actions = [];
    if (status !== 'active' && (perms.includes('activate') || perms.includes('edit'))) {
      actions.push({ key: 'activate', label: 'Activate account', nextStatus: 'active', requiresReason: false });
    }
    if (status !== 'suspended' && (perms.includes('suspend') || perms.includes('edit'))) {
      actions.push({ key: 'suspend', label: 'Suspend account', nextStatus: 'suspended', requiresReason: true });
    }
    return actions;
  }

  if (entity === 'administrators') {
    const perms = permissions.administrators || [];
    const canManage = perms.includes('manage') || perms.includes('edit');
    if (!canManage) return [];
    const actions = [];
    if (status !== 'active') {
      actions.push({ key: 'activate', label: 'Activate administrator', nextStatus: 'active', requiresReason: false });
    }
    if (status !== 'suspended') {
      actions.push({ key: 'suspend', label: 'Suspend administrator', nextStatus: 'suspended', requiresReason: true });
    }
    return actions;
  }

  if (entity === 'restaurants') {
    const perms = permissions.restaurants || [];
    const actions = [];
    if (status !== 'active' && perms.includes('activate')) {
      actions.push({ key: 'activate', label: 'Activate restaurant', nextStatus: 'active', requiresReason: false });
    }
    if (status !== 'suspended' && perms.includes('deactivate')) {
      actions.push({ key: 'suspend', label: 'Suspend restaurant', nextStatus: 'suspended', requiresReason: true });
    }
    if (status !== 'inactive' && perms.includes('deactivate')) {
      actions.push({ key: 'deactivate', label: 'Deactivate restaurant', nextStatus: 'inactive', requiresReason: true });
    }
    return actions;
  }

  if (entity === 'riders') {
    const perms = permissions.riders || [];
    const actions = [];
    if (status === 'approved' && perms.includes('activate')) {
      actions.push({ key: 'activate_rider', label: 'Activate rider', nextStatus: 'active', requiresReason: false });
    }
    if (status !== 'suspended' && perms.includes('suspend')) {
      actions.push({ key: 'suspend', label: 'Suspend rider', nextStatus: 'suspended', requiresReason: true });
    }
    if (status !== 'inactive' && perms.includes('suspend')) {
      actions.push({ key: 'deactivate', label: 'Set inactive', nextStatus: 'inactive', requiresReason: true });
    }
    return actions;
  }

  return [];
}

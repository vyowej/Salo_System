/**
 * Service for account-level (/api/account/staff-invitations*) and
 * restaurant-owner (/api/restaurant/staff*) staff invitation workflows.
 */

import apiClient from './apiClient.js';

export const STAFF_POSITIONS = [
  'Manager',
  'Order Handler',
  'Order Staff',
  'Reservation Handler',
  'Reservation Staff',
  'Inventory Manager',
  'Menu Manager',
];

export function normalizeStaffInvitation(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const staffId = Number(raw.staff_id ?? raw.id ?? 0);
  const status = String(raw.status || raw.staff_status || 'pending').toLowerCase();

  const restaurantName = String(raw.restaurant_name || 'Restaurant');
  const branchName = raw.branch_name ? String(raw.branch_name) : null;
  const displayName = String(
    raw.display_name || (branchName ? `${restaurantName} — ${branchName}` : restaurantName),
  );

  return {
    staff_id: staffId,
    id: staffId,
    restaurant_id: Number(raw.restaurant_id ?? 0),
    restaurant_name: restaurantName,
    branch_name: branchName,
    display_name: displayName,
    staff_position: String(raw.staff_position || ''),
    status,
    staff_status: String(raw.staff_status || ''),
    invitation_note: raw.invitation_note ?? null,
    invited_by_first_name: raw.invited_by_first_name ?? null,
    invited_at: raw.invited_at ?? null,
    expires_at: raw.expires_at ?? null,
    responded_at: raw.responded_at ?? null,
    joined_at: raw.joined_at ?? null,
  };
}

export async function getStaffInvitations() {
  const response = await apiClient.get('/account/staff-invitations');
  const rawList = Array.isArray(response?.data?.invitations) ? response.data.invitations : [];
  return rawList.map(normalizeStaffInvitation).filter(Boolean);
}

export async function acceptStaffInvitation(staffId) {
  const id = Number(staffId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('A valid invitation ID is required.');
  }
  const response = await apiClient.post(`/account/staff-invitations/${id}/accept`, {});
  return response?.data ?? { staff_id: id, status: 'accepted' };
}

/**
 * Accept a staff invitation, then refresh the authenticated user's roles and reload the inbox.
 * If accept succeeds but refreshUser fails, returns { accepted: true, userRefreshed: false }
 * instead of failing the acceptance.
 */
export async function executeAcceptStaffInvitation({
  invitationId,
  acceptFn = acceptStaffInvitation,
  refreshUserFn = null,
  reloadInvitationsFn = null,
}) {
  const acceptedData = await acceptFn(invitationId);

  let userRefreshed = true;
  let refreshError = null;
  if (typeof refreshUserFn === 'function') {
    try {
      await refreshUserFn();
    } catch (err) {
      userRefreshed = false;
      refreshError = err instanceof Error ? err : new Error('Unable to refresh account roles.');
    }
  }

  if (typeof reloadInvitationsFn === 'function') {
    await reloadInvitationsFn();
  }

  return {
    accepted: true,
    acceptedData,
    userRefreshed,
    refreshError,
  };
}

export async function declineStaffInvitation(staffId) {
  const id = Number(staffId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('A valid invitation ID is required.');
  }
  const response = await apiClient.post(`/account/staff-invitations/${id}/decline`, {});
  return response?.data ?? { staff_id: id, status: 'declined' };
}

export function normalizeRestaurantStaffMember(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const staffId = Number(raw.staff_id ?? raw.id ?? 0);
  const status = String(raw.status || raw.staff_status || 'pending').toLowerCase();

  const restaurantName = raw.restaurant_name ? String(raw.restaurant_name) : '';
  const branchName = raw.branch_name ? String(raw.branch_name) : null;
  const displayName = raw.display_name
    ? String(raw.display_name)
    : (restaurantName ? (branchName ? `${restaurantName} — ${branchName}` : restaurantName) : (branchName || ''));

  return {
    staff_id: staffId,
    id: staffId,
    restaurant_id: Number(raw.restaurant_id ?? 0),
    restaurant_name: restaurantName,
    branch_name: branchName,
    display_name: displayName,
    user_id: Number(raw.user_id ?? 0),
    first_name: String(raw.first_name || ''),
    last_name: String(raw.last_name || ''),
    username: String(raw.username || ''),
    staff_position: String(raw.staff_position || ''),
    status,
    staff_status: String(raw.staff_status || ''),
    invitation_note: raw.invitation_note ?? null,
    invited_by_first_name: raw.invited_by_first_name ?? null,
    invited_at: raw.invited_at ?? null,
    expires_at: raw.expires_at ?? null,
    responded_at: raw.responded_at ?? null,
    joined_at: raw.joined_at ?? null,
  };
}

export async function getRestaurantStaff(restaurantId = null, { allBranches = false } = {}) {
  const params = new URLSearchParams();
  if (restaurantId) params.set('restaurant_id', String(restaurantId));
  if (allBranches) params.set('all_branches', '1');
  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await apiClient.get(`/restaurant/staff${query}`);
  const data = response?.data || {};
  const rawStaff = Array.isArray(data.staff) ? data.staff : [];

  return {
    restaurant_id: Number(data.restaurant_id ?? restaurantId ?? 0),
    restaurant_name: String(data.restaurant_name || ''),
    branch_name: data.branch_name ?? null,
    display_name: String(data.display_name || data.restaurant_name || ''),
    all_branches: Boolean(data.all_branches),
    staff: rawStaff.map(normalizeRestaurantStaffMember).filter(Boolean),
  };
}

export async function sendStaffInvitation({
  restaurant_id = null,
  identifier = '',
  username = '',
  email = '',
  staff_position,
  note = '',
}) {
  const payload = {
    staff_position,
  };
  if (restaurant_id) payload.restaurant_id = Number(restaurant_id);
  if (email && String(email).trim()) payload.email = String(email).trim();
  else if (username && String(username).trim()) payload.username = String(username).trim();
  else if (identifier && String(identifier).trim()) payload.identifier = String(identifier).trim();

  if (note && String(note).trim()) {
    payload.note = String(note).trim();
  }

  const response = await apiClient.post('/restaurant/staff/invitations', payload);
  return {
    ...(response?.data || { submitted: true }),
    message: response?.message || 'If an eligible SALO account matches that username or email, an invitation has been sent.',
  };
}

export async function cancelStaffInvitation(staffId) {
  const id = Number(staffId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('A valid invitation ID is required.');
  }
  const response = await apiClient.post(`/restaurant/staff/invitations/${id}/cancel`, {});
  return response?.data ?? { staff_id: id, status: 'cancelled' };
}

export async function updateStaffPosition(staffId, staffPosition) {
  const id = Number(staffId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('A valid staff ID is required.');
  }
  const response = await apiClient.patch(`/restaurant/staff/${id}/position`, {
    staff_position: staffPosition,
  });
  return normalizeRestaurantStaffMember(response?.data) ?? response?.data;
}

export async function removeStaffMember(staffId) {
  const id = Number(staffId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('A valid staff ID is required.');
  }
  const response = await apiClient.delete(`/restaurant/staff/${id}`);
  return response?.data ?? { staff_id: id, status: 'inactive' };
}

export const staffInvitationService = {
  getStaffInvitations,
  acceptStaffInvitation,
  executeAcceptStaffInvitation,
  declineStaffInvitation,
  getRestaurantStaff,
  sendStaffInvitation,
  cancelStaffInvitation,
  updateStaffPosition,
  removeStaffMember,
};

export default staffInvitationService;

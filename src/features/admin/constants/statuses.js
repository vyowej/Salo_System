export const ADMIN_ACCOUNT_STATUSES = [
  'Pending Verification',
  'Active',
  'Inactive',
  'Suspended',
  'Deactivated',
  'Deleted',
];

export const ADMIN_INVITATION_STATUSES = ['Pending', 'Accepted', 'Expired', 'Revoked'];
export const ADMIN_ACCOUNT_CAPABILITIES = ['Customer', 'Owner', 'Staff', 'Rider', 'Admin'];
export const ADMIN_APPLICATION_STATUSES = [
  'Pending Review',
  'Pending Verification',
  'More information requested',
  'Documents requested',
  'Active',
  'Rejected',
  'Suspended',
  'Deactivated',
];

export const ADMIN_FEE_STATUSES = ['Draft', 'Active', 'Scheduled', 'Expired', 'Deactivated'];
export const ADMIN_FEE_STATUS_TRANSITIONS = {
  Draft: ['Active', 'Scheduled', 'Deactivated'],
  Scheduled: ['Active', 'Expired', 'Deactivated'],
  Active: ['Expired', 'Deactivated'],
  Expired: ['Deactivated'],
  Deactivated: [],
};
export const ADMIN_HIGH_VALUE_REFUND_THRESHOLD = 5000;
export const ADMIN_TICKET_STATUSES = ['Submitted', 'Under Review', 'In Progress', 'Escalated', 'Resolved', 'Closed'];

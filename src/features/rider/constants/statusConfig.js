export const applicationStatuses = [
  { key: 'draft', label: 'Draft', tone: 'neutral' },
  { key: 'submitted', label: 'Submitted', tone: 'info' },
  { key: 'under_review', label: 'Under Review', tone: 'info' },
  { key: 'requires_info', label: 'Requires Information', tone: 'warning' },
  { key: 'approved', label: 'Approved', tone: 'success' },
  { key: 'rejected', label: 'Rejected', tone: 'danger' },
  { key: 'suspended', label: 'Suspended', tone: 'danger' },
];

export const accountStates = [
  { key: 'pending_approval', label: 'Pending approval', tone: 'warning' },
  { key: 'awaiting_activation', label: 'Awaiting activation', tone: 'info' },
  { key: 'active', label: 'Active', tone: 'success' },
  { key: 'suspended', label: 'Suspended', tone: 'danger' },
  { key: 'deactivated', label: 'Deactivated', tone: 'neutral' },
];

export const availabilityStatuses = [
  { key: 'offline', label: 'Offline', tone: 'neutral' },
  { key: 'online_available', label: 'Online & available', tone: 'success' },
  { key: 'receiving_offer', label: 'Receiving offers', tone: 'info' },
  { key: 'on_delivery', label: 'On delivery', tone: 'warning' },
  { key: 'temporarily_unavailable', label: 'Temporarily unavailable', tone: 'warning' },
  { key: 'shift_ended', label: 'Shift ended', tone: 'neutral' },
];

export const deliveryStatuses = [
  { key: 'offered', label: 'Offered', tone: 'info' },
  { key: 'accepted', label: 'Accepted', tone: 'success' },
  { key: 'picked_up', label: 'Picked up', tone: 'info' },
  { key: 'delivered', label: 'Delivered', tone: 'success' },
  { key: 'failed', label: 'Failed', tone: 'danger' },
  { key: 'cancelled', label: 'Cancelled', tone: 'neutral' },
];

export const codStatuses = [
  { key: 'not_collected', label: 'Not collected', tone: 'neutral' },
  { key: 'collected', label: 'Collected', tone: 'success' },
  { key: 'disputed', label: 'Disputed', tone: 'danger' },
  { key: 'pending_remittance', label: 'Pending remittance', tone: 'warning' },
  { key: 'remitted', label: 'Remitted', tone: 'info' },
  { key: 'remittance_confirmed', label: 'Remittance confirmed', tone: 'success' },
];

export const paymentStatuses = [
  { key: 'paid', label: 'Paid', tone: 'success', icon: '✓' },
  { key: 'payment_pending', label: 'Payment pending', tone: 'warning', icon: '!' },
];

export const documentStatuses = [
  { key: 'approved', label: 'Approved', tone: 'success' },
  { key: 'under_review', label: 'Under review', tone: 'warning' },
  { key: 'pending', label: 'Pending', tone: 'neutral' },
];

export const ticketStatuses = [
  { key: 'submitted', label: 'Submitted', tone: 'info' },
  { key: 'under_review', label: 'Under review', tone: 'warning' },
  { key: 'awaiting_rider_response', label: 'Awaiting rider response', tone: 'warning' },
  { key: 'resolved', label: 'Resolved', tone: 'success' },
  { key: 'closed', label: 'Closed', tone: 'neutral' },
];

export const shiftStatuses = [
  { key: 'upcoming', label: 'Upcoming', tone: 'info' },
  { key: 'active', label: 'Active', tone: 'success' },
  { key: 'completed', label: 'Completed', tone: 'neutral' },
  { key: 'changed', label: 'Changed', tone: 'warning' },
  { key: 'cancelled', label: 'Cancelled', tone: 'danger' },
];

export const statusBadgeVariants = {
  neutral: 'default',
  info: 'primary',
  success: 'success',
  warning: 'warning',
  danger: 'error',
  primary: 'primary',
};

export const statusConfig = {
  applicationStatuses,
  accountStates,
  availabilityStatuses,
  deliveryStatuses,
  codStatuses,
  paymentStatuses,
  ticketStatuses,
  shiftStatuses,
};

export default statusConfig;

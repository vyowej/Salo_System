// MOCK DATA ONLY — replace with real data later.
export const dashboard = {
  profileName: 'Sample Rider',
  accountStatus: 'Active',
  availability: 'Offline',
  zone: 'Central sample zone',
  location: { status: 'Location permission not enabled', updatedAt: 'No recent location' },
  shift: { date: 'No shift assigned', start: '—', end: '—', zone: 'No zone assigned', status: 'Unscheduled' },
  activeDelivery: null,
  metrics: [
    { label: "Today's deliveries", value: '0', detail: 'Completed deliveries' },
    { label: "Today's earnings", value: '₱0', detail: 'No earnings recorded' },
    { label: 'Pending COD', value: '₱0', detail: 'Not income · collection balance' },
  ],
  quickActions: [
    { label: 'View schedule', href: '/rider/schedule' },
    { label: 'View earnings', href: '/rider/earnings' },
    { label: 'Contact support', href: '/rider/support' },
  ],
  recentNotifications: [
    { title: 'Rider profile setup', detail: 'Review your profile and required documents.', time: 'No recent activity', unread: false, type: 'Account' },
  ],
  eligibility: [
    { label: 'Application approved', met: false, reason: 'Approval status has not been confirmed for this preview.' },
    { label: 'Account activated', met: false, reason: 'Complete the required activation step first.' },
    { label: 'Assigned active shift', met: false, reason: 'No active shift is assigned in this sample.' },
    { label: 'Eligible delivery zone', met: false, reason: 'A delivery zone must be confirmed.' },
    { label: 'Driver Mode enabled', met: false, reason: 'Enable Driver Mode when you are ready.' },
    { label: 'Recent GPS location', met: false, reason: 'Allow location access and refresh your position.' },
    { label: 'No conflicting active assignment', met: true, reason: 'No active assignment is shown in this sample.' },
  ],
};

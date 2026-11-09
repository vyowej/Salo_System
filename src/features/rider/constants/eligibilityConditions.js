export const eligibilityConditions = [
  { key: 'approved_application', label: 'Approved application', met: false, reason: 'Your rider application must be approved before you can go online.' },
  { key: 'account_activated', label: 'Account activated', met: false, reason: 'Complete activation to unlock the rider workspace.' },
  { key: 'active_account', label: 'Active account', met: false, reason: 'Your account status must remain active.' },
  { key: 'active_shift', label: 'Active shift', met: false, reason: 'An assigned shift is required to receive job offers.' },
  { key: 'eligible_zone', label: 'Eligible zone', met: false, reason: 'Your current zone must be within a delivered service area.' },
  { key: 'driver_mode', label: 'Driver Mode on', met: false, reason: 'Turn on Driver Mode before you accept deliveries.' },
  { key: 'location_permission', label: 'Location permission / GPS recent', met: false, reason: 'Location permission and a recent GPS fix are required.' },
  { key: 'no_active_delivery', label: 'No active delivery', met: true, reason: 'No active delivery is assigned in this preview state.' },
];

export default eligibilityConditions;

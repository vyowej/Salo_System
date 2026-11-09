export const settingsSections = [
  { key: 'notifications', label: 'Notification preferences' },
  { key: 'security', label: 'Password & security' },
  { key: 'location', label: 'Location guidance' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'terms', label: 'Terms & rider agreement' },
];

export const notificationPreferences = [
  { key: 'delivery_offers', label: 'Delivery offers', detail: 'New offers and assignment updates.' },
  { key: 'shift_reminders', label: 'Shift reminders', detail: 'Upcoming shifts and schedule changes.' },
  { key: 'account_updates', label: 'Account updates', detail: 'Application, profile, and document review.' },
  { key: 'payment_updates', label: 'Payment updates', detail: 'Earnings, COD, and remittance notices.' },
];

export const riderAgreementSections = [
  { title: 'Rider responsibilities', body: 'Follow applicable road rules, protect customer information, and handle each order with care.' },
  { title: 'Delivery records', body: 'Use delivery details only to complete the assigned job and submit accurate completion evidence.' },
  { title: 'Safety and support', body: 'Stop safely before using the app. Pause a delivery and contact support when conditions are unsafe.' },
];

export const profileChangeReasons = ['Contact details', 'Address', 'Vehicle information', 'Documents', 'Other'];
export const historyTableLabels = ['Order', 'Date', 'Restaurant', 'Status', 'Payment', 'Earnings'];
export const earningsTableLabels = ['Reference', 'Date', 'Amount', 'Status'];
export const dashboardMetricIcons = ['◔', '◍', '◌', '◷'];
export const dashboardQuickActions = [
  { key: 'go_online', label: 'Go Online', path: '/rider/go-online' },
  { key: 'offers', label: 'View Offers', path: '/rider/deliveries' },
  { key: 'earnings', label: 'Earnings', path: '/rider/earnings' },
  { key: 'support', label: 'Support', path: '/rider/support' },
  { key: 'safety', label: 'Safety', path: '/rider/safety' },
];
export const codTableLabels = ['Remittance', 'Date', 'Amount', 'Status'];
export const legacyEarningsTableLabels = ['Delivery', 'Date', 'Compensation', 'Incentives', 'Tips', 'Adjustments', 'Payout status'];
export const legacyDeliveryTabs = ['Delivery', 'Proof of delivery', 'Report a problem'];
export const proofDeliveryMethods = ['Hand to customer', 'Contactless'];

export function updateRecordValue(current, key, value) {
  return { ...current, [key]: value };
}

export function toggleRecordValue(current, key) {
  return { ...current, [key]: !current[key] };
}

export { RIDER_NAV_ITEMS } from './riderNavItems';
export { applicationStatuses, accountStates, availabilityStatuses, deliveryStatuses, codStatuses, ticketStatuses, shiftStatuses, statusConfig } from './statusConfig';
export { deliverySteps } from './deliverySteps';
export { vehicleTypes } from './vehicleTypes';
export { applicationDocuments } from './applicationDocuments';
export { eligibilityConditions } from './eligibilityConditions';
export { failureReasons } from './failureReasons';
export { supportCategories } from './supportCategories';
export { notificationTypeGroups, notificationTypes } from './notificationTypes';
export { filterOptions } from './filterOptions';
export { safetyContent } from './safetyContent';
export { emergencyContacts } from './emergencyContacts';

export const RIDER_SCREEN_STATES = ['Sample data', 'Loading', 'Empty', 'Error', 'Success'];
export const VEHICLE_TYPES = ['Motorcycle', 'Bicycle', 'E-bike / E-scooter', 'Other approved vehicle'];
export const RIDER_APPLICATION_STATUSES = ['Draft', 'Submitted', 'Under Review', 'Requires Additional Information', 'Approved', 'Rejected', 'Suspended'];
export const RIDER_ACCOUNT_STATES = ['Pending approval', 'Approved · Awaiting activation', 'Active', 'Suspended', 'Deactivated'];
export const AVAILABILITY_STATUSES = ['Offline', 'Online and Available', 'Receiving an Offer', 'On Delivery', 'Temporarily Unavailable', 'Shift Ended'];
export const DELIVERY_STATUSES = ['Accepted', 'Arrived', 'Picked Up', 'On the way', 'Delivered'];
export const DELIVERY_OUTCOMES = ['Completed', 'Failed', 'Cancelled'];
export const FAILURE_REASONS = ['Customer unavailable', 'Customer cannot be contacted', 'Incorrect or incomplete delivery address', 'Customer refuses the order', 'Restaurant unable to provide the order', 'Order damaged or compromised', 'Vehicle breakdown', 'Accident or safety concern', 'Severe weather or unsafe delivery conditions', 'Other unexpected circumstances'];
export const COD_STATUSES = ['Not collected', 'Collected', 'Disputed', 'Pending remittance', 'Remitted', 'Remittance confirmed'];
export const NOTIFICATION_TYPES = ['All types', 'Application', 'Shift', 'Delivery offer', 'Pickup', 'Delivery update', 'COD', 'Earnings', 'Support', 'Safety'];
export const SUPPORT_CATEGORIES = ['Delivery issue', 'Restaurant pickup issue', 'Customer issue', 'Payment or COD issue', 'Account or application issue', 'GPS or application problem', 'Accident or safety incident', 'Other concerns'];
export const SUPPORT_TICKET_STATUSES = ['Submitted', 'Under Review', 'Awaiting Rider Response', 'Resolved', 'Closed'];
export const HISTORY_FILTERS = {
  statuses: ['All statuses', ...DELIVERY_OUTCOMES],
  paymentTypes: ['All payment types', 'Cash on Delivery', 'Online paid', 'Payment pending'],
  codStatuses: ['All COD statuses', ...COD_STATUSES],
  restaurants: ['All restaurants'],
  dateRanges: ['All dates', 'Today', 'Last 7 days', 'Last 30 days', 'Custom range'],
};
export const RIDER_PAGE_META = {
  '/rider': { title: 'Rider Dashboard', eyebrow: 'Today at a glance' },
  '/rider/deliveries': { title: 'Delivery offers', eyebrow: 'Dispatch' },
  '/rider/jobs': { title: 'Delivery offers', eyebrow: 'Dispatch' },
  '/rider/deliveries/active': { title: 'Active delivery', eyebrow: 'Your current assignment' },
  '/rider/active': { title: 'Active delivery', eyebrow: 'Your current assignment' },
  '/rider/map': { title: 'Map & tracking', eyebrow: 'Location services' },
  '/rider/schedule': { title: 'Schedule & shifts', eyebrow: 'Your assigned hours' },
  '/rider/earnings': { title: 'Earnings & COD', eyebrow: 'Financial overview' },
  '/rider/history': { title: 'Delivery history', eyebrow: 'Your delivery records' },
  '/rider/notifications': { title: 'Notifications', eyebrow: 'Account and delivery updates' },
  '/rider/support': { title: 'Support & incidents', eyebrow: 'We are here to help' },
  '/rider/profile': { title: 'Profile & documents', eyebrow: 'Your rider account' },
  '/rider/settings': { title: 'Rider settings', eyebrow: 'Preferences and security' },
  '/rider/safety': { title: 'Safety & welfare', eyebrow: 'Arrive safely, every time' },
  '/rider/application': { title: 'Rider application', eyebrow: 'Join SALO delivery' },
  '/rider/application/status': { title: 'Application status', eyebrow: 'Your onboarding progress' },
  '/rider/account': { title: 'Account activation', eyebrow: 'Rider account status' },
  '/rider/activate': { title: 'Account activation', eyebrow: 'Rider account status' },
  '/rider/account-status': { title: 'Account status', eyebrow: 'Rider account status' },
};

export const RIDER_APPLICATION_FIELDS = [
  { key: 'fullName', label: 'Full name', placeholder: 'Enter your full name', type: 'text' },
  { key: 'phone', label: 'Contact number', placeholder: 'Enter a contact number', type: 'tel' },
  { key: 'address', label: 'Residential address', placeholder: 'City and barangay', type: 'text' },
  { key: 'governmentId', label: 'Government ID type / reference', placeholder: 'Select or enter ID details', type: 'text' },
];

export const SETTINGS_SECTIONS = ['Notification preferences', 'Password & security', 'Location guidance', 'Privacy', 'Terms & rider agreement', 'Sign out'];

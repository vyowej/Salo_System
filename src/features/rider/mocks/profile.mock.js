// MOCK DATA ONLY — replace with real data later.
export const profile = {
  name: 'Sample Rider',
  initials: 'SR',
  email: 'rider.sample@example.test',
  phone: 'Sample contact number',
  photo: '',
  address: 'Sample residential address',
  vehicleType: 'Motorcycle',
  vehicle: 'Sample motorcycle',
  plate: 'SAMPLE-000',
  license: 'Sample license reference',
  governmentId: 'Sample government ID',
  zone: 'Central sample zone',
  accountStatus: 'Active',
  applicationStatus: 'Under Review',
  availability: 'Offline',
  locationStatus: 'Location permission not enabled',
  rating: '—',
  totalTrips: 0,
  activeDelivery: null,
};

export const application = {
  statuses: [
    { status: 'Draft', date: 'Not submitted', note: 'Your application is saved as a draft.' },
    { status: 'Submitted', date: 'Awaiting submission', note: 'Submit the completed application for review.' },
    { status: 'Under Review', date: 'Review pending', note: 'The application is queued for administrative review.' },
    { status: 'Requires Additional Information', date: 'No request yet', note: 'Additional details will appear here if requested.' },
    { status: 'Approved', date: 'Not approved', note: 'Approval and activation instructions will appear here.' },
    { status: 'Rejected', date: 'No decision yet', note: 'Any decision explanation will appear here.' },
    { status: 'Suspended', date: 'No decision yet', note: 'Contact rider support for account assistance.' },
  ],
  requestedInformation: 'A reviewer may request updated document details here.',
  accountStates: [
    { label: 'Pending approval', detail: 'Your application is waiting for review.', tone: 'warning' },
    { label: 'Approved · Awaiting activation', detail: 'Complete account verification to activate rider access.', tone: 'info' },
    { label: 'Active', detail: 'Your account is active. Availability still depends on assigned shifts and dispatch rules.', tone: 'success' },
    { label: 'Suspended', detail: 'Rider operations are unavailable. Contact support for more information.', tone: 'danger' },
    { label: 'Deactivated', detail: 'This rider account is deactivated. Contact support if you believe this is incorrect.', tone: 'neutral' },
  ],
};

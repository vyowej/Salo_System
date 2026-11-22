/**
 * SALO — Business / Restaurant Partner Application Defaults & Constants
 */

export const BUSINESS_TYPES = [
  'Restaurant',
  'Café',
  'Bakery',
  'Fast Food',
  'Food Stall',
  'Food Kiosk',
  'Cloud Kitchen',
  'Other',
];

export const OWNERSHIP_STRUCTURES = [
  'Sole Proprietorship',
  'Partnership',
  'Corporation',
  'Cooperative',
  'Other',
];

export const CUISINE_CATEGORIES = [
  'Filipino · Grill & BBQ',
  'Filipino · Silog & Breakfast',
  'Filipino · Regional Specialties & Seafood',
  'Street Food & Charcoal BBQ',
  'Asian · Noodles & Dimsum',
  'Pizza & Pasta · Italian',
  'Burgers & Wings · American',
  'Café, Pastries & Bakery',
  'Desserts & Refreshments',
  'Healthy, Bowls & Salads',
  'Japanese & Korean',
  'Other / Fusion',
];

export const REPRESENTATIVE_POSITIONS = [
  'Business Owner',
  'Co-owner',
  'Authorized Representative',
  'Manager',
];

export const PHILIPPINE_BANKS = [
  'BDO Unibank',
  'Bank of the Philippine Islands (BPI)',
  'Metrobank',
  'Land Bank of the Philippines',
  'Philippine National Bank (PNB)',
  'Security Bank',
  'UnionBank of the Philippines',
  'Rizal Commercial Banking Corporation (RCBC)',
  'China Banking Corporation (Chinabank)',
  'EastWest Bank',
  'GCash for Business',
  'Maya Business',
  'Other',
];

export const ACCOUNT_TYPES = [
  'Savings',
  'Current / Checking',
  'Other',
];

export const PHILIPPINE_LOCATIONS = {
  'National Capital Region (NCR)': {
    'Metro Manila': {
      'Quezon City': ['South Triangle', 'Diliman', 'Katipunan', 'Cubao', 'Commonwealth', 'Batasan Hills', 'Tandang Sora'],
      'City of Manila': ['Malate', 'Ermita', 'Sampaloc', 'Binondo', 'Intramuros', 'Paco', 'Santa Cruz'],
      'Makati City': ['Poblacion', 'Bel-Air', 'San Antonio', 'Pio del Pilar', 'Legazpi Village', 'Salcedo Village'],
      'Taguig City': ['Fort Bonifacio / BGC', 'Ususan', 'Western Bicutan', 'Tanyag', 'Pinagsama'],
      'Pasig City': ['Kapitolyo', 'San Antonio', 'Ugong', 'Rosario', 'Caniogan', 'Maybunga'],
      'Mandaluyong City': ['Highway Hills', 'Wack-Wack', 'Plainview', 'Barangka Ilaya', 'Hulo'],
      'Parañaque City': ['BF Homes', 'San Antonio', 'Don Bosco', 'Baclaran', 'Sun Valley'],
      'Pasay City': ['San Jose', 'San Isidro', 'Malibay', 'Maricaban'],
    },
  },
  'Region IV-A (CALABARZON)': {
    'Rizal': {
      'Antipolo City': ['San Roque', 'Dela Paz', 'Cupang', 'Mayamot', 'Santa Cruz'],
      'Cainta': ['San Juan', 'Santo Domingo', 'San Andres'],
    },
    'Cavite': {
      'Imus City': ['Bayan Luma', 'Alapan', 'Anabu'],
      'Bacoor City': ['Molino', 'Habay', 'Panapaan'],
      'Tagaytay City': ['Maharlika', 'Mendez Crossing', 'Silang Junction'],
    },
    'Laguna': {
      'Santa Rosa City': ['Balibago', 'Tagapo', 'Don Jose'],
      'Biñan City': ['San Antonio', 'San Vicente', 'Platero'],
    },
  },
  'Region VII (Central Visayas)': {
    'Cebu': {
      'Cebu City': ['Lahug', 'Mabolo', 'Guadalupe', 'Banilad', 'Kasambagan', 'Cebu Port Area'],
      'Mandaue City': ['Subangdaku', 'Banilad', 'Centro', 'Tipolo'],
      'Lapu-Lapu City': ['Punta Engaño', 'Mactan', 'Marigondon', 'Pajo'],
    },
  },
  'Region XI (Davao Region)': {
    'Davao del Sur': {
      'Davao City': ['Poblacion District', 'Buhangin', 'Talomo', 'Agdao', 'Toril', 'Matina'],
    },
  },
};

export const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

export const MAX_APPLICATION_BRANCHES = 5;

export const APPLICATION_BRANCH_COPY = {
  questionTitle: 'Does your restaurant have other branches?',
  questionHint: 'Select Yes if you are applying for a main outlet plus additional branches under the same brand.',
  singleOptionLabel: 'No — single location only',
  multiOptionLabel: 'Yes — we have multiple branches',
  mainBranchLabel: 'Main Branch Name',
  mainBranchPlaceholder: 'e.g. Katipunan Main Branch',
  additionalHeading: 'Additional Branches',
  addBranchLabel: '+ Add Branch',
  removeBranchLabel: 'Remove',
  limitReachedHint: `Maximum of ${MAX_APPLICATION_BRANCHES} total locations (main + ${MAX_APPLICATION_BRANCHES - 1} additional branches) per application.`,
  confirmClearMessage: 'Switching back to a single location will clear your entered branch names and additional branch addresses. Continue?',
};

export function createEmptyApplicationBranch() {
  return {
    branchName: '',
    contactPhone: '',
    province: 'Metro Manila',
    city: 'Quezon City',
    barangay: 'South Triangle',
    street: '',
    houseNumber: '',
    postalCode: '',
    additionalDetails: '',
    coordinates: { lat: 14.6369, lng: 121.0362 },
    mapPinned: false,
  };
}

export const WIZARD_STEPS = [
  { step: 1, id: 'verification', label: 'Email Verification', shortLabel: 'Email OTP' },
  { step: 2, id: 'business', label: 'Business Information', shortLabel: 'Business' },
  { step: 3, id: 'representative', label: 'Authorized Representative', shortLabel: 'Owner' },
  { step: 4, id: 'documents', label: 'Documents & Permits', shortLabel: 'Docs' },
  { step: 5, id: 'address', label: 'Business Address', shortLabel: 'Address' },
  { step: 6, id: 'payout', label: 'Payout Details', shortLabel: 'Payout' },
  { step: 7, id: 'config', label: 'Restaurant Setup', shortLabel: 'Setup' },
  { step: 8, id: 'review', label: 'Review & Submit', shortLabel: 'Review' },
];

export const INITIAL_APPLICATION_STATE = {
  // Step 1: Email Verification
  emailVerification: {
    email: '',
    isSameAsAccount: true,
    isVerified: false,
    verifiedEmail: '',
    verifiedAt: null,
  },

  // Step 2: Business Info
  businessInfo: {
    restaurantName: '',
    registeredName: '',
    businessType: 'Restaurant',
    ownershipStructure: 'Sole Proprietorship',
    cuisineType: 'Filipino · Grill & BBQ',
    businessEmail: '',
    businessPhone: '',
    description: '',
  },

  // Step 3: Representative Info
  representative: {
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    dateOfBirth: '',
    email: '',
    phone: '',
    position: 'Business Owner',
    isAuthorized: false,
  },

  // Step 4: Documents (Map of docId => { file, name, size, type, previewUrl, uploadedAt })
  documents: {},

  // Step 5: Address
  address: {
    region: 'National Capital Region (NCR)',
    province: 'Metro Manila',
    city: 'Quezon City',
    barangay: 'South Triangle',
    street: '',
    postalCode: '',
    additionalDetails: '',
    coordinates: { lat: 14.6369, lng: 121.0362 },
    mapPinned: true,
    hasBranches: false,
    mainBranchName: '',
    branches: [],
  },

  // Step 6: Payout
  payout: {
    accountHolder: '',
    bankName: 'Bank of the Philippine Islands (BPI)',
    accountNumber: '',
    accountType: 'Savings',
    proofDocument: null, // Bank statement / cert file preview
  },

  // Step 7: Configuration
  configuration: {
    logo: null, // { name, src }
    coverPhoto: null, // { name, src }
    operatingHours: {
      monday: { isOpen: true, openTime: '10:00', closeTime: '22:00', isOvernight: false },
      tuesday: { isOpen: true, openTime: '10:00', closeTime: '22:00', isOvernight: false },
      wednesday: { isOpen: true, openTime: '10:00', closeTime: '22:00', isOvernight: false },
      thursday: { isOpen: true, openTime: '10:00', closeTime: '22:00', isOvernight: false },
      friday: { isOpen: true, openTime: '10:00', closeTime: '23:00', isOvernight: false },
      saturday: { isOpen: true, openTime: '10:00', closeTime: '23:00', isOvernight: false },
      sunday: { isOpen: true, openTime: '10:00', closeTime: '21:00', isOvernight: false },
    },
    services: {
      delivery: true,
      pickup: true,
      dineIn: true,
      tableReservations: false,
    },
    reservationSettings: {
      availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      startTime: '11:00',
      endTime: '21:00',
      minNoticeHours: '2',
      maxPartySize: '8',
      reservationNotes: 'Reservations held for 15 minutes past scheduled booking time.',
    },
    menuItems: [],
  },

  // Step 8: Review declarations
  review: {
    infoConfirmed: false,
    authorizationConfirmed: false,
    termsAgreed: false,
  },
};

export const APPLICATION_STATUS_CONFIG = {
  Draft: {
    label: 'Draft',
    variant: 'neutral',
    description: 'Application started but not yet submitted.',
    progress: 10,
  },
  Submitted: {
    label: 'Submitted',
    variant: 'info',
    description: 'Application successfully received and queued for compliance review.',
    progress: 30,
  },
  'Pending Submission': {
    label: 'Pending Submission',
    variant: 'warning',
    description: 'Application completed and awaiting final applicant confirmation.',
    progress: 25,
  },
  'Pending Review': {
    label: 'Pending Review',
    variant: 'warning',
    description: 'Application received and in queue for initial document intake.',
    progress: 40,
  },
  'Under Review': {
    label: 'Under Review',
    variant: 'info',
    description: 'SALO Onboarding Operations are verifying legal permits and kitchen premises.',
    progress: 65,
  },
  'Additional Documents Required': {
    label: 'Additional Documents Required',
    variant: 'danger',
    description: 'Action required: Administrator has requested additional supporting documents for your application.',
    progress: 50,
  },
  'Needs Correction': {
    label: 'Needs Correction',
    variant: 'danger',
    description: 'Action required: Administrator identified documents or details that require updates.',
    progress: 50,
  },
  Resubmitted: {
    label: 'Resubmitted',
    variant: 'info',
    description: 'Updated application details submitted and currently under expedited re-review.',
    progress: 75,
  },
  Approved: {
    label: 'Approved',
    variant: 'success',
    description: 'Application approved! Partner onboarding and kitchen readiness checklist enabled.',
    progress: 100,
  },
  Rejected: {
    label: 'Rejected',
    variant: 'danger',
    description: 'Application not approved at this time. Review feedback and appeal guidelines below.',
    progress: 100,
  },
};

/**
 * Validates Step 7 fulfillment services.
 * Backend requires at least Delivery or Pickup / Takeout (Table Reservations is optional).
 */
export function validateRestaurantServices(services = {}) {
  const hasRequiredFulfillment = Boolean(services?.delivery || services?.pickup);
  if (!hasRequiredFulfillment) {
    return 'Please select at least Delivery or Pickup / Takeout. Table Reservations is optional and cannot be the only selected service.';
  }
  return null;
}

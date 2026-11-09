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

export const WIZARD_STEPS = [
  { step: 1, id: 'business', label: 'Business Info', shortLabel: 'Business' },
  { step: 2, id: 'representative', label: 'Representative', shortLabel: 'Owner' },
  { step: 3, id: 'documents', label: 'Documents & Permits', shortLabel: 'Docs' },
  { step: 4, id: 'address', label: 'Address & Location', shortLabel: 'Address' },
  { step: 5, id: 'payout', label: 'Payout Details', shortLabel: 'Payout' },
  { step: 6, id: 'config', label: 'Configuration', shortLabel: 'Setup' },
  { step: 7, id: 'verification', label: 'Email Verification', shortLabel: 'Verify' },
  { step: 8, id: 'review', label: 'Review & Submit', shortLabel: 'Review' },
];

export const INITIAL_APPLICATION_STATE = {
  // Step 1: Business Info
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

  // Step 2: Representative Info
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

  // Step 3: Documents (Map of docId => { file, name, size, type, previewUrl, uploadedAt })
  documents: {},

  // Step 4: Address
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
  },

  // Step 5: Payout
  payout: {
    accountHolder: '',
    bankName: 'Bank of the Philippine Islands (BPI)',
    accountNumber: '',
    accountType: 'Savings',
    proofDocument: null, // Bank statement / cert file preview
  },

  // Step 6: Configuration
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

  // Step 7: Email verification state
  emailVerification: {
    isVerified: false,
    verifiedEmail: '',
    verifiedAt: null,
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

export const MOCK_ADMIN_FEEDBACK_SAMPLES = {
  'Needs Correction': {
    reviewedBy: 'SALO Onboarding Operations (Officer M. Santos)',
    reviewedAt: '2026-11-09T14:20:00Z',
    flaggedSection: 'Business Documents & Permits',
    flaggedDocument: "Mayor's / Business Permit",
    feedback: "The uploaded Mayor's Permit has expired (dated 2024/2025). Please upload the official 2026 Business Permit renewal receipt or certified temporary operating clearance from the City Licensing Office. Ensure all four corners of the certificate are clearly legible.",
    actionPrompt: 'Upload Updated Permit Document',
  },
  Rejected: {
    reviewedBy: 'SALO Partner Compliance Committee',
    reviewedAt: '2026-11-08T16:45:00Z',
    reason: 'Ineligible operating location or duplicate business registration detected under another active SALO merchant account.',
    details: 'The submitted physical kitchen address is currently registered under an active partner agreement with exclusivity commitments. For questions or disputes, please contact partner-support@salo.ph referencing your application code.',
  },
  Approved: {
    reviewedBy: 'SALO Merchant Onboarding Team',
    reviewedAt: '2026-11-09T11:00:00Z',
    note: 'Congratulations! All business registrations, TIN verification, and local permits have passed validation.',
    activationChecklist: [
      { id: 'profile', text: 'Confirm restaurant profile and kitchen contact numbers', done: true },
      { id: 'hours', text: 'Review confirmed weekly operating & pickup hours', done: true },
      { id: 'menu', text: 'Upload restaurant dish photos and customize add-ons/variations', done: false },
      { id: 'bank', text: 'Settlement test deposit verification (scheduled within 48h)', done: false },
      { id: 'inspection', text: 'Optional virtual kitchen onboarding call with SALO Merchant Success', done: false },
    ],
  },
};

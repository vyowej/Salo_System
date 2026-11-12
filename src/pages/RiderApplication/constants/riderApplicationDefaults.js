/**
 * SALO — Rider Application Defaults & Constants
 */

export const DELIVERY_METHODS = [
  {
    key: 'motorcycle',
    label: 'Motorcycle',
    displayLabel: 'Motorcycle',
    icon: 'motorcycle',
    requirementsSummary: "Driver's license and LTO OR/CR required",
    maxRadius: '8-12 km',
  },
  {
    key: 'bicycle',
    label: 'Bicycle',
    displayLabel: 'Bicycle',
    icon: 'bicycle',
    requirementsSummary: 'Helmet and a roadworthy bicycle are required',
    maxRadius: '3-5 km',
  },
  {
    key: 'e_bike',
    label: 'E-bike / Electric Bicycle',
    displayLabel: 'E-bike',
    icon: 'electricBicycle',
    requirementsSummary: 'Helmet, safety gear, and battery specs required',
    maxRadius: '5-8 km',
  },
  {
    key: 'e_scooter',
    label: 'E-scooter',
    displayLabel: 'E-scooter',
    icon: 'electricScooter',
    requirementsSummary: 'Protective helmet and speed-compliant scooter required',
    maxRadius: '3-5 km',
  },
  {
    key: 'walking',
    label: 'Walking / Walker',
    displayLabel: 'Walking',
    icon: 'walking',
    requirementsSummary: 'Thermal delivery backpack required; no vehicle needed',
    maxRadius: '1-2 km',
  },
];

export const GOVERNMENT_ID_OPTIONS = [
  'Philippine National ID (PhilID)',
  "Driver's License",
  'Philippine Passport',
  'Unified Multi-Purpose ID (UMID)',
  'SSS ID (Social Security System)',
  'Postal ID (Digitized)',
  'PRC ID (Professional Regulation)',
  "Voter's ID / Comelec Certificate",
  'Other Valid Government ID',
];

export const MOTORCYCLE_OWNERSHIP_OPTIONS = [
  'Personally Owned',
  'Family-Owned (Parent / Spouse / Sibling)',
  'Borrowed',
  'Rented / Leased',
  'Company-Owned',
];

export const BICYCLE_TYPES = [
  'Road Bike',
  'Mountain Bike (MTB)',
  'City / Commuter Bike',
  'Folding Bike',
  'Gravel Bike',
  'Cargo Bike',
  'Other',
];

export const EMERGENCY_RELATIONSHIPS = [
  'Parent',
  'Spouse / Partner',
  'Sibling',
  'Child',
  'Relative',
  'Friend',
  'Colleague',
  'Other',
];

export const RIDER_PAYOUT_PROVIDERS = [
  'GCash',
  'Maya',
  'Bank of the Philippine Islands (BPI)',
  'BDO Unibank',
  'UnionBank of the Philippines',
  'Metrobank',
  'Land Bank of the Philippines',
  'Security Bank',
  'Philippine National Bank (PNB)',
  'Rizal Commercial Banking Corporation (RCBC)',
  'Other Supported Bank',
];

export const RIDER_PAYOUT_ACCOUNT_TYPES = [
  'E-Wallet (GCash / Maya)',
  'Savings Account',
  'Current / Checking Account',
];

export const RIDER_SHIFTS = [
  { key: 'morning', label: 'Breakfast Shift (6:00 AM – 11:00 AM)' },
  { key: 'lunch', label: 'Lunch Rush (11:00 AM – 2:00 PM)' },
  { key: 'afternoon', label: 'Afternoon Merienda (2:00 PM – 6:00 PM)' },
  { key: 'dinner', label: 'Dinner Gathering (6:00 PM – 10:00 PM)' },
  { key: 'late_night', label: 'Late Night Delivery (10:00 PM – 2:00 AM)' },
  { key: 'flexible', label: 'Flexible / On-Demand Dispatch' },
];

export const RIDER_DAYS_OF_WEEK = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

export const RIDER_APPLICATION_STEPS = [
  { step: 1, id: 'email_otp', label: 'Company & Email OTP', shortLabel: 'Email OTP' },
  { step: 2, id: 'personal', label: 'Personal Information', shortLabel: 'Personal' },
  { step: 3, id: 'identity', label: 'Identity Verification', shortLabel: 'Identity' },
  { step: 4, id: 'delivery_method', label: 'Delivery Method', shortLabel: 'Method' },
  { step: 5, id: 'vehicle_info', label: 'Vehicle Details', shortLabel: 'Vehicle' },
  { step: 6, id: 'vehicle_docs', label: 'Vehicle Documents', shortLabel: 'Veh Docs' },
  { step: 7, id: 'clearances', label: 'Background Clearances', shortLabel: 'Clearances' },
  { step: 8, id: 'emergency', label: 'Coverage & Contact', shortLabel: 'Coverage' },
  { step: 9, id: 'payout', label: 'Payout Details', shortLabel: 'Payout' },
  { step: 10, id: 'agreement_review', label: 'Agreement & Review', shortLabel: 'Review' },
];

export const INITIAL_RIDER_APPLICATION_STATE = {
  // Step 1: Company & Email OTP Verification (Mandatory Gate)
  emailVerification: {
    companyName: '',
    email: '',
    isVerified: false,
    verifiedEmail: '',
    verifiedAt: null,
  },

  // Step 2: Personal & Contact Information
  personal: {
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    dateOfBirth: '',
    gender: 'Prefer not to say',
    email: '',
    phone: '',
    address: {
      street: '',
      barangay: 'South Triangle',
      city: 'Quezon City',
      province: 'Metro Manila',
      postalCode: '',
    },
  },

  // Step 3: Identity Verification
  identity: {
    idType: GOVERNMENT_ID_OPTIONS[0],
    idNumber: '',
    expiryDate: '',
    isPermanent: false,
    frontPhoto: null,
    backPhoto: null,
    selfiePhoto: null,
  },

  // Step 4: Delivery Method
  deliveryMethod: 'motorcycle',

  // Step 5: Vehicle Info (Conditional)
  vehicleInfo: {
    // Motorcycle
    motoBrand: '',
    motoModel: '',
    motoYear: '2023',
    motoColor: '',
    plateNumber: '',
    mvFileNumber: '',
    ownership: 'Personally Owned',
    ownerName: '',
    ownerRelationship: '',

    // Bicycle
    bikeType: BICYCLE_TYPES[0],
    bikeBrand: '',
    bikeModel: '',
    bikeColor: '',

    // E-bike & E-scooter
    ebikeBrand: '',
    ebikeModel: '',
    ebikeColor: '',
    ebikeWattage: '',
    escooterBrand: '',
    escooterModel: '',
    escooterColor: '',

    // Photo
    vehiclePhoto: null,
  },

  // Step 6: Vehicle Documents (Map of docId => file metadata)
  vehicleDocuments: {},

  // Step 7: Clearances
  clearanceDocuments: {},

  // Step 8: Emergency & Preferences
  emergency: {
    contactName: '',
    relationship: EMERGENCY_RELATIONSHIPS[0],
    phone: '',
    altPhone: '',
    preferredCity: 'Quezon City',
    preferredBarangayHubs: 'Tomas Morato, Timog Ave, Scout Area',
    preferredShifts: ['lunch', 'dinner'],
    availableDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  },

  // Step 9: Payout
  payout: {
    accountHolder: '',
    provider: 'GCash',
    accountNumber: '',
    accountType: 'E-Wallet (GCash / Maya)',
    proofDocument: null,
  },

  // Step 10: Agreement & Declarations
  declarations: {
    infoConfirmed: false,
    documentsGenuine: false,
    safetyPolicyAgreed: false,
    termsAgreed: false,
  },
};

export const RIDER_STATUS_CONFIG = {
  Draft: {
    label: 'Draft',
    variant: 'neutral',
    description: 'Application started but not yet submitted.',
    progress: 10,
  },
  'Pending Submission': {
    label: 'Pending Submission',
    variant: 'warning',
    description: 'All steps completed. Ready for final review and submission.',
    progress: 25,
  },
  'Pending Review': {
    label: 'Pending Review',
    variant: 'warning',
    description: 'Application submitted and queued for intake verification.',
    progress: 40,
  },
  'Under Review': {
    label: 'Under Review',
    variant: 'info',
    description: 'SALO Fleet Operations is reviewing identity, license, and background clearances.',
    progress: 65,
  },
  'Needs Correction': {
    label: 'Needs Correction',
    variant: 'danger',
    description: 'Action required: Administrator requested updated documents or details.',
    progress: 50,
  },
  Resubmitted: {
    label: 'Resubmitted',
    variant: 'info',
    description: 'Updated application submitted and under expedited review.',
    progress: 75,
  },
  Approved: {
    label: 'Approved',
    variant: 'success',
    description: 'Application approved! Complete onboarding orientation to activate your rider account.',
    progress: 100,
  },
  Rejected: {
    label: 'Rejected',
    variant: 'danger',
    description: 'Application not approved at this time. Review feedback and appeal guidance below.',
    progress: 100,
  },
};

export const MOCK_RIDER_ADMIN_FEEDBACK = {
  'Needs Correction': {
    reviewedBy: 'SALO Fleet Safety & Compliance (Officer R. Dalisay)',
    reviewedAt: '2026-11-09T14:35:00Z',
    flaggedSection: 'Driver & Vehicle Documents',
    flaggedDocument: "Driver's License (Front & Back)",
    feedback: "The uploaded Driver's License photo is blurry and the license expiry date is obscured. Please re-upload a clear, high-resolution color photo of both front and back with all four corners visible.",
    actionPrompt: 'Update Driver’s License Document',
  },
  Rejected: {
    reviewedBy: 'SALO Fleet Safety Committee',
    reviewedAt: '2026-11-08T17:15:00Z',
    reason: 'Vehicle does not meet current road safety and emissions standards, or incomplete background clearance.',
    details: 'Our fleet intake requirements stipulate that all delivery vehicles must possess active registration and unblemished clearances. You may re-apply after 60 days with valid clearances.',
  },
  Approved: {
    reviewedBy: 'SALO Rider Fleet Operations',
    reviewedAt: '2026-11-09T12:00:00Z',
    note: 'Welcome to the SALO Rider Partner Network! Your identity, vehicle registration, and background documents have passed compliance verification.',
    activationChecklist: [
      { id: 'guidelines', text: 'Review the SALO Rider Safety Handbook & Food Handling Guidelines', done: true },
      { id: 'orientation', text: 'Watch the 10-minute online defensive driving & rider welfare orientation', done: true },
      { id: 'gear', text: 'Schedule thermal delivery bag & uniform kit pickup at SALO Logistics Hub', done: false },
      { id: 'dispatch_walkthrough', text: 'Walk through the live order acceptance, navigation, and COD flow in the Rider app', done: false },
      { id: 'first_shift', text: 'Select your first delivery zone and submit your active weekly shift preferences', done: false },
    ],
  },
};

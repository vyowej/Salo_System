/**
 * SALO — Rider Application Document Matrix
 * Dynamic document requirements based on selected delivery method (Motorcycle, Bicycle, E-bike, E-scooter, Walking).
 */

export const RIDER_DOC_TYPES = {
  // Identity
  GOV_ID_FRONT: 'id_front',
  GOV_ID_BACK: 'id_back',
  SELFIE_PHOTO: 'selfie_photo',

  // Vehicle (Motorcycle)
  DRIVER_LICENSE: 'driver_license',
  LTO_OR: 'lto_or',
  LTO_CR: 'lto_cr',
  MOTORCYCLE_PHOTO: 'motorcycle_photo',
  VEHICLE_AUTHORIZATION: 'vehicle_authorization',
  MOTOR_INSURANCE: 'motor_insurance',

  // Vehicle (Bicycle)
  BICYCLE_PHOTO: 'bicycle_photo',
  BICYCLE_PROOF: 'bicycle_proof',

  // Vehicle (E-bike & E-scooter)
  EBIKE_PHOTO: 'ebike_photo',
  EBIKE_PROOF: 'ebike_proof',
  ESCOOTER_PHOTO: 'escooter_photo',
  ESCOOTER_PROOF: 'escooter_proof',

  // Clearances
  NBI_CLEARANCE: 'nbi_clearance',
  POLICE_CLEARANCE: 'police_clearance',
  BARANGAY_CLEARANCE: 'barangay_clearance',
  MEDICAL_CLEARANCE: 'medical_clearance',

  // Payout Proof
  PAYOUT_PROOF: 'payout_proof',
};

export const RIDER_DOC_CATALOG = {
  // Identity
  [RIDER_DOC_TYPES.GOV_ID_FRONT]: {
    id: RIDER_DOC_TYPES.GOV_ID_FRONT,
    title: 'Government-Issued ID (Front)',
    description: 'Clear, glare-free color photo of the front side of your selected valid Government ID.',
    category: 'Identity Verification',
    acceptedFormats: 'JPG, PNG, PDF',
    maxSizeMb: 10,
  },
  [RIDER_DOC_TYPES.GOV_ID_BACK]: {
    id: RIDER_DOC_TYPES.GOV_ID_BACK,
    title: 'Government-Issued ID (Back)',
    description: 'Clear photo of the back side of your ID showing serial barcodes and signature.',
    category: 'Identity Verification',
    acceptedFormats: 'JPG, PNG, PDF',
    maxSizeMb: 10,
  },
  [RIDER_DOC_TYPES.SELFIE_PHOTO]: {
    id: RIDER_DOC_TYPES.SELFIE_PHOTO,
    title: 'Rider Profile Photo / Face Selfie',
    description: 'Well-lit headshot against a plain background without sunglasses or face masks.',
    category: 'Identity Verification',
    acceptedFormats: 'JPG, PNG',
    maxSizeMb: 10,
  },

  // Motorcycle
  [RIDER_DOC_TYPES.DRIVER_LICENSE]: {
    id: RIDER_DOC_TYPES.DRIVER_LICENSE,
    title: "Driver's License (Front & Back)",
    description: "Valid LTO Driver's License (Professional or Non-Professional) with Motorcycle Restriction Code (Code A / 1).",
    category: 'Driver Credentials',
    acceptedFormats: 'JPG, PNG, PDF',
    maxSizeMb: 10,
  },
  [RIDER_DOC_TYPES.LTO_OR]: {
    id: RIDER_DOC_TYPES.LTO_OR,
    title: 'LTO Official Receipt (OR)',
    description: 'Current and validated Land Transportation Office (LTO) Official Receipt for the motorcycle.',
    category: 'Vehicle Registration',
    acceptedFormats: 'JPG, PNG, PDF',
    maxSizeMb: 10,
  },
  [RIDER_DOC_TYPES.LTO_CR]: {
    id: RIDER_DOC_TYPES.LTO_CR,
    title: 'LTO Certificate of Registration (CR)',
    description: 'Official LTO Certificate of Registration showing engine number and registered owner.',
    category: 'Vehicle Registration',
    acceptedFormats: 'JPG, PNG, PDF',
    maxSizeMb: 10,
  },
  [RIDER_DOC_TYPES.MOTORCYCLE_PHOTO]: {
    id: RIDER_DOC_TYPES.MOTORCYCLE_PHOTO,
    title: 'Motorcycle Photo with Visible License Plate',
    description: 'Clear side or front-angle photo of your motorcycle showing the license plate or conduction sticker.',
    category: 'Vehicle Verification',
    acceptedFormats: 'JPG, PNG',
    maxSizeMb: 10,
  },
  [RIDER_DOC_TYPES.VEHICLE_AUTHORIZATION]: {
    id: RIDER_DOC_TYPES.VEHICLE_AUTHORIZATION,
    title: 'Vehicle Owner Authorization Letter & Owner Valid ID',
    description: 'Signed letter from the registered owner granting permission to operate the motorcycle for SALO deliveries.',
    category: 'Vehicle Verification',
    acceptedFormats: 'JPG, PNG, PDF',
    maxSizeMb: 10,
  },
  [RIDER_DOC_TYPES.MOTOR_INSURANCE]: {
    id: RIDER_DOC_TYPES.MOTOR_INSURANCE,
    title: 'Third-Party Liability (TPL) or Comprehensive Insurance Policy',
    description: 'Valid vehicle insurance policy covering road incidents and accidental damages.',
    category: 'Vehicle Verification',
    acceptedFormats: 'JPG, PNG, PDF',
    maxSizeMb: 10,
  },

  // Bicycle
  [RIDER_DOC_TYPES.BICYCLE_PHOTO]: {
    id: RIDER_DOC_TYPES.BICYCLE_PHOTO,
    title: 'Bicycle & Safety Helmet Photo',
    description: 'Photo of the bicycle you will use for delivery alongside your safety helmet.',
    category: 'Equipment Verification',
    acceptedFormats: 'JPG, PNG',
    maxSizeMb: 10,
  },
  [RIDER_DOC_TYPES.BICYCLE_PROOF]: {
    id: RIDER_DOC_TYPES.BICYCLE_PROOF,
    title: 'Proof of Bicycle Purchase or Ownership Receipt',
    description: 'Store receipt, sales invoice, or warranty card confirming ownership of the bicycle.',
    category: 'Equipment Verification',
    acceptedFormats: 'JPG, PNG, PDF',
    maxSizeMb: 10,
  },

  // E-bike
  [RIDER_DOC_TYPES.EBIKE_PHOTO]: {
    id: RIDER_DOC_TYPES.EBIKE_PHOTO,
    title: 'E-bike & Safety Helmet Photo',
    description: 'Clear photo of the electric bicycle, battery enclosure, and approved helmet.',
    category: 'Equipment Verification',
    acceptedFormats: 'JPG, PNG',
    maxSizeMb: 10,
  },
  [RIDER_DOC_TYPES.EBIKE_PROOF]: {
    id: RIDER_DOC_TYPES.EBIKE_PROOF,
    title: 'E-bike Purchase Invoice or Specifications',
    description: 'Sales invoice or official user manual showing motor wattage and vehicle model.',
    category: 'Equipment Verification',
    acceptedFormats: 'JPG, PNG, PDF',
    maxSizeMb: 10,
  },

  // E-scooter
  [RIDER_DOC_TYPES.ESCOOTER_PHOTO]: {
    id: RIDER_DOC_TYPES.ESCOOTER_PHOTO,
    title: 'E-scooter & Safety Helmet Photo',
    description: 'Photo of your electric kick scooter and protective helmet.',
    category: 'Equipment Verification',
    acceptedFormats: 'JPG, PNG',
    maxSizeMb: 10,
  },
  [RIDER_DOC_TYPES.ESCOOTER_PROOF]: {
    id: RIDER_DOC_TYPES.ESCOOTER_PROOF,
    title: 'E-scooter Sales Invoice or Specifications',
    description: 'Purchase receipt or manufacturer manual stating speed rating and model.',
    category: 'Equipment Verification',
    acceptedFormats: 'JPG, PNG, PDF',
    maxSizeMb: 10,
  },

  // Clearances
  [RIDER_DOC_TYPES.NBI_CLEARANCE]: {
    id: RIDER_DOC_TYPES.NBI_CLEARANCE,
    title: 'NBI Clearance (Valid / Unexpired)',
    description: 'National Bureau of Investigation clearance certificate issued within the last 12 months.',
    category: 'Background Clearances',
    acceptedFormats: 'JPG, PNG, PDF',
    maxSizeMb: 10,
  },
  [RIDER_DOC_TYPES.POLICE_CLEARANCE]: {
    id: RIDER_DOC_TYPES.POLICE_CLEARANCE,
    title: 'National Police Clearance (NPC)',
    description: 'Philippine National Police (PNP) clearance verifying clean background record.',
    category: 'Background Clearances',
    acceptedFormats: 'JPG, PNG, PDF',
    maxSizeMb: 10,
  },
  [RIDER_DOC_TYPES.BARANGAY_CLEARANCE]: {
    id: RIDER_DOC_TYPES.BARANGAY_CLEARANCE,
    title: 'Barangay Clearance for Employment',
    description: 'Clearance from the barangay of your current residential address.',
    category: 'Background Clearances',
    acceptedFormats: 'JPG, PNG, PDF',
    maxSizeMb: 10,
  },
  [RIDER_DOC_TYPES.MEDICAL_CLEARANCE]: {
    id: RIDER_DOC_TYPES.MEDICAL_CLEARANCE,
    title: 'Medical Certificate / Fit to Work',
    description: 'Medical assessment certifying fitness for physical delivery work and food handling.',
    category: 'Health & Safety',
    acceptedFormats: 'JPG, PNG, PDF',
    maxSizeMb: 10,
  },

  // Payout Proof
  [RIDER_DOC_TYPES.PAYOUT_PROOF]: {
    id: RIDER_DOC_TYPES.PAYOUT_PROOF,
    title: 'Proof of E-Wallet / Bank Account Ownership',
    description: 'Screenshot of your verified GCash/Maya profile or bank passbook/statement header showing account name.',
    category: 'Payout Verification',
    acceptedFormats: 'JPG, PNG, PDF',
    maxSizeMb: 10,
  },
};

/**
 * Returns conditional vehicle document requirements array based on delivery method and ownership.
 */
export function getVehicleDocuments(deliveryMethod, ownership = 'Personally Owned') {
  const docs = [];

  if (deliveryMethod === 'motorcycle') {
    docs.push({ ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.DRIVER_LICENSE], required: true });
    docs.push({ ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.LTO_OR], required: true });
    docs.push({ ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.LTO_CR], required: true });
    docs.push({ ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.MOTORCYCLE_PHOTO], required: true });

    if (ownership !== 'Personally Owned') {
      docs.push({ ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.VEHICLE_AUTHORIZATION], required: true });
    }
    docs.push({ ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.MOTOR_INSURANCE], required: false });
  } else if (deliveryMethod === 'bicycle') {
    docs.push({ ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.BICYCLE_PHOTO], required: true });
    docs.push({ ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.BICYCLE_PROOF], required: false });
  } else if (deliveryMethod === 'e_bike') {
    docs.push({ ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.EBIKE_PHOTO], required: true });
    docs.push({ ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.EBIKE_PROOF], required: false });
  } else if (deliveryMethod === 'e_scooter') {
    docs.push({ ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.ESCOOTER_PHOTO], required: true });
    docs.push({ ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.ESCOOTER_PROOF], required: false });
  }

  // Walking couriers require no vehicle documents
  return docs;
}

/**
 * Returns the clearance documents list.
 */
export function getClearanceDocuments() {
  return [
    { ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.NBI_CLEARANCE], required: false, note: 'Provide NBI or Police Clearance' },
    { ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.POLICE_CLEARANCE], required: false, note: 'Provide NBI or Police Clearance' },
    { ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.BARANGAY_CLEARANCE], required: false },
    { ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.MEDICAL_CLEARANCE], required: false },
  ];
}

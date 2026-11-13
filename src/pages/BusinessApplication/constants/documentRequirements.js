/**
 * SALO — Restaurant Partner Document Requirements Matrix
 * Categorized document classification: Mandatory, Conditional, and Supporting.
 */

export const DOCUMENT_TYPES = {
  DTI_CERTIFICATE: 'dti_certificate',
  SEC_CERTIFICATE: 'sec_certificate',
  CDA_CERTIFICATE: 'cda_certificate',
  OTHER_REGISTRATION: 'other_registration',
  BIR_2303: 'bir_2303',
  MAYORS_PERMIT: 'mayors_permit',
  BARANGAY_CLEARANCE: 'barangay_clearance',
  GOVERNMENT_ID: 'government_id',
  PROOF_OF_ADDRESS: 'proof_of_address',
  AUTHORIZATION_LETTER: 'authorization_letter',
  SANITARY_PERMIT: 'sanitary_permit',
  FIRE_SAFETY_PERMIT: 'fire_safety_permit',
  BANK_PROOF: 'bank_proof',
};

export const DOCUMENT_CATALOG = {
  [DOCUMENT_TYPES.DTI_CERTIFICATE]: {
    id: DOCUMENT_TYPES.DTI_CERTIFICATE,
    title: 'DTI Business Name Certificate',
    description: 'Current Certificate of Business Name Registration issued by the Department of Trade and Industry (DTI).',
    whyNeeded: 'Verifies the official registration and sole proprietorship legal business name with the Department of Trade and Industry (DTI).',
    category: 'Business Registration',
    classification: 'mandatory',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.SEC_CERTIFICATE]: {
    id: DOCUMENT_TYPES.SEC_CERTIFICATE,
    title: 'SEC Certificate of Registration',
    description: 'Securities and Exchange Commission (SEC) Registration including Articles of Incorporation/Partnership.',
    whyNeeded: 'Verifies the corporate or partnership legal personality, registration number, and registered officers with the SEC.',
    category: 'Business Registration',
    classification: 'mandatory',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.CDA_CERTIFICATE]: {
    id: DOCUMENT_TYPES.CDA_CERTIFICATE,
    title: 'CDA Registration Certificate',
    description: 'Cooperative Development Authority (CDA) Certificate of Registration and Cooperative By-laws.',
    whyNeeded: 'Verifies the legal existence, operating registration, and cooperative by-laws registered with the Cooperative Development Authority (CDA).',
    category: 'Business Registration',
    classification: 'mandatory',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.OTHER_REGISTRATION]: {
    id: DOCUMENT_TYPES.OTHER_REGISTRATION,
    title: 'Proof of Business Registration',
    description: 'Official registration documentation validating legal recognition of the operating food establishment.',
    whyNeeded: 'Validates government recognition and legitimacy of the operating food business under applicable Philippine regulations.',
    category: 'Business Registration',
    classification: 'mandatory',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.BIR_2303]: {
    id: DOCUMENT_TYPES.BIR_2303,
    title: 'BIR Form 2303 (Certificate of Registration)',
    description: 'Bureau of Internal Revenue (BIR) Certificate of Registration indicating registered Tax Identification Number (TIN) and tax types.',
    whyNeeded: 'Confirms registered Tax Identification Number (TIN), legal entity name, and tax classification for billing and withholding compliance.',
    category: 'Tax Registration',
    classification: 'supporting',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.MAYORS_PERMIT]: {
    id: DOCUMENT_TYPES.MAYORS_PERMIT,
    title: "Mayor's / Business Permit",
    description: 'Valid Mayor’s or Local Government Business Permit for the current operating year for your food establishment location.',
    whyNeeded: 'Confirms authorization from the Local Government Unit (LGU) to legally conduct commercial food operations for the current operating year.',
    category: 'Local Government Permits',
    classification: 'mandatory',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.BARANGAY_CLEARANCE]: {
    id: DOCUMENT_TYPES.BARANGAY_CLEARANCE,
    title: 'Barangay Business Clearance',
    description: 'Local Barangay Business Clearance endorsing restaurant operation within the jurisdiction.',
    whyNeeded: 'Evidences local community-level endorsement and commercial compliance within the host barangay jurisdiction.',
    category: 'Local Government Permits',
    classification: 'supporting',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.SANITARY_PERMIT]: {
    id: DOCUMENT_TYPES.SANITARY_PERMIT,
    title: 'Sanitary Permit / Health Certificate',
    description: 'City/Municipal Health Office inspection certificate for food preparation and hygiene standards.',
    whyNeeded: 'Validates kitchen sanitation, health standards, and safe food-handling compliance inspected by the local health office.',
    category: 'Local Government Permits',
    classification: 'supporting',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.FIRE_SAFETY_PERMIT]: {
    id: DOCUMENT_TYPES.FIRE_SAFETY_PERMIT,
    title: 'Fire Safety Inspection Certificate (FSIC)',
    description: 'Bureau of Fire Protection (BFP) clearance certifying compliance with fire safety regulations.',
    whyNeeded: 'Certifies kitchen and dining premises compliance with the Fire Code of the Philippines issued by the Bureau of Fire Protection (BFP).',
    category: 'Local Government Permits',
    classification: 'supporting',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.GOVERNMENT_ID]: {
    id: DOCUMENT_TYPES.GOVERNMENT_ID,
    title: 'Valid Government-Issued ID',
    description: 'Passport, UMID, Driver’s License, PhilID (National ID), or PRC ID of the owner or authorized representative.',
    whyNeeded: 'Authenticates the legal identity of the owner or representative binding the establishment to SALO terms.',
    category: 'Identity Verification',
    classification: 'mandatory',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.PROOF_OF_ADDRESS]: {
    id: DOCUMENT_TYPES.PROOF_OF_ADDRESS,
    title: 'Proof of Business Address',
    description: 'Commercial lease contract, recent utility bill (power/water within last 3 months), or property title for the kitchen location.',
    whyNeeded: 'Confirms the physical restaurant or kitchen location for delivery rider dispatch, customer pickups, and service coverage.',
    category: 'Location Verification',
    classification: 'mandatory',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.AUTHORIZATION_LETTER]: {
    id: DOCUMENT_TYPES.AUTHORIZATION_LETTER,
    title: "Secretary's Certificate / Board Resolution / Authorization Letter",
    description: 'Official corporate resolution or notarized letter authorizing the representative to enter into contracts with SALO.',
    whyNeeded: 'Establishes legal authority for a non-owner manager or representative to represent the business and bind it to partner agreements.',
    category: 'Representative Authorization',
    classification: 'conditional',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.BANK_PROOF]: {
    id: DOCUMENT_TYPES.BANK_PROOF,
    title: 'Proof of Bank Account Ownership',
    description: 'Bank certificate, deposit slip, or first page of bank statement showing account name and account number (balances can be blurred).',
    whyNeeded: 'Validates bank account details for merchant payout disbursements.',
    category: 'Payout Verification',
    classification: 'supporting',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
};

/**
 * Returns categorized documents: mandatory, conditional, and supporting.
 */
export function getDocumentClassification(ownershipStructure, position) {
  const isRepresentative = position === 'Authorized Representative' || position === 'Manager';

  // 1. Mandatory Business Registration based on ownership structure
  let registrationDoc;
  if (ownershipStructure === 'Sole Proprietorship') {
    registrationDoc = { ...DOCUMENT_CATALOG[DOCUMENT_TYPES.DTI_CERTIFICATE], required: true };
  } else if (ownershipStructure === 'Corporation' || ownershipStructure === 'Partnership') {
    registrationDoc = { ...DOCUMENT_CATALOG[DOCUMENT_TYPES.SEC_CERTIFICATE], required: true };
  } else if (ownershipStructure === 'Cooperative') {
    registrationDoc = { ...DOCUMENT_CATALOG[DOCUMENT_TYPES.CDA_CERTIFICATE], required: true };
  } else {
    registrationDoc = { ...DOCUMENT_CATALOG[DOCUMENT_TYPES.OTHER_REGISTRATION], required: true };
  }

  const mandatory = [
    registrationDoc,
    { ...DOCUMENT_CATALOG[DOCUMENT_TYPES.GOVERNMENT_ID], required: true },
    { ...DOCUMENT_CATALOG[DOCUMENT_TYPES.MAYORS_PERMIT], required: true },
    { ...DOCUMENT_CATALOG[DOCUMENT_TYPES.PROOF_OF_ADDRESS], required: true },
  ];

  // 2. Conditional Documents
  const conditional = [];
  if (isRepresentative) {
    conditional.push({
      ...DOCUMENT_CATALOG[DOCUMENT_TYPES.AUTHORIZATION_LETTER],
      required: true,
      conditionMessage: `Required because you identified your role as ${position}. Non-owner representatives must provide proof of authority.`,
    });
  }

  // 3. Additional Supporting Documents (Optional - never blocks submission)
  const supporting = [
    { ...DOCUMENT_CATALOG[DOCUMENT_TYPES.BIR_2303], required: false },
    { ...DOCUMENT_CATALOG[DOCUMENT_TYPES.BARANGAY_CLEARANCE], required: false },
    { ...DOCUMENT_CATALOG[DOCUMENT_TYPES.SANITARY_PERMIT], required: false },
    { ...DOCUMENT_CATALOG[DOCUMENT_TYPES.FIRE_SAFETY_PERMIT], required: false },
  ];

  return {
    mandatory,
    conditional,
    supporting,
  };
}

/**
 * Returns a flat array of all applicable documents for the wizard step,
 * keeping backwards compatibility with existing consumers.
 */
export function getRequiredDocuments(ownershipStructure, position) {
  const { mandatory, conditional, supporting } = getDocumentClassification(ownershipStructure, position);
  return [...mandatory, ...conditional, ...supporting];
}

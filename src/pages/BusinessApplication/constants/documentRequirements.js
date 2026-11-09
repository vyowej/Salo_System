/**
 * SALO — Restaurant Partner Document Requirements Matrix
 * Conditional requirements dynamically determined by selected business ownership structure.
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
    category: 'Business Registration',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.SEC_CERTIFICATE]: {
    id: DOCUMENT_TYPES.SEC_CERTIFICATE,
    title: 'SEC Certificate of Registration',
    description: 'Securities and Exchange Commission (SEC) Registration including Articles of Incorporation/Partnership.',
    category: 'Business Registration',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.CDA_CERTIFICATE]: {
    id: DOCUMENT_TYPES.CDA_CERTIFICATE,
    title: 'CDA Registration Certificate',
    description: 'Cooperative Development Authority (CDA) Certificate of Registration and Cooperative By-laws.',
    category: 'Business Registration',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.OTHER_REGISTRATION]: {
    id: DOCUMENT_TYPES.OTHER_REGISTRATION,
    title: 'Proof of Business Registration',
    description: 'Official registration documentation validating legal recognition of the operating food establishment.',
    category: 'Business Registration',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.BIR_2303]: {
    id: DOCUMENT_TYPES.BIR_2303,
    title: 'BIR Form 2303 (Certificate of Registration)',
    description: 'Bureau of Internal Revenue (BIR) Certificate of Registration indicating registered Tax Identification Number (TIN) and tax types.',
    category: 'Tax Registration',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.MAYORS_PERMIT]: {
    id: DOCUMENT_TYPES.MAYORS_PERMIT,
    title: "Mayor's / Business Permit",
    description: 'Valid Mayor’s or Local Government Business Permit for the current operating year for your food establishment location.',
    category: 'Local Government Permits',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.BARANGAY_CLEARANCE]: {
    id: DOCUMENT_TYPES.BARANGAY_CLEARANCE,
    title: 'Barangay Business Clearance',
    description: 'Local Barangay Business Clearance endorsing restaurant operation within the jurisdiction.',
    category: 'Local Government Permits',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.SANITARY_PERMIT]: {
    id: DOCUMENT_TYPES.SANITARY_PERMIT,
    title: 'Sanitary Permit / Health Certificate',
    description: 'City/Municipal Health Office inspection certificate for food preparation and hygiene standards.',
    category: 'Local Government Permits',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.FIRE_SAFETY_PERMIT]: {
    id: DOCUMENT_TYPES.FIRE_SAFETY_PERMIT,
    title: 'Fire Safety Inspection Certificate (FSIC)',
    description: 'Bureau of Fire Protection (BFP) clearance certifying compliance with fire safety regulations.',
    category: 'Local Government Permits',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.GOVERNMENT_ID]: {
    id: DOCUMENT_TYPES.GOVERNMENT_ID,
    title: 'Valid Government-Issued ID',
    description: 'Passport, UMID, Driver’s License, PhilID (National ID), or PRC ID of the owner or authorized representative.',
    category: 'Identity Verification',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.PROOF_OF_ADDRESS]: {
    id: DOCUMENT_TYPES.PROOF_OF_ADDRESS,
    title: 'Proof of Business Address',
    description: 'Commercial lease contract, recent utility bill (power/water within last 3 months), or property title for the kitchen location.',
    category: 'Location Verification',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.AUTHORIZATION_LETTER]: {
    id: DOCUMENT_TYPES.AUTHORIZATION_LETTER,
    title: "Secretary's Certificate / Board Resolution / Authorization Letter",
    description: 'Official corporate resolution or notarized letter authorizing the representative to enter into contracts with SALO.',
    category: 'Representative Authorization',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
  [DOCUMENT_TYPES.BANK_PROOF]: {
    id: DOCUMENT_TYPES.BANK_PROOF,
    title: 'Proof of Bank Account Ownership',
    description: 'Bank certificate, deposit slip, or first page of bank statement showing account name and account number (balances can be blurred).',
    category: 'Payout Verification',
    acceptedFormats: 'PDF, JPG, PNG',
    maxSizeMb: 10,
  },
};

/**
 * Returns the conditional document configuration array based on the selected ownership structure
 * and whether the representative is an authorized representative/manager rather than owner.
 */
export function getRequiredDocuments(ownershipStructure, position) {
  const isRepresentative = position === 'Authorized Representative' || position === 'Manager';
  const docs = [];

  // 1. Entity registration
  if (ownershipStructure === 'Sole Proprietorship') {
    docs.push({ ...DOCUMENT_CATALOG[DOCUMENT_TYPES.DTI_CERTIFICATE], required: true });
  } else if (ownershipStructure === 'Corporation' || ownershipStructure === 'Partnership') {
    docs.push({ ...DOCUMENT_CATALOG[DOCUMENT_TYPES.SEC_CERTIFICATE], required: true });
    if (isRepresentative) {
      docs.push({ ...DOCUMENT_CATALOG[DOCUMENT_TYPES.AUTHORIZATION_LETTER], required: true });
    }
  } else if (ownershipStructure === 'Cooperative') {
    docs.push({ ...DOCUMENT_CATALOG[DOCUMENT_TYPES.CDA_CERTIFICATE], required: true });
    if (isRepresentative) {
      docs.push({ ...DOCUMENT_CATALOG[DOCUMENT_TYPES.AUTHORIZATION_LETTER], required: true });
    }
  } else {
    docs.push({ ...DOCUMENT_CATALOG[DOCUMENT_TYPES.OTHER_REGISTRATION], required: true });
    if (isRepresentative) {
      docs.push({ ...DOCUMENT_CATALOG[DOCUMENT_TYPES.AUTHORIZATION_LETTER], required: true });
    }
  }

  // 2. Tax registration (BIR 2303)
  docs.push({ ...DOCUMENT_CATALOG[DOCUMENT_TYPES.BIR_2303], required: true });

  // 3. Local Government Permits
  docs.push({ ...DOCUMENT_CATALOG[DOCUMENT_TYPES.MAYORS_PERMIT], required: true });
  docs.push({ ...DOCUMENT_CATALOG[DOCUMENT_TYPES.BARANGAY_CLEARANCE], required: false });
  docs.push({ ...DOCUMENT_CATALOG[DOCUMENT_TYPES.SANITARY_PERMIT], required: false });
  docs.push({ ...DOCUMENT_CATALOG[DOCUMENT_TYPES.FIRE_SAFETY_PERMIT], required: false });

  // 4. Identity & Location
  docs.push({ ...DOCUMENT_CATALOG[DOCUMENT_TYPES.GOVERNMENT_ID], required: true });
  docs.push({ ...DOCUMENT_CATALOG[DOCUMENT_TYPES.PROOF_OF_ADDRESS], required: true });

  return docs;
}

import { getVehicleDocuments, RIDER_DOC_TYPES } from '../constants/riderDocumentMatrix.js';

export function hasRiderUploadedEntry(entry) {
  if (!entry) return false;
  if (typeof Blob !== 'undefined' && entry instanceof Blob) return true;
  return Boolean(entry.file || entry.dataUrl || entry.previewUrl || entry.src);
}

/**
 * Validate all required fields and documents across all steps of the rider application.
 * Returns a list of { step, field, label, message } for any missing/invalid requirement.
 */
export function getMissingRiderApplicationRequirements(formData = {}) {
  const missing = [];

  if (!formData.emailVerification?.isVerified) {
    missing.push({
      step: 1,
      field: 'verification',
      label: 'Email Verification',
      message: 'Please verify your email address with the 6-digit OTP.',
    });
  }

  if (!formData.personal?.firstName?.trim()) {
    missing.push({
      step: 2,
      field: 'firstName',
      label: 'First Name',
      message: 'First name is required.',
    });
  }
  if (!formData.personal?.lastName?.trim()) {
    missing.push({
      step: 2,
      field: 'lastName',
      label: 'Last Name',
      message: 'Last name is required.',
    });
  }
  if (!formData.personal?.dateOfBirth) {
    missing.push({
      step: 2,
      field: 'dateOfBirth',
      label: 'Date of Birth',
      message: 'Date of birth is required.',
    });
  }
  if (!formData.personal?.phone?.trim()) {
    missing.push({
      step: 2,
      field: 'phone',
      label: 'Mobile Number',
      message: 'Mobile contact number is required.',
    });
  }

  if (!formData.identity?.idNumber?.trim()) {
    missing.push({
      step: 3,
      field: 'idNumber',
      label: 'Government ID Number',
      message: 'Government ID number is required.',
    });
  }
  if (!formData.identity?.isPermanent && !formData.identity?.expiryDate) {
    missing.push({
      step: 3,
      field: 'expiryDate',
      label: 'Government ID Expiration Date',
      message: 'ID expiration date is required (or mark as permanent).',
    });
  }
  if (!hasRiderUploadedEntry(formData.identity?.frontPhoto)) {
    missing.push({
      step: 3,
      field: 'frontPhoto',
      label: 'Government ID (Front)',
      message: 'Front image of your government ID is required.',
    });
  }
  if (!hasRiderUploadedEntry(formData.identity?.selfiePhoto)) {
    missing.push({
      step: 3,
      field: 'selfiePhoto',
      label: 'Verification Selfie',
      message: 'A clear verification selfie photo is required.',
    });
  }

  if (!formData.deliveryMethod) {
    missing.push({
      step: 4,
      field: 'deliveryMethod',
      label: 'Delivery Method',
      message: 'Please choose your primary delivery vehicle/method.',
    });
  }

  if (formData.deliveryMethod) {
    const requiredVehDocs = getVehicleDocuments(
      formData.deliveryMethod,
      formData.vehicleInfo?.ownership,
    ).filter((d) => d.required);

    requiredVehDocs.forEach((doc) => {
      if (!hasRiderUploadedEntry(formData.vehicleDocuments?.[doc.id])) {
        missing.push({
          step: 6,
          field: doc.id,
          label: doc.title,
          message: `${doc.title} is required.`,
        });
      }
    });
  }

  const hasNbi = hasRiderUploadedEntry(formData.clearanceDocuments?.[RIDER_DOC_TYPES.NBI_CLEARANCE]);
  const hasPolice = hasRiderUploadedEntry(formData.clearanceDocuments?.[RIDER_DOC_TYPES.POLICE_CLEARANCE]);
  if (!hasNbi && !hasPolice) {
    missing.push({
      step: 7,
      field: 'primaryClearance',
      label: 'NBI or Police Clearance',
      message: 'Either an NBI Clearance or a Police Clearance is required.',
    });
  }

  if (!formData.emergency?.contactName?.trim()) {
    missing.push({
      step: 8,
      field: 'contactName',
      label: 'Emergency Contact Name',
      message: 'Emergency contact person is required.',
    });
  }
  if (!formData.emergency?.phone?.trim()) {
    missing.push({
      step: 8,
      field: 'phone',
      label: 'Emergency Contact Phone',
      message: 'Emergency contact phone number is required.',
    });
  }
  if (!formData.emergency?.preferredCity?.trim()) {
    missing.push({
      step: 8,
      field: 'preferredCity',
      label: 'Preferred Delivery City',
      message: 'Please select your primary delivery city/zone.',
    });
  }

  if (!formData.payout?.accountHolder?.trim()) {
    missing.push({
      step: 9,
      field: 'accountHolder',
      label: 'Payout Account Holder Name',
      message: 'Account holder name is required.',
    });
  }
  const accountNumber = String(formData.payout?.accountNumber || '').trim();
  if (!accountNumber || accountNumber.length < 8) {
    missing.push({
      step: 9,
      field: 'accountNumber',
      label: 'Payout Account Number',
      message: 'Account or mobile number (at least 8 digits) is required.',
    });
  }

  return missing;
}

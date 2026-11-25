import { getRequiredDocuments } from '../constants/documentRequirements.js';
import { validateRestaurantServices } from '../constants/applicationDefaults.js';
import { validateAddressStep } from './branchHelpers.js';

export function hasUploadedEntry(entry) {
  if (!entry) return false;
  if (typeof Blob !== 'undefined' && entry instanceof Blob) return true;
  return Boolean(entry.file || entry.dataUrl || entry.previewUrl || entry.src);
}

/**
 * Validate all required fields and documents across all steps of the restaurant application.
 * Returns a list of { step, field, label, message } for any missing/invalid requirement.
 */
export function getMissingBusinessApplicationRequirements(formData = {}) {
  const missing = [];

  if (!formData.emailVerification?.isVerified) {
    missing.push({
      step: 1,
      field: 'verification',
      label: 'Email Verification',
      message: 'Please verify your email address with the 6-digit code.',
    });
  }

  if (!formData.businessInfo?.restaurantName?.trim()) {
    missing.push({
      step: 2,
      field: 'restaurantName',
      label: 'Restaurant / Business Name',
      message: 'Restaurant or business name is required.',
    });
  }

  if (!formData.businessInfo?.businessPhone?.trim()) {
    missing.push({
      step: 2,
      field: 'businessPhone',
      label: 'Business Contact Number',
      message: 'Business contact number is required.',
    });
  }

  if (!formData.representative?.firstName?.trim()) {
    missing.push({
      step: 3,
      field: 'firstName',
      label: 'Representative First Name',
      message: 'Representative first name is required.',
    });
  }

  if (!formData.representative?.lastName?.trim()) {
    missing.push({
      step: 3,
      field: 'lastName',
      label: 'Representative Last Name',
      message: 'Representative last name is required.',
    });
  }

  if (!formData.representative?.dateOfBirth) {
    missing.push({
      step: 3,
      field: 'dateOfBirth',
      label: 'Representative Date of Birth',
      message: 'Date of birth is required.',
    });
  } else {
    const birthYear = new Date(formData.representative.dateOfBirth).getFullYear();
    const currentYear = new Date().getFullYear();
    if (Number.isNaN(birthYear) || currentYear - birthYear < 18) {
      missing.push({
        step: 3,
        field: 'dateOfBirth',
        label: 'Representative Date of Birth (18+)',
        message: 'Applicant must be at least 18 years of age.',
      });
    }
  }

  if (!formData.representative?.phone?.trim()) {
    missing.push({
      step: 3,
      field: 'phone',
      label: 'Representative Mobile Number',
      message: 'Mobile contact number is required.',
    });
  }

  const requiredDocs = getRequiredDocuments(
    formData.businessInfo?.ownershipStructure,
    formData.representative?.position,
  ).filter((d) => d.required);

  requiredDocs.forEach((doc) => {
    if (!hasUploadedEntry(formData.documents?.[doc.id])) {
      missing.push({
        step: 4,
        field: doc.id,
        label: doc.title,
        message: `${doc.title} is required.`,
      });
    }
  });

  const addressErrors = validateAddressStep(formData.address || {});
  Object.entries(addressErrors).forEach(([field, message]) => {
    missing.push({
      step: 5,
      field,
      label: message.replace(/\.$/, ''),
      message,
    });
  });

  if (!formData.payout?.accountHolder?.trim()) {
    missing.push({
      step: 6,
      field: 'accountHolder',
      label: 'Payout Account Holder Name',
      message: 'Account holder name is required.',
    });
  }

  const accountNumber = String(formData.payout?.accountNumber || '').trim();
  if (!accountNumber || accountNumber.length < 8) {
    missing.push({
      step: 6,
      field: 'accountNumber',
      label: 'Payout Account Number',
      message: 'Bank account number (at least 8 digits) is required.',
    });
  }

  const serviceError = validateRestaurantServices(formData.configuration?.services);
  if (serviceError) {
    missing.push({
      step: 7,
      field: 'services',
      label: 'Fulfillment Service (Delivery or Pickup)',
      message: serviceError,
    });
  }

  return missing;
}

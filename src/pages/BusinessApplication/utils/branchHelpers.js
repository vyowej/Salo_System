import { MAX_APPLICATION_BRANCHES } from '../constants/applicationDefaults.js';

export function hasEnteredBranchData(addressData = {}) {
  if (String(addressData?.mainBranchName || '').trim() !== '') {
    return true;
  }
  return Array.isArray(addressData?.branches) && addressData.branches.length > 0;
}

export function validateAddressStep(addressData = {}, maxTotalBranches = MAX_APPLICATION_BRANCHES) {
  const errors = {};

  if (!String(addressData?.street || '').trim()) {
    errors.street = 'Street or building address is required.';
  }
  if (!String(addressData?.postalCode || '').trim()) {
    errors.postalCode = 'Postal code is required.';
  }
  if (!String(addressData?.barangay || '').trim()) {
    errors.barangay = 'Barangay is required.';
  }

  if (!addressData?.hasBranches) {
    return errors;
  }

  const mainBranchName = String(addressData?.mainBranchName || '').trim();
  if (!mainBranchName) {
    errors.mainBranchName = 'Please enter a name for your main branch.';
  }

  const branches = Array.isArray(addressData?.branches) ? addressData.branches : [];
  if (1 + branches.length > maxTotalBranches) {
    errors.branches = `A maximum of ${maxTotalBranches} total locations (including the main branch) is allowed per application.`;
  }

  const seenNames = new Set();
  if (mainBranchName) {
    seenNames.add(mainBranchName.toLowerCase());
  }

  branches.forEach((branch, idx) => {
    const bName = String(branch?.branchName || '').trim();
    if (!bName) {
      errors[`branches.${idx}.branchName`] = 'Branch name is required.';
    } else {
      const normalized = bName.toLowerCase();
      if (seenNames.has(normalized)) {
        errors[`branches.${idx}.branchName`] = `Duplicate branch name "${bName}". Branch names must be unique.`;
      } else {
        seenNames.add(normalized);
      }
    }

    if (!String(branch?.province || '').trim()) {
      errors[`branches.${idx}.province`] = 'Province is required.';
    }
    if (!String(branch?.city || '').trim()) {
      errors[`branches.${idx}.city`] = 'City / municipality is required.';
    }
    if (!String(branch?.barangay || '').trim()) {
      errors[`branches.${idx}.barangay`] = 'Barangay is required.';
    }
    if (!String(branch?.street || '').trim()) {
      errors[`branches.${idx}.street`] = 'Street or building address is required.';
    }
    const postal = String(branch?.postalCode || '').trim();
    if (!postal) {
      errors[`branches.${idx}.postalCode`] = 'Postal code is required.';
    } else if (!/^[0-9]{4}$/.test(postal)) {
      errors[`branches.${idx}.postalCode`] = 'Postal code must be 4 digits.';
    }
  });

  return errors;
}

export function appendBranchPayloadToFormData(fd, addressData = {}) {
  if (!addressData?.hasBranches) {
    return fd;
  }

  fd.append('has_branches', '1');
  fd.append('main_branch_name', String(addressData.mainBranchName || '').trim());

  const branches = Array.isArray(addressData.branches) ? addressData.branches : [];
  branches.forEach((branch, idx) => {
    fd.append(`branches[${idx}][branch_name]`, String(branch?.branchName || '').trim());
    if (String(branch?.contactPhone || '').trim()) {
      fd.append(`branches[${idx}][contact_phone]`, String(branch.contactPhone).trim());
    }
    fd.append(`branches[${idx}][province]`, branch?.province || 'Metro Manila');
    fd.append(`branches[${idx}][city]`, branch?.city || 'Quezon City');
    fd.append(`branches[${idx}][barangay]`, branch?.barangay || 'South Triangle');
    if (branch?.street) fd.append(`branches[${idx}][street]`, branch.street);
    if (branch?.houseNumber) fd.append(`branches[${idx}][house_number]`, branch.houseNumber);
    if (branch?.postalCode) fd.append(`branches[${idx}][postal_code]`, branch.postalCode);
    if (branch?.additionalDetails) fd.append(`branches[${idx}][landmark]`, branch.additionalDetails);
    if (branch?.coordinates?.lat != null) fd.append(`branches[${idx}][latitude]`, String(branch.coordinates.lat));
    if (branch?.coordinates?.lng != null) fd.append(`branches[${idx}][longitude]`, String(branch.coordinates.lng));
  });

  return fd;
}

export function formatBranchAddressSummary(address = {}) {
  if (!address || typeof address !== 'object') return '—';
  const barangay = address.barangay || address.barangay_name;
  const parts = [
    address.houseNumber || address.house_number,
    address.street,
    barangay ? `Brgy. ${barangay}` : null,
    address.city || address.city_name,
    address.province || address.province_name,
    address.postalCode || address.postal_code,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : '—';
}

export function extractApplicationLocations(application = {}) {
  const branches = Array.isArray(application?.branches) ? application.branches : [];
  const hasBranches = Boolean(application?.has_branches || application?.hasBranches || application?.main_branch_name || application?.mainBranchName || branches.length > 0);
  const mainBranchName = application?.main_branch_name || application?.mainBranchName || 'Main Branch';

  return {
    hasBranches,
    mainBranchName,
    totalLocations: hasBranches ? 1 + branches.length : 1,
    branches,
  };
}

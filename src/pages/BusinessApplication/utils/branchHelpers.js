import {
  APPLICATION_CONFLICT_COPY,
  MAX_APPLICATION_BRANCHES,
} from '../constants/applicationDefaults.js';
import {
  getBranchPermitMeta,
  isBranchPermitEditable,
  validateBranchPermitInput,
} from '../../../features/restaurant/utils/branchWorkspaceUtils.js';

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

    const permitRequired = branch?.permitRequiredLocally !== false;
    const permitErrors = validateBranchPermitInput({
      mayors_permit: branch?.permitFile || null,
      is_required_locally: permitRequired,
      exemption_reason: branch?.permitExemptionReason || '',
    });
    if (permitErrors.mayors_permit) {
      errors[`branches.${idx}.permitFile`] = permitErrors.mayors_permit;
    }
    if (permitErrors.exemption_reason) {
      errors[`branches.${idx}.permitExemptionReason`] = permitErrors.exemption_reason;
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
    if (branch?.mapPinned !== false && branch?.coordinates?.lat != null) fd.append(`branches[${idx}][latitude]`, String(branch.coordinates.lat));
    if (branch?.mapPinned !== false && branch?.coordinates?.lng != null) fd.append(`branches[${idx}][longitude]`, String(branch.coordinates.lng));

    const permitRequired = branch?.permitRequiredLocally !== false;
    fd.append(`branches[${idx}][permit_required_locally]`, permitRequired ? '1' : '0');
    if (!permitRequired && String(branch?.permitExemptionReason || '').trim()) {
      fd.append(`branches[${idx}][permit_exemption_reason]`, String(branch.permitExemptionReason).trim());
    }
  });

  return fd;
}

export function buildApplicationBranchPermitPayload(branch = {}) {
  const permitRequired = branch?.permitRequiredLocally !== false;
  if (!permitRequired) {
    return {
      is_required_locally: false,
      exemption_reason: String(branch?.permitExemptionReason || '').trim(),
    };
  }
  const fd = new FormData();
  fd.append('is_required_locally', '1');
  if (branch?.permitFile) {
    fd.append('mayors_permit', branch.permitFile);
  }
  return fd;
}

export function stripFilesFromAddressDraft(address = {}) {
  const branches = Array.isArray(address?.branches) ? address.branches : [];
  return {
    ...address,
    branches: branches.map((branch) => {
      const hadFile = Boolean(branch?.permitFile || branch?.hadPendingPermitFile);
      const rest = { ...branch };
      delete rest.permitFile;
      return {
        ...rest,
        hadPendingPermitFile: hadFile && branch?.permitRequiredLocally !== false,
      };
    }),
  };
}

/**
 * Execute the two-step multi-branch application submission:
 * 1) Submit application + branch metadata (unless already saved from an earlier attempt).
 * 2) Sequentially upload each required branch's permit file using returned application_branch_id.
 */
export async function executeTwoStepApplicationSubmit({
  applicationFormData,
  branches = [],
  existingApplication = null,
  previousProgress = {},
  submitApplication,
  submitBranchPermit,
  onProgress,
}) {
  const created = existingApplication || (await submitApplication(applicationFormData));
  const appId = created?.restaurant_application_id;
  const createdBranches = Array.isArray(created?.branches) ? created.branches : [];
  const progress = { ...previousProgress };

  let hasFailure = false;

  for (let idx = 0; idx < branches.length; idx += 1) {
    const localBranch = branches[idx];
    const remoteBranch = createdBranches[idx];
    const appBranchId = remoteBranch?.application_branch_id;

    if (!appBranchId || localBranch?.permitRequiredLocally === false || !localBranch?.permitFile) {
      continue;
    }

    if (progress[appBranchId]?.status === 'uploaded') {
      continue;
    }

    progress[appBranchId] = {
      applicationBranchId: appBranchId,
      branchName: localBranch.branchName || remoteBranch?.branch_name || `Branch #${idx + 1}`,
      status: 'uploading',
      error: null,
    };
    onProgress?.({ ...progress });

    try {
      await submitBranchPermit(appId, appBranchId, buildApplicationBranchPermitPayload(localBranch));
      progress[appBranchId] = {
        ...progress[appBranchId],
        status: 'uploaded',
        error: null,
      };
    } catch (err) {
      hasFailure = true;
      progress[appBranchId] = {
        ...progress[appBranchId],
        status: 'failed',
        error: err?.message || 'Upload failed. Please retry.',
      };
    }
    onProgress?.({ ...progress });
  }

  return {
    application: created,
    progress,
    hasFailure,
  };
}

export function isActiveApplicationConflictError(error) {
  if (!error || Number(error?.status) !== 409) {
    return false;
  }
  const code = error?.code || error?.data?.code || null;
  return code === 'ACTIVE_APPLICATION_EXISTS';
}

export function resolveActiveApplicationConflictRedirect(error) {
  if (!isActiveApplicationConflictError(error)) {
    return null;
  }
  const data = error?.data?.data || error?.data || {};
  return {
    shouldRedirect: true,
    to: '/business-application/status',
    notice: APPLICATION_CONFLICT_COPY.activeApplicationExistsNotice,
    existingApplicationId: data?.restaurant_application_id ?? data?.application_id ?? null,
  };
}

export function getApplicationBranchPermitViewModel(branch = {}, applicationStatus = '', conflict409 = false) {
  const permitStatus = branch?.permit_status || 'pending_submission';
  const meta = getBranchPermitMeta(permitStatus);
  const isMaterialized = Boolean(branch?.created_branch_restaurant_id)
    || String(applicationStatus || '').toLowerCase() === 'approved';
  const editable = !isMaterialized && !conflict409 && isBranchPermitEditable(permitStatus);

  return {
    permitStatus,
    badgeLabel: meta?.label || permitStatus,
    badgeVariant: meta?.variant || 'neutral',
    isMaterialized,
    movedToOwnerWorkspace: isMaterialized || Boolean(conflict409),
    editable,
    hasFile: Boolean(branch?.has_file),
    reviewNote: branch?.review_note || branch?.permit_review_note || null,
    exemptionReason: branch?.exemption_reason || branch?.permit_exemption_reason || null,
    isRequiredLocally: branch?.is_required_locally !== undefined
      ? Boolean(branch.is_required_locally)
      : (branch?.permit_is_required_locally !== undefined ? Boolean(branch.permit_is_required_locally) : true),
  };
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

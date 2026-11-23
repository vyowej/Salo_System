const ACTIVE_RIDER_APPLICATION_STATUSES = new Set([
  'submitted',
  'pending_review',
  'under_review',
  'additional_documents_required',
  'needs_correction',
  'resubmitted',
  'approved',
]);

export function isRiderActiveApplicationConflictError(error) {
  return Number(error?.status) === 409 && error?.code === 'ACTIVE_APPLICATION_EXISTS';
}

export function resolveRiderActiveApplicationConflictRedirect(error) {
  if (!isRiderActiveApplicationConflictError(error)) {
    return null;
  }

  return {
    to: '/rider-application/status',
    notice:
      error?.message ||
      'You already have an active or approved rider application. Showing your current application status.',
    existingApplicationId:
      error?.data?.rider_application_id ?? error?.data?.application_id ?? null,
  };
}

export function isActiveOrApprovedRiderApplication(application) {
  if (!application || typeof application !== 'object') {
    return false;
  }
  const status = String(application.application_status || '').toLowerCase();
  return ACTIVE_RIDER_APPLICATION_STATUSES.has(status);
}

import {
  BRANCH_PERMIT_EXEMPTION_MAX_CHARS,
  BRANCH_PERMIT_EXEMPTION_MIN_CHARS,
  BRANCH_PERMIT_STATUS_META,
} from '../../restaurant/content/branchContent.js';

export const ADMIN_BRANCH_PERMIT_BADGE_META = Object.freeze({
  ...BRANCH_PERMIT_STATUS_META,
  not_submitted: Object.freeze({
    label: 'Not submitted',
    variant: 'neutral',
    description: 'No Mayor\'s / Business Permit document found on the root application.',
  }),
});

export const ADMIN_BRANCH_PERMIT_FILTER_OPTIONS = Object.freeze([
  { value: 'all', label: 'All statuses' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'under_review', label: 'Under review' },
  { value: 'additional_info_required', label: 'Info needed' },
  { value: 'pending_submission', label: 'Pending submission' },
  { value: 'approved', label: 'Verified' },
  { value: 'waived', label: 'Waived' },
  { value: 'rejected', label: 'Rejected' },
]);

export const ADMIN_PERMIT_NOTE_REQUIRED_ACTIONS = new Set([
  'reject',
  'request-info',
  'waive',
  'reopen',
]);

export function getAdminBranchPermitBadge(permitStatus, isMainBranch = false) {
  const key = String(permitStatus || (isMainBranch ? 'not_submitted' : 'pending_submission'));
  return ADMIN_BRANCH_PERMIT_BADGE_META[key] || {
    label: key,
    variant: 'neutral',
    description: '',
  };
}

export function buildAdminBranchPermitQueryParams({
  status = 'all',
  search = '',
  submittedDate = '',
  page = 1,
  perPage = 15,
} = {}) {
  const params = {
    page,
    per_page: perPage,
  };
  if (status && status !== 'all') {
    params.status = status;
  }
  if (String(search || '').trim()) {
    params.search = String(search).trim();
  }
  if (String(submittedDate || '').trim()) {
    params.submitted_date = String(submittedDate).trim();
  }
  return params;
}

export function getAvailableAdminPermitActions(permit) {
  if (!permit) return [];
  const status = String(permit.permit_status || '');
  const isExemptDeclared = permit.is_required_locally === false;
  const actions = [];

  if (status === 'pending_submission') {
    return actions;
  }

  if (['pending_review', 'additional_info_required', 'rejected'].includes(status)) {
    actions.push({ action: 'start-review', label: 'Start review', variant: 'secondary', requiresNote: false });
  }

  if (['pending_review', 'under_review', 'additional_info_required', 'rejected'].includes(status)) {
    actions.push({ action: 'approve', label: 'Approve', variant: 'primary', requiresNote: false });
  }

  if (isExemptDeclared && ['pending_review', 'under_review', 'additional_info_required', 'rejected'].includes(status)) {
    actions.push({ action: 'waive', label: 'Waive', variant: 'secondary', requiresNote: true });
  }

  if (['pending_review', 'under_review'].includes(status)) {
    actions.push({ action: 'request-info', label: 'Request info', variant: 'outline', requiresNote: true });
  }

  if (['pending_review', 'under_review', 'additional_info_required', 'approved', 'waived'].includes(status)) {
    actions.push({ action: 'reject', label: 'Reject', variant: 'danger-outline', requiresNote: true });
  }

  if (['approved', 'waived'].includes(status)) {
    actions.push({ action: 'reopen', label: 'Reopen', variant: 'outline', requiresNote: true });
  }

  return actions;
}

export function validateAdminPermitActionNote(action, note = '') {
  if (!ADMIN_PERMIT_NOTE_REQUIRED_ACTIONS.has(action)) {
    return null;
  }
  const len = String(note || '').trim().length;
  if (len < BRANCH_PERMIT_EXEMPTION_MIN_CHARS || len > BRANCH_PERMIT_EXEMPTION_MAX_CHARS) {
    return `A review note between ${BRANCH_PERMIT_EXEMPTION_MIN_CHARS} and ${BRANCH_PERMIT_EXEMPTION_MAX_CHARS} characters is required.`;
  }
  return null;
}

export function mapAdminPermitActionError(err) {
  if (!err) return 'Unable to complete branch permit action.';
  const fieldMsg = err?.errors?.review_note?.[0] || err?.errors?.is_required_locally?.[0];
  if (fieldMsg) return fieldMsg;
  if (err.status === 403) {
    return err.message || 'Forbidden: you cannot review a branch permit for your own business.';
  }
  if (err.status === 409) {
    return err.message || 'This permit was already updated. Refresh and try again.';
  }
  if (err.status === 422) {
    return err.message || 'Validation failed for this permit action.';
  }
  return err.message || 'Unable to complete branch permit action.';
}

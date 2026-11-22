export const BRANCH_WORKSPACE_COPY = Object.freeze({
  switcherAriaLabel: 'Switch restaurant branch',
  switcherCurrentBadge: 'Current',
  switcherAddBranchButton: '+ Add branch',
  switcherStatusPublished: 'Published',
  switcherStatusDraft: 'Unpublished',
  switcherAcceptingOrders: 'Accepting orders',
  switcherPausedOrders: 'Orders paused',
  switcherUnsavedConfirmTitle: 'Switch branch?',
  switcherUnsavedConfirmMessage: 'Switching branches will discard any unsaved edits on this page. Continue?',
  addBranchModalTitle: 'Add a New Branch',
  addBranchModalSubtitle: 'Expand your business with another outlet. New branches start active and unpublished until you configure delivery coverage and publish.',
  addBranchMainNameLabel: 'Main Branch Name',
  addBranchMainNameHint: 'Your existing location does not have a branch label yet. Enter a name for it first.',
  addBranchNameLabel: 'New Branch Name',
  addBranchNamePlaceholder: 'e.g. BGC High Street Branch',
  addBranchPhoneLabel: 'Branch Phone (Optional)',
  addBranchPhonePlaceholder: 'Defaults to main restaurant phone',
  addBranchServicesLabel: 'Service Options',
  addBranchCopyHoursLabel: 'Copy weekly operating hours from main branch',
  addBranchCopyMenuLabel: 'Copy menu categories, items, and add-ons (unpublished)',
  addBranchSuccessNote: 'Branch created! It stays hidden from customers until its Mayor\'s / Business Permit is verified or waived and you publish its menu.',
  allBranchesTitle: 'All Branches',
  allBranchesSubtitle: 'Quick status across your accessible outlets. Click Manage to switch your workspace.',
  allBranchesManageAction: 'Manage',
  coverageChecklistTitle: 'Set delivery coverage',
  coverageChecklistDesc: 'Select at least one service area before publishing while delivery is enabled.',
  coverageChecklistAction: 'Configure coverage',
});

export const BRANCH_PERMIT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const BRANCH_PERMIT_ACCEPTED_MIMES = Object.freeze([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
]);

export const BRANCH_PERMIT_ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

export const BRANCH_PERMIT_EXEMPTION_MIN_CHARS = 10;
export const BRANCH_PERMIT_EXEMPTION_MAX_CHARS = 500;

export const BRANCH_PERMIT_STATUS_META = Object.freeze({
  pending_submission: Object.freeze({
    label: 'Pending submission',
    variant: 'warning',
    description: 'Upload this branch\'s Mayor\'s / Business Permit or declare a local exemption before publishing.',
  }),
  pending_review: Object.freeze({
    label: 'Pending review',
    variant: 'info',
    description: 'Submitted and waiting for admin verification. Customers cannot see this branch yet.',
  }),
  under_review: Object.freeze({
    label: 'Under review',
    variant: 'info',
    description: 'An administrator is currently reviewing this branch permit.',
  }),
  additional_info_required: Object.freeze({
    label: 'Info needed',
    variant: 'warning',
    description: 'An administrator requested an updated permit or clarification before this branch can be verified.',
  }),
  rejected: Object.freeze({
    label: 'Rejected',
    variant: 'error',
    description: 'This branch permit was rejected. Review the admin note and upload a corrected permit or exemption.',
  }),
  approved: Object.freeze({
    label: 'Verified',
    variant: 'success',
    description: 'Branch permit verified. You can publish this branch\'s menu once delivery coverage and hours are ready.',
  }),
  waived: Object.freeze({
    label: 'Waived',
    variant: 'success',
    description: 'Local permit exemption accepted. You can publish this branch\'s menu once setup is complete.',
  }),
});

export const BRANCH_PERMIT_COPY = Object.freeze({
  sectionTitle: 'Mayor\'s / Business Permit',
  sectionSubtitle: 'Every additional branch needs its own Mayor\'s / Business Permit or a local exemption before it can go live.',
  uploadLabel: 'Upload Mayor\'s / Business Permit (PDF, JPG, or PNG, max 10 MB)',
  selectFileButton: 'Choose permit file',
  replaceFileButton: 'Replace file',
  removeFileButton: 'Remove',
  notRequiredToggleLabel: 'Not required in this branch\'s locality',
  exemptionLabel: 'Explanation for local exemption',
  exemptionPlaceholder: 'Explain why a Mayor\'s / Business Permit is not required in this locality (10–500 characters)...',
  exemptionHint: 'Provide 10–500 characters explaining the local exemption.',
  fileRequiredError: 'Upload a Mayor\'s / Business Permit file or declare that it is not required locally.',
  fileTypeError: 'Unsupported file format. Please upload a PDF, JPG, or PNG file.',
  fileSizeError: 'Permit file must be 10 MB or smaller.',
  exemptionLengthError: 'Please provide an explanation between 10 and 500 characters.',
  panelTitle: 'Branch Permit Verification',
  panelReadOnlyNotice: 'This permit is currently locked for review or already verified. Only an administrator can reopen it.',
  viewSubmittedButton: 'View submitted permit',
  loadingFileLabel: 'Opening permit...',
  fileLoadError: 'Unable to open the submitted permit file.',
  adminNoteLabel: 'Admin note',
  submitUpdateButton: 'Submit permit update',
  updateSuccessMessage: 'Branch permit updated and submitted for admin review.',
  publishBarActionLabel: 'Manage branch permit',
});

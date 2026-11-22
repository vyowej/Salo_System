import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRANCH_PERMIT_MAX_BYTES,
  BRANCH_PERMIT_STATUS_META,
} from '../features/restaurant/content/branchContent.js';
import {
  buildCreateBranchPayload,
  buildSubmitBranchPermitPayload,
  createInitialAddBranchForm,
  getBranchPermitMeta,
  isBranchPermitEditable,
  mapAddBranchBackendErrors,
  validateAddBranchForm,
} from '../features/restaurant/utils/branchWorkspaceUtils.js';
import { deriveBusinessSetupChecklist } from '../services/onboardingService.js';
import {
  getNotificationCategory,
  getNotificationCategoryLabel,
  getNotificationRoute,
  getNotificationTitle,
} from '../utils/notificationUtils.js';

function makeValidBaseForm(overrides = {}) {
  return {
    ...createInitialAddBranchForm(),
    branch_name: 'BGC Branch',
    province: 'Metro Manila',
    city: 'Taguig',
    barangay: 'Fort Bonifacio',
    ...overrides,
  };
}

test('Add Branch validation requires permit file or local exemption and checks file type, size, and exemption length', () => {
  // Neither file nor exemption -> blocked
  const neitherErrors = validateAddBranchForm(makeValidBaseForm({ mayors_permit: null, is_required_locally: true }));
  assert.ok(neitherErrors.mayors_permit);

  // Invalid file type -> blocked
  const badTypeErrors = validateAddBranchForm(makeValidBaseForm({
    mayors_permit: new File(['hello'], 'notes.txt', { type: 'text/plain' }),
  }));
  assert.ok(badTypeErrors.mayors_permit);

  // Oversized file (> 10 MB) -> blocked
  const bigFile = { name: 'huge.pdf', type: 'application/pdf', size: BRANCH_PERMIT_MAX_BYTES + 1 };
  const bigErrors = validateAddBranchForm(makeValidBaseForm({ mayors_permit: bigFile }));
  assert.ok(bigErrors.mayors_permit);

  // Short exemption (< 10 chars) -> blocked
  const shortExErrors = validateAddBranchForm(makeValidBaseForm({
    is_required_locally: false,
    exemption_reason: 'Too short',
  }));
  assert.ok(shortExErrors.exemption_reason);

  // Valid PDF file -> passes
  const validFileErrors = validateAddBranchForm(makeValidBaseForm({
    mayors_permit: new File(['%PDF-1.4'], 'permit.pdf', { type: 'application/pdf' }),
  }));
  assert.deepEqual(validFileErrors, {});

  // Valid exemption (10-500 chars) -> passes
  const validExErrors = validateAddBranchForm(makeValidBaseForm({
    is_required_locally: false,
    exemption_reason: 'Exempt micro-stall under barangay ordinance.',
  }));
  assert.deepEqual(validExErrors, {});
});

test('Add Branch & permit update payload shapes use FormData only when a file is attached and map 422 errors per field', () => {
  const pdfFile = new File(['%PDF-1.4'], 'bgc-permit.pdf', { type: 'application/pdf' });

  const multipartPayload = buildCreateBranchPayload(makeValidBaseForm({ mayors_permit: pdfFile }));
  assert.equal(multipartPayload instanceof FormData, true);
  assert.equal(multipartPayload.get('branch_name'), 'BGC Branch');
  assert.equal(multipartPayload.get('mayors_permit'), pdfFile);

  const jsonPayload = buildCreateBranchPayload(makeValidBaseForm({
    is_required_locally: false,
    exemption_reason: 'Exempt kiosk under LGU barangay ordinance.',
  }));
  assert.equal(jsonPayload instanceof FormData, false);
  assert.equal(jsonPayload.is_required_locally, false);
  assert.equal(jsonPayload.exemption_reason, 'Exempt kiosk under LGU barangay ordinance.');

  const permitUpdateMultipart = buildSubmitBranchPermitPayload({ mayors_permit: pdfFile, is_required_locally: true });
  assert.equal(permitUpdateMultipart instanceof FormData, true);
  assert.equal(permitUpdateMultipart.get('mayors_permit'), pdfFile);

  const permitUpdateJson = buildSubmitBranchPermitPayload({
    is_required_locally: false,
    exemption_reason: 'Updated local exemption explanation.',
  });
  assert.equal(permitUpdateJson instanceof FormData, false);
  assert.equal(permitUpdateJson.is_required_locally, false);

  const mapped = mapAddBranchBackendErrors({
    message: 'Validation failed',
    errors: {
      mayors_permit: ['The uploaded file content is not a valid PDF.'],
      exemption_reason: ['Explanation must be at least 10 characters.'],
    },
  });
  assert.equal(mapped.fieldErrors.mayors_permit, 'The uploaded file content is not a valid PDF.');
  assert.equal(mapped.fieldErrors.exemption_reason, 'Explanation must be at least 10 characters.');
});

test('Permit status badge mapping and re-upload editability cover all 7 statuses', () => {
  const expectedLabels = {
    pending_submission: 'Pending submission',
    pending_review: 'Pending review',
    under_review: 'Under review',
    additional_info_required: 'Info needed',
    rejected: 'Rejected',
    approved: 'Verified',
    waived: 'Waived',
  };

  Object.entries(expectedLabels).forEach(([status, label]) => {
    const meta = getBranchPermitMeta(status);
    assert.ok(meta, `Missing meta for ${status}`);
    assert.equal(meta.label, label);
    assert.equal(meta, BRANCH_PERMIT_STATUS_META[status]);
  });

  assert.equal(getBranchPermitMeta(null), null);

  assert.equal(isBranchPermitEditable('pending_submission'), true);
  assert.equal(isBranchPermitEditable('additional_info_required'), true);
  assert.equal(isBranchPermitEditable('rejected'), true);

  assert.equal(isBranchPermitEditable('pending_review'), false);
  assert.equal(isBranchPermitEditable('under_review'), false);
  assert.equal(isBranchPermitEditable('approved'), false);
  assert.equal(isBranchPermitEditable('waived'), false);
});

test('deriveBusinessSetupChecklist includes Verify branch permit when permit blocker is present and preserves coverage blocker', () => {
  const withBothBlockers = deriveBusinessSetupChecklist({
    backendStatus: {
      business_profile: { complete: true },
      operating_hours: { complete: true },
      menu: { complete: true },
      availability_toggles: { complete: true },
      delivery_coverage: { complete: false },
      publish: {
        complete: false,
        blockers: [
          'Configure at least one delivery service area before publishing while delivery is enabled.',
          "Branch Mayor's / Business Permit must be verified or waived before publishing.",
        ],
      },
    },
  });

  const permitStep = withBothBlockers.items.find((item) => item.id === 'branch_permit');
  const coverageStep = withBothBlockers.items.find((item) => item.id === 'delivery_coverage');
  assert.ok(permitStep);
  assert.equal(permitStep.label, 'Verify branch permit');
  assert.equal(permitStep.done, false);
  assert.equal(permitStep.href, '/owner/profile#branch-permit');
  assert.ok(coverageStep);
  assert.equal(coverageStep.done, false);

  // Root / verified branch without permit blocker omits branch_permit step
  const rootWithoutBlocker = deriveBusinessSetupChecklist({
    backendStatus: {
      business_profile: { complete: true },
      operating_hours: { complete: true },
      menu: { complete: true },
      availability_toggles: { complete: true },
      delivery_coverage: { complete: true },
      publish: { complete: true, blockers: [] },
    },
  });
  assert.equal(rootWithoutBlocker.items.some((item) => item.id === 'branch_permit'), false);
});

test('branch_permit_* notification types map to branch_permit category, readable titles, and workspace routes', () => {
  const types = [
    'branch_permit_submitted',
    'branch_permit_approved',
    'branch_permit_rejected',
    'branch_permit_info_requested',
    'branch_permit_waived',
    'branch_permit_reopened',
  ];

  types.forEach((type) => {
    assert.equal(getNotificationCategory(type), 'branch_permit');
    assert.equal(getNotificationCategoryLabel(type), 'Branch permit');
    assert.ok(getNotificationTitle(type).length > 5);
    assert.equal(
      getNotificationRoute({ workspace: 'restaurant', type, related_entity_type: 'branch_permits', related_entity_id: 12 }),
      '/owner/profile#branch-permit',
    );
    assert.equal(
      getNotificationRoute({ workspace: 'customer', type, related_entity_type: 'branch_permits', related_entity_id: 12 }),
      '/business-application/status',
    );
  });
});

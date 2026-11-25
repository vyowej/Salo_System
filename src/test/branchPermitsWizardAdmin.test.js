import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  appendBranchPayloadToFormData,
  executeTwoStepApplicationSubmit,
  getApplicationBranchPermitViewModel,
  resolveActiveApplicationConflictRedirect,
  stripFilesFromAddressDraft,
  validateAddressStep,
} from '../pages/BusinessApplication/utils/branchHelpers.js';
import { APPLICATION_CONFLICT_COPY } from '../pages/BusinessApplication/constants/applicationDefaults.js';
import {
  buildAdminBranchPermitQueryParams,
  getAdminBranchPermitBadge,
  getAvailableAdminPermitActions,
  mapAdminPermitActionError,
  validateAdminPermitActionNote,
} from '../features/admin/utils/branchPermitAdminUtils.js';
import {
  getNotificationRoute,
  getNotificationTitle,
  normalizeNotification,
  resolveNotificationRestaurantId,
} from '../utils/notificationUtils.js';

function makeAddressData(branchOverrides = []) {
  return {
    province: 'Metro Manila',
    city: 'Quezon City',
    barangay: 'Diliman',
    street: '101 Katipunan Ave',
    postalCode: '1101',
    hasBranches: true,
    mainBranchName: 'Main QC',
    branches: branchOverrides,
  };
}

test('Wizard Step 5 validation requires file or exemption per additional branch and metadata FormData omits branch files', () => {
  const missingPermit = validateAddressStep(makeAddressData([
    { branchName: 'Makati', province: 'Metro Manila', city: 'Makati', barangay: 'Bel-Air', street: '10 Ayala', postalCode: '1209' },
  ]));
  assert.ok(missingPermit['branches.0.permitFile']);

  const pdfFile = new File(['%PDF-1.4'], 'makati.pdf', { type: 'application/pdf' });
  const validAddr = makeAddressData([
    {
      branchName: 'Makati',
      province: 'Metro Manila',
      city: 'Makati',
      barangay: 'Bel-Air',
      street: '10 Ayala',
      postalCode: '1209',
      permitRequiredLocally: true,
      permitFile: pdfFile,
    },
    {
      branchName: 'Kiosk',
      province: 'Metro Manila',
      city: 'Taguig',
      barangay: 'Fort Bonifacio',
      street: '5th Ave',
      postalCode: '1634',
      permitRequiredLocally: false,
      permitExemptionReason: 'Micro-stall exempt under local barangay ordinance.',
    },
  ]);

  assert.deepEqual(validateAddressStep(validAddr), {});

  const fd = new FormData();
  appendBranchPayloadToFormData(fd, validAddr);
  assert.equal(fd.get('branches[0][permit_required_locally]'), '1');
  assert.equal(fd.get('branches[0][mayors_permit]'), null);
  assert.equal(fd.get('branches[1][permit_required_locally]'), '0');
  assert.equal(fd.get('branches[1][permit_exemption_reason]'), 'Micro-stall exempt under local barangay ordinance.');

  const stripped = stripFilesFromAddressDraft(validAddr);
  assert.equal(stripped.branches[0].permitFile, undefined);
  assert.equal(stripped.branches[0].hadPendingPermitFile, true);
  assert.equal(stripped.branches[1].hadPendingPermitFile, false);
});

test('Two-step submit uploads sequentially, handles failure + retry without re-submitting application', async () => {
  const pdf1 = new File(['%PDF-1.4-1'], 'b1.pdf', { type: 'application/pdf' });
  const pdf2 = new File(['%PDF-1.4-2'], 'b2.pdf', { type: 'application/pdf' });
  const branches = [
    { branchName: 'B1', permitRequiredLocally: true, permitFile: pdf1 },
    { branchName: 'B2', permitRequiredLocally: true, permitFile: pdf2 },
    { branchName: 'B3', permitRequiredLocally: false, permitExemptionReason: 'Exempt kiosk under local rule.' },
  ];

  let appSubmitCount = 0;
  const uploadCalls = [];
  let failSecond = true;

  const firstRun = await executeTwoStepApplicationSubmit({
    applicationFormData: new FormData(),
    branches,
    submitApplication: async () => {
      appSubmitCount += 1;
      return {
        restaurant_application_id: 55,
        reference_number: 'SALO-55',
        branches: [
          { application_branch_id: 101, branch_name: 'B1' },
          { application_branch_id: 102, branch_name: 'B2' },
          { application_branch_id: 103, branch_name: 'B3' },
        ],
      };
    },
    submitBranchPermit: async (appId, appBranchId) => {
      uploadCalls.push({ appId, appBranchId });
      if (appBranchId === 102 && failSecond) {
        throw new Error('Network timeout');
      }
      return { permit_status: 'pending_review' };
    },
  });

  assert.equal(appSubmitCount, 1);
  assert.equal(firstRun.hasFailure, true);
  assert.equal(firstRun.progress[101].status, 'uploaded');
  assert.equal(firstRun.progress[102].status, 'failed');
  assert.equal(uploadCalls.length, 2);

  // Retry using existingApplication: must NOT re-submit application or re-upload 101
  failSecond = false;
  const retryRun = await executeTwoStepApplicationSubmit({
    applicationFormData: new FormData(),
    branches,
    existingApplication: firstRun.application,
    previousProgress: firstRun.progress,
    submitApplication: async () => {
      appSubmitCount += 1;
      return firstRun.application;
    },
    submitBranchPermit: async (appId, appBranchId) => {
      uploadCalls.push({ appId, appBranchId });
      return { permit_status: 'pending_review' };
    },
  });

  assert.equal(appSubmitCount, 1);
  assert.equal(retryRun.hasFailure, false);
  assert.equal(retryRun.progress[102].status, 'uploaded');
  assert.equal(uploadCalls.length, 3);
});

test('Applicant status view model handles editable states, locked states, and 409 materialized handoff', () => {
  const rejectedVm = getApplicationBranchPermitViewModel({ permit_status: 'rejected', review_note: 'Blurry scan' }, 'Under Review', false);
  assert.equal(rejectedVm.editable, true);
  assert.equal(rejectedVm.badgeLabel, 'Rejected');
  assert.equal(rejectedVm.reviewNote, 'Blurry scan');

  const pendingRevVm = getApplicationBranchPermitViewModel({ permit_status: 'pending_review', has_file: true }, 'Under Review', false);
  assert.equal(pendingRevVm.editable, false);
  assert.equal(pendingRevVm.hasFile, true);

  const conflictVm = getApplicationBranchPermitViewModel({ permit_status: 'rejected' }, 'Under Review', true);
  assert.equal(conflictVm.editable, false);
  assert.equal(conflictVm.movedToOwnerWorkspace, true);

  const approvedAppVm = getApplicationBranchPermitViewModel({ permit_status: 'pending_submission', created_branch_restaurant_id: 99 }, 'Approved', false);
  assert.equal(approvedAppVm.movedToOwnerWorkspace, true);
  assert.equal(approvedAppVm.editable, false);
});

test('Notification mapping for customer/admin branch_permit_* and restaurant branch selection', () => {
  assert.equal(getNotificationTitle('branch_permit_approved'), 'Branch permit approved');
  assert.equal(
    getNotificationRoute({ workspace: 'customer', type: 'branch_permit_info_requested', related_entity_type: 'branch_permits', related_entity_id: 8 }),
    '/business-application/status',
  );
  assert.equal(
    getNotificationRoute({ workspace: 'admin', type: 'branch_permit_submitted', related_entity_type: 'branch_permits', related_entity_id: 8 }),
    '/admin/branch-permits',
  );
  assert.equal(
    resolveNotificationRestaurantId({ restaurant_id: 42 }, [{ id: '10' }, { id: '42' }]),
    '42',
  );
  assert.equal(
    resolveNotificationRestaurantId({ related_entity_type: 'branch_permits', related_entity_id: 8 }, [{ id: '10' }]),
    null,
  );

  const normalizedPermitNotif = normalizeNotification({
    notification_id: 99,
    workspace: 'restaurant',
    type: 'branch_permit_reopened',
    title: 'Branch permit reopened for review',
    body: 'Please upload a clearer scan.',
    related_entity_type: 'branch_permits',
    related_entity_id: 8,
    restaurant_id: 42,
    application_id: 12,
    application_branch_id: 34,
    is_read: false,
  });
  assert.equal(normalizedPermitNotif.restaurant_id, 42);
  assert.equal(normalizedPermitNotif.application_id, 12);
  assert.equal(normalizedPermitNotif.application_branch_id, 34);
  assert.equal(
    resolveNotificationRestaurantId(normalizedPermitNotif, [{ id: '10' }, { id: '42' }]),
    '42',
  );

  const ownerMenuSrc = fs.readFileSync(path.resolve('src/features/restaurant/components/OwnerNotificationsMenu.jsx'), 'utf8');
  assert.ok(ownerMenuSrc.includes('resolveNotificationRestaurantId'));
  assert.ok(ownerMenuSrc.includes('access.selectRestaurant'));
});

test('Admin queue params, drawer actions, waive visibility, note validation, 403/409/422 errors, and root derived badges', () => {
  const params = buildAdminBranchPermitQueryParams({
    status: 'pending_review',
    search: 'Makati',
    submittedDate: '2026-11-22',
    page: 2,
    perPage: 15,
  });
  assert.deepEqual(params, {
    page: 2,
    per_page: 15,
    status: 'pending_review',
    search: 'Makati',
    submitted_date: '2026-11-22',
  });

  const requiredActions = getAvailableAdminPermitActions({ permit_status: 'pending_review', is_required_locally: true }).map((a) => a.action);
  assert.equal(requiredActions.includes('waive'), false);
  assert.equal(requiredActions.includes('approve'), true);
  assert.equal(requiredActions.includes('reject'), true);

  const exemptActions = getAvailableAdminPermitActions({ permit_status: 'pending_review', is_required_locally: false }).map((a) => a.action);
  assert.equal(exemptActions.includes('waive'), true);

  const approvedActions = getAvailableAdminPermitActions({ permit_status: 'approved', is_required_locally: true }).map((a) => a.action);
  assert.equal(approvedActions.includes('reopen'), true);
  assert.equal(approvedActions.includes('start-review'), false);

  assert.ok(validateAdminPermitActionNote('reject', 'short'));
  assert.equal(validateAdminPermitActionNote('reject', 'Expired Mayor permit document.'), null);
  assert.equal(validateAdminPermitActionNote('approve', ''), null);

  assert.match(mapAdminPermitActionError({ status: 403, message: 'Forbidden: self review.' }), /self review/i);
  assert.match(mapAdminPermitActionError({ status: 409, message: 'Stale state.' }), /Stale state/i);
  assert.match(mapAdminPermitActionError({ status: 422, errors: { review_note: ['Note too short.'] } }), /Note too short/i);

  assert.equal(getAdminBranchPermitBadge('not_submitted', true).label, 'Not submitted');
  assert.equal(getAdminBranchPermitBadge('approved', true).label, 'Verified');
});

test('409 ACTIVE_APPLICATION_EXISTS maps to status redirect + notice, stops two-step submit without retry, clears draft, and status page exposes pending permit upload', async () => {
  const conflictErr = {
    status: 409,
    code: 'ACTIVE_APPLICATION_EXISTS',
    message: 'You already have an active restaurant partner application.',
    data: {
      success: false,
      code: 'ACTIVE_APPLICATION_EXISTS',
      data: {
        restaurant_application_id: 77,
        application_id: 77,
        application_status: 'submitted',
      },
    },
  };

  const redirect = resolveActiveApplicationConflictRedirect(conflictErr);
  assert.deepEqual(redirect, {
    shouldRedirect: true,
    to: '/business-application/status',
    notice: APPLICATION_CONFLICT_COPY.activeApplicationExistsNotice,
    existingApplicationId: 77,
  });
  assert.equal(redirect.notice, 'You already have an application in progress.');

  // Non-matching 409 or 422 does not trigger redirect
  assert.equal(resolveActiveApplicationConflictRedirect({ status: 409, code: 'OTHER_CONFLICT' }), null);
  assert.equal(resolveActiveApplicationConflictRedirect({ status: 422, code: 'ACTIVE_APPLICATION_EXISTS' }), null);

  // Two-step submit stops immediately with no second POST and no branch permit uploads
  let appPostCount = 0;
  let permitPostCount = 0;
  await assert.rejects(
    () => executeTwoStepApplicationSubmit({
      applicationFormData: new FormData(),
      branches: [{ branchName: 'Makati', permitRequiredLocally: true, permitFile: new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }) }],
      submitApplication: async () => {
        appPostCount += 1;
        throw conflictErr;
      },
      submitBranchPermit: async () => {
        permitPostCount += 1;
        return {};
      },
    }),
    (err) => err === conflictErr,
  );
  assert.equal(appPostCount, 1);
  assert.equal(permitPostCount, 0);

  // Verify wizard clears draft & redirects without setting generic submit error, and status page renders notice + Upload/Retry
  const wizardSrc = fs.readFileSync(path.resolve('src/pages/BusinessApplication/BusinessApplicationPage.jsx'), 'utf8');
  assert.ok(wizardSrc.includes('resolveActiveApplicationConflictRedirect(error)'));
  assert.ok(wizardSrc.includes('clearPartnerDraft('));
  assert.ok(wizardSrc.includes('navigate(conflictRedirect.to'));

  const statusPageSrc = fs.readFileSync(path.resolve('src/pages/BusinessApplication/BusinessApplicationStatusPage.jsx'), 'utf8');
  assert.ok(statusPageSrc.includes('location.state?.notice'));

  const statusComponentSrc = fs.readFileSync(path.resolve('src/pages/BusinessApplication/components/ApplicationStatus.jsx'), 'utf8');
  assert.ok(statusComponentSrc.includes('APPLICATION_CONFLICT_COPY.pendingBranchPermitsNotice'));

  const permitCardSrc = fs.readFileSync(path.resolve('src/pages/BusinessApplication/components/ApplicationBranchPermitCard.jsx'), 'utf8');
  assert.ok(permitCardSrc.includes('APPLICATION_CONFLICT_COPY.uploadOrRetryPermitButton'));
});

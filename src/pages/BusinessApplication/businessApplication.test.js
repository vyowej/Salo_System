import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRequiredDocuments,
  getDocumentClassification,
  DOCUMENT_TYPES,
  DOCUMENT_CATALOG,
} from './constants/documentRequirements.js';
import {
  BUSINESS_TYPES,
  OWNERSHIP_STRUCTURES,
  APPLICATION_STATUS_CONFIG,
  INITIAL_APPLICATION_STATE,
  MAX_APPLICATION_BRANCHES,
  WIZARD_STEPS,
  createEmptyApplicationBranch,
  validateRestaurantServices,
} from './constants/applicationDefaults.js';
import {
  appendBranchPayloadToFormData,
  extractApplicationLocations,
  formatBranchAddressSummary,
  hasEnteredBranchData,
  validateAddressStep,
} from './utils/branchHelpers.js';

test('document matrix requires DTI for Sole Proprietorship', () => {
  const docs = getRequiredDocuments('Sole Proprietorship', 'Business Owner');
  const dti = docs.find((d) => d.id === DOCUMENT_TYPES.DTI_CERTIFICATE);
  const sec = docs.find((d) => d.id === DOCUMENT_TYPES.SEC_CERTIFICATE);
  const cda = docs.find((d) => d.id === DOCUMENT_TYPES.CDA_CERTIFICATE);

  assert.ok(dti, 'DTI certificate should be present');
  assert.equal(dti.required, true, 'DTI certificate must be required');
  assert.equal(sec, undefined, 'SEC certificate should not be required for Sole Prop');
  assert.equal(cda, undefined, 'CDA certificate should not be required for Sole Prop');
});

test('document matrix requires SEC for Corporation and Partnership', () => {
  const corpDocs = getRequiredDocuments('Corporation', 'Business Owner');
  const sec = corpDocs.find((d) => d.id === DOCUMENT_TYPES.SEC_CERTIFICATE);
  assert.ok(sec, 'SEC certificate should be present for Corporation');
  assert.equal(sec.required, true);

  const partnerDocs = getRequiredDocuments('Partnership', 'Co-owner');
  const partnerSec = partnerDocs.find((d) => d.id === DOCUMENT_TYPES.SEC_CERTIFICATE);
  assert.ok(partnerSec, 'SEC certificate should be present for Partnership');
});

test('document matrix requires CDA for Cooperative', () => {
  const coopDocs = getRequiredDocuments('Cooperative', 'Business Owner');
  const cda = coopDocs.find((d) => d.id === DOCUMENT_TYPES.CDA_CERTIFICATE);
  assert.ok(cda, 'CDA certificate should be present for Cooperative');
  assert.equal(cda.required, true);
});

test('document matrix requires Authorization Letter when applicant is Manager or Representative', () => {
  const ownerDocs = getRequiredDocuments('Corporation', 'Business Owner');
  const ownerAuth = ownerDocs.find((d) => d.id === DOCUMENT_TYPES.AUTHORIZATION_LETTER);
  assert.equal(ownerAuth, undefined, 'Owner does not require separate authorization letter');

  const repDocs = getRequiredDocuments('Corporation', 'Authorized Representative');
  const repAuth = repDocs.find((d) => d.id === DOCUMENT_TYPES.AUTHORIZATION_LETTER);
  assert.ok(repAuth, 'Representative must provide Authorization Letter / Board Resolution');
  assert.equal(repAuth.required, true);

  const mgrDocs = getRequiredDocuments('Corporation', 'Manager');
  const mgrAuth = mgrDocs.find((d) => d.id === DOCUMENT_TYPES.AUTHORIZATION_LETTER);
  assert.ok(mgrAuth, 'Manager must provide Authorization Letter');
  assert.equal(mgrAuth.required, true);
});

test('getDocumentClassification partitions documents into mandatory, conditional, and supporting', () => {
  // Sole Prop owner
  const soleOwner = getDocumentClassification('Sole Proprietorship', 'Business Owner');
  assert.equal(soleOwner.mandatory.length, 4, 'Sole Prop must have 4 mandatory documents');
  assert.equal(soleOwner.mandatory[0].id, DOCUMENT_TYPES.DTI_CERTIFICATE);
  assert.equal(soleOwner.conditional.length, 0, 'Sole Prop owner must have 0 conditional documents');
  assert.equal(soleOwner.supporting.length, 4, 'Must have 4 supporting documents');
  assert.ok(soleOwner.supporting.every((d) => d.required === false), 'Supporting documents must all be optional');

  // Corp manager
  const corpMgr = getDocumentClassification('Corporation', 'Manager');
  assert.equal(corpMgr.mandatory.length, 4);
  assert.equal(corpMgr.mandatory[0].id, DOCUMENT_TYPES.SEC_CERTIFICATE);
  assert.equal(corpMgr.conditional.length, 1, 'Manager must have Authorization Letter conditional document');
  assert.equal(corpMgr.conditional[0].id, DOCUMENT_TYPES.AUTHORIZATION_LETTER);
  assert.equal(corpMgr.conditional[0].required, true);

  // Coop representative
  const coopRep = getDocumentClassification('Cooperative', 'Authorized Representative');
  assert.equal(coopRep.mandatory.length, 4);
  assert.equal(coopRep.mandatory[0].id, DOCUMENT_TYPES.CDA_CERTIFICATE);
  assert.equal(coopRep.conditional.length, 1);
  assert.equal(coopRep.conditional[0].id, DOCUMENT_TYPES.AUTHORIZATION_LETTER);
});

test('Mayors Permit, Government ID, and Proof of Address are universally mandatory; BIR Form 2303 is optional', () => {
  for (const structure of OWNERSHIP_STRUCTURES) {
    const docs = getRequiredDocuments(structure, 'Business Owner');
    const bir = docs.find((d) => d.id === DOCUMENT_TYPES.BIR_2303);
    const mayors = docs.find((d) => d.id === DOCUMENT_TYPES.MAYORS_PERMIT);
    const govId = docs.find((d) => d.id === DOCUMENT_TYPES.GOVERNMENT_ID);
    const address = docs.find((d) => d.id === DOCUMENT_TYPES.PROOF_OF_ADDRESS);

    assert.equal(bir?.required, false, `BIR Form 2303 must be optional for ${structure}`);
    assert.ok(mayors?.required, `Mayors Permit must be required for ${structure}`);
    assert.ok(govId?.required, `Government ID must be required for ${structure}`);
    assert.ok(address?.required, `Proof of Address must be required for ${structure}`);
  }
});

test('document catalog entries provide whyNeeded justification for every document', () => {
  for (const [key, doc] of Object.entries(DOCUMENT_CATALOG)) {
    assert.ok(
      typeof doc.whyNeeded === 'string' && doc.whyNeeded.trim().length > 10,
      `Document ${key} must have an informative whyNeeded description`
    );
  }
});

test('wizard steps and application status configs contain all mandatory states including Submitted and Additional Documents Required', () => {
  assert.equal(WIZARD_STEPS.length, 8, 'There should be exactly 8 wizard steps');
  assert.equal(WIZARD_STEPS[0].id, 'verification', 'Step 1 must be Email Verification gate');
  assert.equal(WIZARD_STEPS[1].id, 'business', 'Step 2 must be Business Info');
  assert.equal(WIZARD_STEPS[2].id, 'representative', 'Step 3 must be Representative');
  assert.equal(WIZARD_STEPS[3].id, 'documents', 'Step 4 must be Documents');
  assert.equal(WIZARD_STEPS[4].id, 'address', 'Step 5 must be Address');
  assert.equal(WIZARD_STEPS[5].id, 'payout', 'Step 6 must be Payout');
  assert.equal(WIZARD_STEPS[6].id, 'config', 'Step 7 must be Configuration');
  assert.equal(WIZARD_STEPS[7].id, 'review', 'Step 8 must be Review');

  assert.ok(BUSINESS_TYPES.includes('Restaurant'));
  assert.ok(BUSINESS_TYPES.includes('Cloud Kitchen'));

  const expectedStatuses = [
    'Draft',
    'Submitted',
    'Pending Submission',
    'Pending Review',
    'Under Review',
    'Additional Documents Required',
    'Needs Correction',
    'Resubmitted',
    'Approved',
    'Rejected',
  ];

  for (const status of expectedStatuses) {
    assert.ok(APPLICATION_STATUS_CONFIG[status], `Status config must define "${status}"`);
  }
});

test('initial application state has expected default structure', () => {
  assert.equal(typeof INITIAL_APPLICATION_STATE.businessInfo, 'object');
  assert.equal(typeof INITIAL_APPLICATION_STATE.representative, 'object');
  assert.equal(typeof INITIAL_APPLICATION_STATE.address, 'object');
  assert.equal(typeof INITIAL_APPLICATION_STATE.payout, 'object');
  assert.equal(typeof INITIAL_APPLICATION_STATE.configuration, 'object');
  assert.equal(INITIAL_APPLICATION_STATE.emailVerification.isVerified, false);
  assert.equal(INITIAL_APPLICATION_STATE.configuration.services.dineIn, true, 'dineIn must be enabled by default in services');
});

test('validateRestaurantServices requires Delivery or Pickup / Takeout and treats Table Reservations as optional', () => {
  // Delivery only -> valid
  assert.equal(
    validateRestaurantServices({ delivery: true, pickup: false, tableReservations: false }),
    null
  );

  // Pickup only -> valid
  assert.equal(
    validateRestaurantServices({ delivery: false, pickup: true, tableReservations: false }),
    null
  );

  // Delivery + Table Reservations -> valid
  assert.equal(
    validateRestaurantServices({ delivery: true, pickup: false, tableReservations: true }),
    null
  );

  // Pickup + Table Reservations -> valid
  assert.equal(
    validateRestaurantServices({ delivery: false, pickup: true, tableReservations: true }),
    null
  );

  // Table Reservations only -> must fail
  const reservationsOnlyErr = validateRestaurantServices({
    delivery: false,
    pickup: false,
    tableReservations: true,
  });
  assert.ok(reservationsOnlyErr, 'Table Reservations alone must fail validation');
  assert.match(reservationsOnlyErr, /Delivery or Pickup/i);

  // No services selected -> must fail
  const noneSelectedErr = validateRestaurantServices({
    delivery: false,
    pickup: false,
    tableReservations: false,
  });
  assert.ok(noneSelectedErr, 'No services selected must fail validation');
  assert.match(noneSelectedErr, /Delivery or Pickup/i);
});

test('multi-branch defaults, toggle confirmation guard, and add/remove branch helpers', () => {
  assert.equal(INITIAL_APPLICATION_STATE.address.hasBranches, false);
  assert.equal(INITIAL_APPLICATION_STATE.address.mainBranchName, '');
  assert.deepEqual(INITIAL_APPLICATION_STATE.address.branches, []);
  assert.equal(MAX_APPLICATION_BRANCHES, 5);

  assert.equal(hasEnteredBranchData(INITIAL_APPLICATION_STATE.address), false);
  assert.equal(hasEnteredBranchData({ mainBranchName: 'Main Outlet', branches: [] }), true);

  const branch = createEmptyApplicationBranch();
  assert.equal(branch.branchName, '');
  assert.equal(hasEnteredBranchData({ mainBranchName: '', branches: [branch] }), true);
});

test('multi-branch validation enforces main branch name, case-insensitive uniqueness, address fields, and 5-location limit', () => {
  const baseAddress = {
    province: 'Metro Manila',
    city: 'Quezon City',
    barangay: 'Diliman',
    street: '10 Katipunan Ave',
    postalCode: '1101',
    hasBranches: true,
    mainBranchName: '',
    branches: [],
  };

  // Missing mainBranchName
  const missingMain = validateAddressStep(baseAddress);
  assert.ok(missingMain.mainBranchName);

  // Duplicate name (case-insensitive vs mainBranchName)
  const dupMain = validateAddressStep({
    ...baseAddress,
    mainBranchName: 'Katipunan Main',
    branches: [
      {
        ...createEmptyApplicationBranch(),
        branchName: '  katipunan main ',
        street: '20 North Ave',
        postalCode: '1100',
      },
    ],
  });
  assert.ok(dupMain['branches.0.branchName']);

  // Over limit (1 main + 5 additional = 6 > 5)
  const fiveExtra = Array.from({ length: 5 }, (_, idx) => ({
    ...createEmptyApplicationBranch(),
    branchName: `Branch ${idx + 1}`,
    street: `${idx + 1} Test St`,
    postalCode: '1100',
  }));
  const overLimit = validateAddressStep({
    ...baseAddress,
    mainBranchName: 'Katipunan Main',
    branches: fiveExtra,
  });
  assert.ok(overLimit.branches);

  // Valid 1 main + 2 additional branches -> zero errors
  const valid = validateAddressStep({
    ...baseAddress,
    mainBranchName: 'Katipunan Main',
    branches: [
      {
        ...createEmptyApplicationBranch(),
        branchName: 'SM North EDSA',
        street: 'North Ave',
        postalCode: '1100',
      },
      {
        ...createEmptyApplicationBranch(),
        branchName: 'BGC High Street',
        street: '9th Ave',
        postalCode: '1634',
      },
    ],
  });
  assert.deepEqual(valid, {});
});

test('appendBranchPayloadToFormData omits branch fields for single-location and serializes branches when enabled', () => {
  const singleFd = new FormData();
  appendBranchPayloadToFormData(singleFd, { hasBranches: false, mainBranchName: 'Ignored', branches: [] });
  assert.equal(singleFd.has('has_branches'), false);
  assert.equal(singleFd.has('main_branch_name'), false);

  const multiFd = new FormData();
  appendBranchPayloadToFormData(multiFd, {
    hasBranches: true,
    mainBranchName: 'Katipunan Main',
    branches: [
      {
        branchName: 'BGC Branch',
        contactPhone: '09171234567',
        province: 'Metro Manila',
        city: 'Taguig City',
        barangay: 'Fort Bonifacio / BGC',
        street: '9th Ave',
        postalCode: '1634',
        coordinates: { lat: 14.5501, lng: 121.0512 },
      },
    ],
  });

  assert.equal(multiFd.get('has_branches'), '1');
  assert.equal(multiFd.get('main_branch_name'), 'Katipunan Main');
  assert.equal(multiFd.get('branches[0][branch_name]'), 'BGC Branch');
  assert.equal(multiFd.get('branches[0][contact_phone]'), '09171234567');
  assert.equal(multiFd.get('branches[0][city]'), 'Taguig City');
  assert.equal(multiFd.get('branches[0][latitude]'), '14.5501');
});

test('extractApplicationLocations and formatBranchAddressSummary handle single-location and multi-branch payloads', () => {
  const single = extractApplicationLocations({ has_branches: false, branches: [] });
  assert.equal(single.hasBranches, false);
  assert.equal(single.totalLocations, 1);

  const multi = extractApplicationLocations({
    has_branches: true,
    main_branch_name: 'Diliman Flagship',
    branches: [
      { branch_name: 'SM North EDSA', address: { street: 'EDSA', barangay: 'Diliman', city: 'Quezon City', province: 'Metro Manila' } },
      { branch_name: 'Loyola Heights', address: { street: 'Katipunan Ave', barangay: 'Loyola Heights', city: 'Quezon City', province: 'Metro Manila' } },
    ],
  });
  assert.equal(multi.hasBranches, true);
  assert.equal(multi.mainBranchName, 'Diliman Flagship');
  assert.equal(multi.totalLocations, 3);
  assert.match(formatBranchAddressSummary(multi.branches[0].address), /EDSA, Brgy\. Diliman, Quezon City/);
});

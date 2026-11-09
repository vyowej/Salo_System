import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getVehicleDocuments,
  getClearanceDocuments,
  RIDER_DOC_TYPES,
} from './constants/riderDocumentMatrix.js';
import {
  DELIVERY_METHODS,
  RIDER_APPLICATION_STEPS,
  INITIAL_RIDER_APPLICATION_STATE,
  RIDER_STATUS_CONFIG,
  MOCK_RIDER_ADMIN_FEEDBACK,
} from './constants/riderApplicationDefaults.js';

test('delivery methods catalog includes all 5 transport modes', () => {
  const methodKeys = DELIVERY_METHODS.map((m) => m.key);
  assert.deepEqual(methodKeys, ['motorcycle', 'bicycle', 'e_bike', 'e_scooter', 'walking']);

  DELIVERY_METHODS.forEach((method) => {
    assert.ok(method.label, 'Method must have a label');
    assert.ok(method.maxRadius, 'Method must define a delivery radius');
    assert.ok(method.requirementsSummary, 'Method must have a requirements summary');
  });
});

test('motorcycle document matrix requires Drivers License and OR/CR', () => {
  const docs = getVehicleDocuments('motorcycle', 'Personally Owned');
  const license = docs.find((d) => d.id === RIDER_DOC_TYPES.DRIVER_LICENSE);
  const ltoOr = docs.find((d) => d.id === RIDER_DOC_TYPES.LTO_OR);
  const ltoCr = docs.find((d) => d.id === RIDER_DOC_TYPES.LTO_CR);
  const authLetter = docs.find((d) => d.id === RIDER_DOC_TYPES.VEHICLE_AUTHORIZATION);

  assert.ok(license, 'Drivers license must be present for motorcycle');
  assert.equal(license.required, true, 'Drivers license must be required');
  assert.ok(ltoOr, 'LTO OR must be present for motorcycle');
  assert.equal(ltoOr.required, true, 'LTO OR must be required');
  assert.ok(ltoCr, 'LTO CR must be present for motorcycle');
  assert.equal(ltoCr.required, true, 'LTO CR must be required');
  assert.equal(authLetter, undefined, 'Personally owned motorcycle must not require authorization letter');
});

test('motorcycle requires authorization letter when vehicle is borrowed or rented', () => {
  const borrowedDocs = getVehicleDocuments('motorcycle', 'Borrowed');
  const authLetter = borrowedDocs.find((d) => d.id === RIDER_DOC_TYPES.VEHICLE_AUTHORIZATION);
  assert.ok(authLetter, 'Borrowed vehicle must require authorization letter');
  assert.equal(authLetter.required, true);

  const rentedDocs = getVehicleDocuments('motorcycle', 'Rented / Leased');
  const rentedAuth = rentedDocs.find((d) => d.id === RIDER_DOC_TYPES.VEHICLE_AUTHORIZATION);
  assert.ok(rentedAuth, 'Rented vehicle must require lease agreement or authorization letter');
  assert.equal(rentedAuth.required, true);
});

test('bicycle and micro-mobility do not require LTO documents', () => {
  const bikeDocs = getVehicleDocuments('bicycle');
  const bikeLicense = bikeDocs.find((d) => d.id === RIDER_DOC_TYPES.DRIVER_LICENSE);
  const bikeOr = bikeDocs.find((d) => d.id === RIDER_DOC_TYPES.LTO_OR);
  const bikePhoto = bikeDocs.find((d) => d.id === RIDER_DOC_TYPES.BICYCLE_PHOTO);

  assert.equal(bikeLicense, undefined, 'Bicycle must not require drivers license');
  assert.equal(bikeOr, undefined, 'Bicycle must not require LTO OR');
  assert.ok(bikePhoto, 'Bicycle must require vehicle photo');
  assert.equal(bikePhoto.required, true);

  const ebikeDocs = getVehicleDocuments('e_bike');
  assert.equal(ebikeDocs.find((d) => d.id === RIDER_DOC_TYPES.DRIVER_LICENSE), undefined);
  assert.ok(ebikeDocs.find((d) => d.id === RIDER_DOC_TYPES.EBIKE_PHOTO));
});

test('walking courier is exempt from all vehicle documents', () => {
  const walkerDocs = getVehicleDocuments('walking');
  assert.equal(walkerDocs.length, 0, 'Walking courier should have zero vehicle document requirements');
});

test('clearance matrix provides NBI and Police Clearance options', () => {
  const clearances = getClearanceDocuments();
  const nbi = clearances.find((c) => c.id === RIDER_DOC_TYPES.NBI_CLEARANCE);
  const police = clearances.find((c) => c.id === RIDER_DOC_TYPES.POLICE_CLEARANCE);
  const barangay = clearances.find((c) => c.id === RIDER_DOC_TYPES.BARANGAY_CLEARANCE);
  const medical = clearances.find((c) => c.id === RIDER_DOC_TYPES.MEDICAL_CLEARANCE);

  assert.ok(nbi, 'NBI clearance must be present in clearance catalog');
  assert.ok(police, 'Police clearance must be present in clearance catalog');
  assert.ok(barangay, 'Barangay clearance must be present');
  assert.ok(medical, 'Medical certificate must be present');
});

test('rider application wizard defines 10 sequential steps starting with email OTP gate', () => {
  assert.equal(RIDER_APPLICATION_STEPS.length, 10, 'Wizard must have 10 steps');
  assert.equal(RIDER_APPLICATION_STEPS[0].id, 'email_otp');
  assert.equal(RIDER_APPLICATION_STEPS[1].id, 'personal');
  assert.equal(RIDER_APPLICATION_STEPS[2].id, 'identity');
  assert.equal(RIDER_APPLICATION_STEPS[3].id, 'delivery_method');
  assert.equal(RIDER_APPLICATION_STEPS[4].id, 'vehicle_info');
  assert.equal(RIDER_APPLICATION_STEPS[5].id, 'vehicle_docs');
  assert.equal(RIDER_APPLICATION_STEPS[6].id, 'clearances');
  assert.equal(RIDER_APPLICATION_STEPS[7].id, 'emergency');
  assert.equal(RIDER_APPLICATION_STEPS[8].id, 'payout');
  assert.equal(RIDER_APPLICATION_STEPS[9].id, 'agreement_review');
});

test('email OTP verification is Step 1 gate and initializes unverified', () => {
  assert.equal(INITIAL_RIDER_APPLICATION_STATE.emailVerification.isVerified, false);
  assert.equal(INITIAL_RIDER_APPLICATION_STATE.emailVerification.email, '');
  assert.equal(INITIAL_RIDER_APPLICATION_STATE.emailVerification.companyName, '');
});

test('initial state initializes declarations to false and default method to motorcycle', () => {
  assert.equal(INITIAL_RIDER_APPLICATION_STATE.deliveryMethod, 'motorcycle');
  assert.equal(INITIAL_RIDER_APPLICATION_STATE.declarations.infoConfirmed, false);
  assert.equal(INITIAL_RIDER_APPLICATION_STATE.declarations.documentsGenuine, false);
  assert.equal(INITIAL_RIDER_APPLICATION_STATE.declarations.safetyPolicyAgreed, false);
  assert.equal(INITIAL_RIDER_APPLICATION_STATE.declarations.termsAgreed, false);
});

test('status simulation configuration contains all 8 required states', () => {
  const expectedStatuses = [
    'Draft',
    'Pending Submission',
    'Pending Review',
    'Under Review',
    'Needs Correction',
    'Resubmitted',
    'Approved',
    'Rejected',
  ];

  expectedStatuses.forEach((statusKey) => {
    const meta = RIDER_STATUS_CONFIG[statusKey];
    assert.ok(meta, `Status config must exist for ${statusKey}`);
    assert.ok(meta.label, `Status ${statusKey} must have a label`);
    assert.ok(meta.variant, `Status ${statusKey} must have a badge variant`);
    assert.ok(typeof meta.progress === 'number', `Status ${statusKey} must have a numeric progress value`);
  });

  assert.ok(MOCK_RIDER_ADMIN_FEEDBACK['Needs Correction'].feedback, 'Must provide Needs Correction mock feedback');
  assert.ok(MOCK_RIDER_ADMIN_FEEDBACK.Approved.activationChecklist.length >= 3, 'Must provide Approved activation checklist');
  assert.ok(MOCK_RIDER_ADMIN_FEEDBACK.Rejected.reason, 'Must provide Rejected reason');
});

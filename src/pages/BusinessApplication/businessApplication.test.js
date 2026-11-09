import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRequiredDocuments,
  DOCUMENT_TYPES,
} from './constants/documentRequirements.js';
import {
  BUSINESS_TYPES,
  OWNERSHIP_STRUCTURES,
  APPLICATION_STATUS_CONFIG,
  INITIAL_APPLICATION_STATE,
  WIZARD_STEPS,
} from './constants/applicationDefaults.js';

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
});

test('BIR Form 2303, Mayors Permit, and Government ID are universally required', () => {
  for (const structure of OWNERSHIP_STRUCTURES) {
    const docs = getRequiredDocuments(structure, 'Business Owner');
    const bir = docs.find((d) => d.id === DOCUMENT_TYPES.BIR_2303);
    const mayors = docs.find((d) => d.id === DOCUMENT_TYPES.MAYORS_PERMIT);
    const govId = docs.find((d) => d.id === DOCUMENT_TYPES.GOVERNMENT_ID);

    assert.ok(bir?.required, `BIR Form 2303 must be required for ${structure}`);
    assert.ok(mayors?.required, `Mayors Permit must be required for ${structure}`);
    assert.ok(govId?.required, `Government ID must be required for ${structure}`);
  }
});

test('wizard steps and application status configs contain all mandatory states', () => {
  assert.equal(WIZARD_STEPS.length, 8, 'There should be exactly 8 wizard steps');
  assert.ok(BUSINESS_TYPES.includes('Restaurant'));
  assert.ok(BUSINESS_TYPES.includes('Cloud Kitchen'));

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
});

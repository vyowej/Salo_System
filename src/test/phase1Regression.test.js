import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePostLoginDestination,
  isPathAllowedForUser,
} from '../services/authService.js';
import {
  _resetDraftFileMemoryStoreForTests,
  saveDraftFiles,
  loadDraftFiles,
  clearDraftFiles,
} from '../services/draftFileStore.js';
import {
  savePartnerDraft,
  loadPartnerDraftMetadata,
  restorePartnerDraftFiles,
  clearPartnerDraft,
} from '../pages/BusinessApplication/services/partnerDraftStorage.js';
import {
  getMissingBusinessApplicationRequirements,
} from '../pages/BusinessApplication/utils/applicationValidation.js';
import {
  getMissingRiderApplicationRequirements,
} from '../pages/RiderApplication/utils/riderValidation.js';
import { INITIAL_APPLICATION_STATE } from '../pages/BusinessApplication/constants/applicationDefaults.js';
import { INITIAL_RIDER_APPLICATION_STATE } from '../pages/RiderApplication/constants/riderApplicationDefaults.js';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

test('resolvePostLoginDestination prevents non-admin redirect to /admin after admin logout', () => {
  const customer = { id: 2, role: 'customer', roles: ['customer'] };
  const owner = { id: 3, role: 'owner', roles: ['customer', 'owner'] };
  const admin = { id: 1, role: 'admin', roles: ['admin'] };

  assert.equal(isPathAllowedForUser('/admin/applications', customer), false);
  assert.equal(
    resolvePostLoginDestination(customer, { pathname: '/admin/applications', search: '?tab=pending' }),
    '/customer',
  );
  assert.equal(
    resolvePostLoginDestination(owner, { pathname: '/admin/dashboard' }),
    '/owner',
  );
  assert.equal(
    resolvePostLoginDestination(admin, { pathname: '/admin/applications', search: '?tab=pending' }),
    '/admin/applications?tab=pending',
  );
});

test('partnerDraftStorage persists and restores uploaded files and cleans up on clear', async () => {
  _resetDraftFileMemoryStoreForTests();
  const prevLocal = globalThis.localStorage;
  const prevSession = globalThis.sessionStorage;
  globalThis.localStorage = createMemoryStorage();
  globalThis.sessionStorage = createMemoryStorage();

  try {
    const docBlob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const imgBlob = new Blob(['img-bytes'], { type: 'image/png' });

    const formData = {
      ...INITIAL_APPLICATION_STATE,
      businessInfo: {
        ...INITIAL_APPLICATION_STATE.businessInfo,
        restaurantName: 'Salo Grill',
      },
      documents: {
        dti_certificate: {
          id: 'dti_certificate',
          name: 'dti.pdf',
          size: docBlob.size,
          type: 'application/pdf',
          file: docBlob,
        },
      },
      payout: {
        ...INITIAL_APPLICATION_STATE.payout,
        accountNumber: '1234567890',
        proofDocument: {
          id: 'bank_proof',
          name: 'bank.png',
          size: imgBlob.size,
          type: 'image/png',
          file: imgBlob,
        },
      },
      configuration: {
        ...INITIAL_APPLICATION_STATE.configuration,
        logo: { name: 'logo.png', src: 'blob:logo', file: imgBlob },
      },
    };

    const user = { id: 42, email: 'owner@example.com' };
    await savePartnerDraft({
      formData,
      currentStep: 4,
      completedSteps: [1, 2, 3],
      ownerUserId: user.id,
      ownerEmail: user.email,
    });

    const meta = loadPartnerDraftMetadata(user);
    assert.ok(meta);
    assert.equal(meta.businessInfo.restaurantName, 'Salo Grill');
    assert.equal(meta.payout.accountNumber, '1234567890');

    const restored = await restorePartnerDraftFiles(meta, user.id);
    assert.ok(restored.documents.dti_certificate?.file);
    assert.equal(restored.documents.dti_certificate.name, 'dti.pdf');
    assert.ok(restored.payout.proofDocument?.file);
    assert.ok(restored.configuration.logo?.file);

    await clearPartnerDraft(user.id);
    assert.equal(loadPartnerDraftMetadata(user), null);
    const afterClear = await restorePartnerDraftFiles(INITIAL_APPLICATION_STATE, user.id);
    assert.equal(afterClear.documents.dti_certificate, undefined);
  } finally {
    globalThis.localStorage = prevLocal;
    globalThis.sessionStorage = prevSession;
  }
});

test('getMissingBusinessApplicationRequirements names missing items and passes when complete', () => {
  const missingInitial = getMissingBusinessApplicationRequirements(INITIAL_APPLICATION_STATE);
  assert.ok(missingInitial.length > 0);
  assert.ok(missingInitial.some((m) => m.field === 'verification'));
  assert.ok(missingInitial.some((m) => m.field === 'restaurantName'));

  const completeForm = {
    ...INITIAL_APPLICATION_STATE,
    emailVerification: { isVerified: true, verifiedEmail: 'biz@example.com' },
    businessInfo: {
      ...INITIAL_APPLICATION_STATE.businessInfo,
      restaurantName: 'Salo Bistro',
      businessPhone: '09171234567',
      ownershipStructure: 'Sole Proprietorship',
    },
    representative: {
      ...INITIAL_APPLICATION_STATE.representative,
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      dateOfBirth: '1990-01-01',
      phone: '09171234567',
      position: 'Business Owner',
    },
    documents: {
      dti_certificate: { name: 'dti.pdf', dataUrl: 'data:application/pdf;base64,AA==' },
      government_id: { name: 'id.jpg', dataUrl: 'data:image/jpeg;base64,AA==' },
      mayors_permit: { name: 'permit.pdf', dataUrl: 'data:application/pdf;base64,AA==' },
      bir_2303: { name: 'bir.pdf', dataUrl: 'data:application/pdf;base64,AA==' },
      barangay_clearance: { name: 'brgy.pdf', dataUrl: 'data:application/pdf;base64,AA==' },
      sanitary_permit: { name: 'sanitary.pdf', dataUrl: 'data:application/pdf;base64,AA==' },
      fire_safety_permit: { name: 'fire.pdf', dataUrl: 'data:application/pdf;base64,AA==' },
      proof_of_address: { name: 'addr.pdf', dataUrl: 'data:application/pdf;base64,AA==' },
    },
    address: {
      ...INITIAL_APPLICATION_STATE.address,
      hasBranches: false,
      street: '123 Ayala Ave',
      postalCode: '1200',
    },
    payout: {
      ...INITIAL_APPLICATION_STATE.payout,
      accountHolder: 'Juan Dela Cruz',
      accountNumber: '1234567890',
    },
    configuration: {
      ...INITIAL_APPLICATION_STATE.configuration,
      services: { delivery: true, pickup: false, tableReservations: false },
    },
  };

  const missingComplete = getMissingBusinessApplicationRequirements(completeForm);
  assert.deepEqual(missingComplete, []);
});

test('getMissingRiderApplicationRequirements names missing items and passes when complete', () => {
  const missingInitial = getMissingRiderApplicationRequirements(INITIAL_RIDER_APPLICATION_STATE);
  assert.ok(missingInitial.some((m) => m.field === 'verification'));
  assert.ok(missingInitial.some((m) => m.field === 'primaryClearance'));

  const completeRider = {
    ...INITIAL_RIDER_APPLICATION_STATE,
    emailVerification: { isVerified: true, verifiedEmail: 'rider@example.com' },
    personal: {
      ...INITIAL_RIDER_APPLICATION_STATE.personal,
      firstName: 'Pedro',
      lastName: 'Penduko',
      dateOfBirth: '1995-05-05',
      phone: '09171234567',
    },
    identity: {
      ...INITIAL_RIDER_APPLICATION_STATE.identity,
      idNumber: 'ID-12345',
      isPermanent: true,
      frontPhoto: { name: 'front.jpg', previewUrl: 'blob:front' },
      selfiePhoto: { name: 'selfie.jpg', previewUrl: 'blob:selfie' },
    },
    deliveryMethod: 'walking',
    clearanceDocuments: {
      nbi_clearance: { name: 'nbi.pdf', previewUrl: 'blob:nbi' },
    },
    emergency: {
      ...INITIAL_RIDER_APPLICATION_STATE.emergency,
      contactName: 'Maria Penduko',
      phone: '09179876543',
      preferredCity: 'Quezon City',
    },
    payout: {
      ...INITIAL_RIDER_APPLICATION_STATE.payout,
      accountHolder: 'Pedro Penduko',
      accountNumber: '09171234567',
    },
  };

  assert.deepEqual(getMissingRiderApplicationRequirements(completeRider), []);
});

test('draftFileStore isolates files per user scope and deletes only that user on logout cleanup', async () => {
  _resetDraftFileMemoryStoreForTests();
  const docA = new Blob(['user-a-id'], { type: 'image/jpeg' });
  const docB = new Blob(['user-b-id'], { type: 'image/jpeg' });

  await saveDraftFiles('partner_10', { 'doc:government_id': { file: docA, name: 'a.jpg' } });
  await saveDraftFiles('rider_10', { 'identity:frontPhoto': { file: docA, name: 'a_rider.jpg' } });
  await saveDraftFiles('partner_20', { 'doc:government_id': { file: docB, name: 'b.jpg' } });

  await clearDraftFiles('partner_10');
  await clearDraftFiles('rider_10');

  assert.deepEqual(await loadDraftFiles('partner_10'), {});
  assert.deepEqual(await loadDraftFiles('rider_10'), {});
  const userBFiles = await loadDraftFiles('partner_20');
  assert.equal(userBFiles['doc:government_id']?.name, 'b.jpg');
});

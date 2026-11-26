import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import reactPlugin from '@vitejs/plugin-react';
import { createServer } from 'vite';
import {
  clearOnboardingMemoryForTest,
  getOnboardingStorageKey,
  getOnboardingState,
  isOnboardingDone,
  setOnboardingState,
  isSetupChecklistDismissed,
  dismissSetupChecklist,
  normalizePhilippineMobile,
  isValidPhilippineMobile,
  evaluateShouldShowOnboarding,
  deriveRiderGoOnlineChecklist,
  deriveBusinessSetupChecklist,
} from '../services/onboardingService.js';
import {
  ONBOARDING_CONTENT_BY_ROLE,
  SHARED_ONBOARDING_CONTENT,
  interpolateCopy,
} from '../config/onboarding/index.js';

test('onboardingService: per-user, per-role state isolation for multi-role accounts', () => {
  clearOnboardingMemoryForTest();

  const userId = 42;
  assert.equal(getOnboardingStorageKey(userId, 'customer'), 'salo_onboarding_42_customer');
  assert.equal(getOnboardingStorageKey(userId, 'rider'), 'salo_onboarding_42_rider');
  assert.equal(getOnboardingStorageKey(userId, 'owner'), 'salo_onboarding_42_business');

  assert.equal(isOnboardingDone(userId, 'customer'), false);
  assert.equal(isOnboardingDone(userId, 'rider'), false);
  assert.equal(isOnboardingDone(userId, 'business'), false);

  // Finishing customer onboarding must NOT hide rider or business onboarding
  setOnboardingState(userId, 'customer', 'completed');
  assert.equal(isOnboardingDone(userId, 'customer'), true);
  assert.equal(getOnboardingState(userId, 'customer').status, 'completed');
  assert.equal(isOnboardingDone(userId, 'rider'), false);
  assert.equal(isOnboardingDone(userId, 'business'), false);

  // Skipping rider onboarding marks rider done without affecting business or another user
  setOnboardingState(userId, 'rider', 'skipped');
  assert.equal(isOnboardingDone(userId, 'rider'), true);
  assert.equal(getOnboardingState(userId, 'rider').status, 'skipped');
  assert.equal(isOnboardingDone(userId, 'business'), false);
  assert.equal(isOnboardingDone(99, 'customer'), false);
  assert.equal(isOnboardingDone(99, 'rider'), false);
});

test('onboardingService: evaluateShouldShowOnboarding enforces role, approval, staff, and admin rules', () => {
  clearOnboardingMemoryForTest();

  const multiRoleUser = {
    user_id: 101,
    username: 'elena_cruz',
    user_role: 'customer',
    roles: ['customer', 'owner', 'rider'],
    phone_number: null,
    rider_profile: { rider_status: 'active' },
  };

  // 1. New customer with no phone and no saved address sees Customer onboarding
  assert.equal(
    evaluateShouldShowOnboarding({
      role: 'customer',
      user: multiRoleUser,
      hasSavedPhone: false,
      hasSavedAddress: false,
    }),
    true,
  );

  // Customer who already has a phone or address does not see Customer onboarding
  assert.equal(
    evaluateShouldShowOnboarding({
      role: 'customer',
      user: { ...multiRoleUser, phone_number: '09171234567' },
      hasSavedPhone: true,
      hasSavedAddress: false,
    }),
    false,
  );
  assert.equal(
    evaluateShouldShowOnboarding({
      role: 'customer',
      user: multiRoleUser,
      hasSavedPhone: false,
      hasSavedAddress: true,
    }),
    false,
  );

  // 2. Finishing customer onboarding hides customer modal, but rider & business still show
  setOnboardingState(101, 'customer', 'completed');
  assert.equal(
    evaluateShouldShowOnboarding({
      role: 'customer',
      user: multiRoleUser,
      hasSavedPhone: false,
      hasSavedAddress: false,
    }),
    false,
  );
  assert.equal(
    evaluateShouldShowOnboarding({
      role: 'rider',
      user: multiRoleUser,
      isApprovedRider: true,
    }),
    true,
  );
  assert.equal(
    evaluateShouldShowOnboarding({
      role: 'business',
      user: multiRoleUser,
      isApprovedOwner: true,
      isStaffOnly: false,
    }),
    true,
  );

  // 3. Pending, rejected, or suspended riders do NOT see Rider onboarding
  for (const unapprovedStatus of ['pending', 'rejected', 'suspended', 'inactive']) {
    assert.equal(
      evaluateShouldShowOnboarding({
        role: 'rider',
        user: {
          user_id: 202,
          user_role: 'customer',
          roles: ['customer'],
          rider_profile: { rider_status: unapprovedStatus },
        },
        isApprovedRider: false,
      }),
      false,
    );
  }

  // 4. Restaurant staff and unapproved restaurant applicants do NOT see Business onboarding
  assert.equal(
    evaluateShouldShowOnboarding({
      role: 'business',
      user: { user_id: 303, user_role: 'customer', roles: ['customer', 'staff'], role: 'staff' },
      isApprovedOwner: false,
      isStaffOnly: true,
    }),
    false,
  );
  assert.equal(
    evaluateShouldShowOnboarding({
      role: 'business',
      user: { user_id: 304, user_role: 'customer', roles: ['customer'] },
      isApprovedOwner: false,
      isStaffOnly: false,
    }),
    false,
  );

  // 5. Admin never sees any onboarding modal
  const adminUser = {
    user_id: 1,
    user_role: 'admin',
    roles: ['customer', 'admin'],
    capabilities: { is_admin: true },
  };
  assert.equal(evaluateShouldShowOnboarding({ role: 'customer', user: adminUser }), false);
  assert.equal(evaluateShouldShowOnboarding({ role: 'rider', user: adminUser, isApprovedRider: true }), false);
  assert.equal(evaluateShouldShowOnboarding({ role: 'business', user: adminUser, isApprovedOwner: true }), false);
});

test('onboardingService: Philippine mobile number validation and normalization', () => {
  assert.equal(isValidPhilippineMobile('09171234567'), true);
  assert.equal(isValidPhilippineMobile('+639171234567'), true);
  assert.equal(isValidPhilippineMobile('+63 917-123-4567'), true);

  assert.equal(normalizePhilippineMobile('09171234567'), '09171234567');
  assert.equal(normalizePhilippineMobile('+639171234567'), '09171234567');
  assert.equal(normalizePhilippineMobile(' +63 918 987 6543 '), '09189876543');

  assert.equal(isValidPhilippineMobile(''), false);
  assert.equal(isValidPhilippineMobile('08171234567'), false);
  assert.equal(isValidPhilippineMobile('0917123456'), false);
  assert.equal(isValidPhilippineMobile('091712345678'), false);
  assert.equal(isValidPhilippineMobile('+14155552671'), false);
});

test('onboardingService: deriveRiderGoOnlineChecklist shows real backend items and omits missing ones', () => {
  // Case A: Full backend dashboard payload (without shift table data)
  const fullChecklist = deriveRiderGoOnlineChecklist(
    {
      rider: {
        rider_status: 'active',
        base_city: 'Quezon City',
      },
      stats: {
        has_active_delivery: false,
      },
    },
    'granted',
  );

  const idsA = fullChecklist.map((item) => item.id);
  assert.deepEqual(idsA, [
    'applicationApproved',
    'accountActive',
    'eligibleZone',
    'noConflictingDelivery',
    'locationPermission',
  ]);
  assert.ok(!idsA.includes('assignedShift'), 'Missing shift data must be hidden, never faked');
  assert.equal(fullChecklist.every((item) => item.done), true);

  // Case B: Missing base_city and stats -> only available items + locationPermission are shown
  const partialChecklist = deriveRiderGoOnlineChecklist(
    {
      rider: {
        rider_status: 'approved',
      },
    },
    'prompt',
  );
  const idsB = partialChecklist.map((item) => item.id);
  assert.deepEqual(idsB, ['applicationApproved', 'accountActive', 'locationPermission']);
  assert.equal(partialChecklist.find((item) => item.id === 'locationPermission')?.done, false);
});

test('onboardingService: deriveBusinessSetupChecklist derives state and hides Tables when not applicable', () => {
  // 1. From backend setup-status payload (dine-in/reservations enabled, some incomplete)
  const incompleteChecklist = deriveBusinessSetupChecklist({
    backendStatus: {
      business_profile: { complete: true },
      operating_hours: { complete: true },
      menu: { complete: false },
      tables: { applicable: true, complete: false },
      availability_toggles: { complete: true },
    },
  });

  assert.equal(incompleteChecklist.totalCount, 5);
  assert.equal(incompleteChecklist.completedCount, 3);
  assert.equal(incompleteChecklist.allComplete, false);
  assert.equal(incompleteChecklist.firstIncompleteHref, '/owner/menu');

  // 2. Delivery-only restaurant: tables.applicable is false -> Tables item is hidden
  const deliveryOnlyChecklist = deriveBusinessSetupChecklist({
    backendStatus: {
      business_profile: { complete: true },
      operating_hours: { complete: true },
      menu: { complete: true },
      tables: { applicable: false, complete: true },
      availability_toggles: { complete: true },
    },
  });

  assert.equal(deliveryOnlyChecklist.totalCount, 4);
  assert.ok(!deliveryOnlyChecklist.items.some((item) => item.id === 'tables'));
  assert.equal(deliveryOnlyChecklist.allComplete, true);
  assert.equal(deliveryOnlyChecklist.firstIncompleteHref, '/owner');

  // 3. Setup checklist card dismissal per user + restaurant
  clearOnboardingMemoryForTest();
  assert.equal(isSetupChecklistDismissed(10, 'dalisay-heritage'), false);
  dismissSetupChecklist(10, 'dalisay-heritage');
  assert.equal(isSetupChecklistDismissed(10, 'dalisay-heritage'), true);
  assert.equal(isSetupChecklistDismissed(10, 'manila-artisan-pizza'), false);
});

test('onboarding content: verifies required role copy and skip confirmation strings', () => {
  assert.equal(
    SHARED_ONBOARDING_CONTENT.skipConfirmation.message,
    'Are you sure you want to skip setup for now? You can complete this anytime.',
  );
  assert.equal(SHARED_ONBOARDING_CONTENT.skipConfirmation.confirmButton, 'Yes, skip');
  assert.equal(SHARED_ONBOARDING_CONTENT.skipConfirmation.cancelButton, 'Continue setup');

  const customerSteps = ONBOARDING_CONTENT_BY_ROLE.customer.steps;
  assert.equal(interpolateCopy(customerSteps[0].titleTemplate, { username: 'cassidy' }), 'Welcome, cassidy!');
  assert.equal(customerSteps[0].primaryButton, 'Simulan na natin!');
  assert.equal(customerSteps[0].wholeSkipButton, 'Maybe later');
  assert.equal(customerSteps[1].title, 'What is your mobile number?');
  assert.equal(customerSteps[1].validationError, 'Enter a valid mobile number, like 09171234567.');
  assert.equal(customerSteps[2].title, 'Where should we deliver?');
  assert.equal(customerSteps[3].title, 'All set! You are ready to order.');
  assert.equal(customerSteps[3].primaryButton, 'Start ordering');

  const riderSteps = ONBOARDING_CONTENT_BY_ROLE.rider.steps;
  assert.equal(riderSteps[0].primaryButton, 'Tara, mag-deliver tayo!');
  assert.equal(riderSteps[0].wholeSkipButton, 'Maybe later');
  assert.equal(riderSteps[1].title, 'How deliveries work');
  assert.equal(riderSteps[2].title, 'Before you go online');
  assert.equal(riderSteps[3].title, 'Safety and cash-on-delivery');
  assert.equal(riderSteps[4].primaryButton, 'Go to Rider Dashboard');

  const businessSteps = ONBOARDING_CONTENT_BY_ROLE.business.steps;
  assert.equal(businessSteps[0].primaryButton, 'Start Setup');
  assert.equal(businessSteps[0].wholeSkipButton, 'Maybe later');
  assert.equal(businessSteps[1].title, 'Prepare your restaurant');
  assert.equal(businessSteps[2].title, 'Good to know');
  assert.equal(businessSteps[3].primaryButton, 'Continue to Setup');
});

test('RoleOnboardingModal & SetupChecklistCard render accessible dialog markup and checklist states', async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../', import.meta.url)),
    plugins: [reactPlugin()],
    server: { middlewareMode: true },
    ssr: { external: ['react', 'react-dom', 'react-router-dom', 'leaflet', 'react-leaflet'] },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const { RoleOnboardingModal } = await server.ssrLoadModule(
      '/src/components/onboarding/RoleOnboardingModal.jsx',
    );
    const { SetupChecklistCard } = await server.ssrLoadModule(
      '/src/features/restaurant/components/SetupChecklistCard.jsx',
    );

    // 1. Customer modal renders accessible dialog with personalized welcome and progress bar
    const customerHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(RoleOnboardingModal, {
          role: 'customer',
          open: true,
          user: { user_id: 77, username: 'juan_delacruz' },
          onComplete: () => {},
          onSkip: () => {},
        }),
      ),
    );
    assert.match(customerHtml, /role="dialog"/);
    assert.match(customerHtml, /aria-modal="true"/);
    assert.match(customerHtml, /role="progressbar"/);
    assert.match(customerHtml, /Welcome, juan_delacruz!/);
    assert.match(customerHtml, /Simulan na natin!/);
    assert.match(customerHtml, /Maybe later/);
    assert.match(customerHtml, /\/brand\/salo-icon\.png/);

    // 2. Rider modal renders with rider welcome copy
    const riderHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(RoleOnboardingModal, {
          role: 'rider',
          open: true,
          user: { user_id: 88, username: 'marco_rider' },
          onComplete: () => {},
          onSkip: () => {},
        }),
      ),
    );
    assert.match(riderHtml, /Welcome, marco_rider!/);
    assert.match(riderHtml, /Welcome to the SALO rider fleet/);
    assert.match(riderHtml, /Tara, mag-deliver tayo!/);

    // 3. Business modal renders with partner welcome copy
    const businessHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(RoleOnboardingModal, {
          role: 'business',
          open: true,
          user: { user_id: 99, username: 'kusina_owner' },
          onComplete: () => {},
          onSkip: () => {},
        }),
      ),
    );
    assert.match(businessHtml, /Mabuhay, kusina_owner!/);
    assert.match(businessHtml, /Congratulations on becoming a SALO partner!/);
    assert.match(businessHtml, /Start Setup/);

    // 4. Closed modal renders nothing
    const closedHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(RoleOnboardingModal, {
          role: 'customer',
          open: false,
          user: { user_id: 77, username: 'juan_delacruz' },
          onComplete: () => {},
          onSkip: () => {},
        }),
      ),
    );
    assert.equal(closedHtml, '');

    // 5. SetupChecklistCard renders when incomplete and hides when all complete
    clearOnboardingMemoryForTest();
    const incompleteChecklist = deriveBusinessSetupChecklist({
      backendStatus: {
        business_profile: { complete: true },
        operating_hours: { complete: false },
        menu: { complete: false },
        tables: { applicable: true, complete: true },
        availability_toggles: { complete: false },
      },
    });
    const cardHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(SetupChecklistCard, {
          userId: 99,
          restaurantId: 'rest-99',
          isApprovedOwner: true,
          checklist: incompleteChecklist,
        }),
      ),
    );
    assert.match(cardHtml, /Setup checklist/);
    assert.match(cardHtml, /2 of 5 completed/);
    assert.match(cardHtml, /\/owner\/profile#operating-hours-heading/);

    // Staff / non-owner never sees the SetupChecklistCard
    const staffCardHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(SetupChecklistCard, {
          userId: 99,
          restaurantId: 'rest-99',
          isApprovedOwner: false,
          checklist: incompleteChecklist,
        }),
      ),
    );
    assert.equal(staffCardHtml, '');

    const completeChecklist = deriveBusinessSetupChecklist({
      backendStatus: {
        business_profile: { complete: true },
        operating_hours: { complete: true },
        menu: { complete: true },
        tables: { applicable: false, complete: true },
        availability_toggles: { complete: true },
      },
    });
    const hiddenCardHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(SetupChecklistCard, {
          userId: 99,
          restaurantId: 'rest-99',
          isApprovedOwner: true,
          checklist: completeChecklist,
        }),
      ),
    );
    assert.equal(hiddenCardHtml, '');

    const withPublishPending = deriveBusinessSetupChecklist({
      backendStatus: {
        business_profile: { complete: true },
        operating_hours: { complete: true },
        menu: { complete: true },
        tables: { applicable: false, complete: true },
        availability_toggles: { complete: true },
        publish: { complete: false },
      },
    });
    assert.equal(withPublishPending.totalCount, 5);
    assert.equal(withPublishPending.completedCount, 4);
    assert.equal(withPublishPending.allComplete, false);
    assert.equal(withPublishPending.items.at(-1).id, 'publish');
  } finally {
    await server.close();
  }
});

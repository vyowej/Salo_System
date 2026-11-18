import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getNotificationRoute, normalizeNotification } from '../utils/notificationUtils.js';
import staffInvitationService, {
  normalizeRestaurantStaffMember,
  STAFF_POSITIONS,
} from '../services/staffInvitationService.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockJsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('Restaurant backend notification types normalize and map to valid owner routes', () => {
  const cases = [
    { type: 'order_received', entity: 'order', id: 10, expected: '/owner/orders' },
    { type: 'order_cancelled_by_customer', entity: 'order', id: 11, expected: '/owner/orders' },
    { type: 'staff_invitation_accepted', entity: 'staff_invitation', id: 12, expected: '/owner/team' },
    { type: 'staff_invitation_declined', entity: 'staff_invitation', id: 13, expected: '/owner/team' },
    { type: 'restaurant_application_approved', entity: 'restaurant_applications', id: 14, expected: '/owner' },
  ];

  for (const c of cases) {
    const item = normalizeNotification({
      notification_id: c.id,
      workspace: 'restaurant',
      type: c.type,
      title: 'Update',
      body: 'Details',
      related_entity_type: c.entity,
      related_entity_id: c.id,
      is_read: false,
      read_at: null,
      created_at: '2026-11-18T22:25:00+08:00',
    });

    assert.equal(item.workspace, 'restaurant');
    assert.equal(item.href, c.expected);
  }

  assert.equal(
    getNotificationRoute({ workspace: 'restaurant', type: 'unknown_restaurant_event' }),
    '/owner',
  );
});

test('normalizeRestaurantStaffMember and restaurant staff invitation API methods work and propagate errors', async () => {
  const member = normalizeRestaurantStaffMember({
    staff_id: 50,
    restaurant_id: 3,
    user_id: 9,
    first_name: 'Carlo',
    last_name: 'Reyes',
    username: 'carlo_r',
    staff_position: 'Order Handler',
    status: 'pending',
    staff_status: 'invited',
    invitation_note: 'Evening shift',
    invited_at: '2026-11-18T12:00:00+08:00',
    expires_at: '2026-11-25T12:00:00+08:00',
  });

  assert.equal(member.id, 50);
  assert.equal(member.status, 'pending');
  assert.equal(member.staff_position, 'Order Handler');
  assert.ok(STAFF_POSITIONS.includes('Order Handler'));
  assert.ok(STAFF_POSITIONS.includes('Manager'));

  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || 'GET', body: init?.body || null });
    if (String(url).endsWith('/auth/csrf')) {
      return mockJsonResponse({ success: true, data: { csrf_token: 'tok' } });
    }
    if (String(url).includes('/restaurant/staff?restaurant_id=3')) {
      return mockJsonResponse({
        success: true,
        data: {
          restaurant_id: 3,
          restaurant_name: 'Baguio Cafe',
          staff: [member],
        },
      });
    }
    if (String(url).endsWith('/restaurant/staff/invitations')) {
      return mockJsonResponse({
        success: true,
        message: 'If an eligible SALO account matches that username or email, an invitation has been sent.',
        data: { submitted: true },
      });
    }
    if (String(url).endsWith('/restaurant/staff/invitations/50/cancel')) {
      return mockJsonResponse({ success: false, message: 'Only pending invitations can be cancelled.' }, 409);
    }
    return mockJsonResponse({ success: false }, 404);
  };

  const staffRes = await staffInvitationService.getRestaurantStaff(3);
  assert.equal(staffRes.restaurant_name, 'Baguio Cafe');
  assert.equal(staffRes.staff.length, 1);

  const inviteRes = await staffInvitationService.sendStaffInvitation({
    restaurant_id: 3,
    identifier: 'carlo_r',
    staff_position: 'Order Handler',
    note: 'Evening shift',
  });
  assert.equal(inviteRes.submitted, true);

  await assert.rejects(
    () => staffInvitationService.cancelStaffInvitation(50),
    /Only pending invitations/,
  );

  const sendCall = calls.find((c) => c.url.endsWith('/restaurant/staff/invitations'));
  assert.equal(sendCall.method, 'POST');
  assert.match(sendCall.body, /"staff_position":"Order Handler"/);
});

test('OwnerLayout, OwnerNotificationsMenu, and TeamAndStaffPage are wired to restaurant workspace and staff APIs', () => {
  const layoutSrc = fs.readFileSync(path.resolve('src/layouts/OwnerLayout.jsx'), 'utf8');
  const menuSrc = fs.readFileSync(path.resolve('src/features/restaurant/components/OwnerNotificationsMenu.jsx'), 'utf8');
  const teamSrc = fs.readFileSync(path.resolve('src/features/restaurant/pages/TeamAndStaffPage.jsx'), 'utf8');

  assert.match(layoutSrc, /OwnerNotificationsMenu/);
  assert.match(layoutSrc, /notificationsSlot=\{<OwnerNotificationsMenu \/>\}/);

  assert.match(menuSrc, /useWorkspaceNotifications\(/);
  assert.match(menuSrc, /workspace:\s*'restaurant'/);
  assert.match(menuSrc, /markAsRead\(/);
  assert.match(menuSrc, /markAllAsRead\(/);
  assert.match(menuSrc, /getNotificationRoute\(/);

  assert.match(teamSrc, /staffInvitationService\.getRestaurantStaff/);
  assert.match(teamSrc, /staffInvitationService\.sendStaffInvitation/);
  assert.match(teamSrc, /staffInvitationService\.cancelStaffInvitation/);
  assert.match(teamSrc, /state="error"/);
});

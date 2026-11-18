import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import staffInvitationService, {
  executeAcceptStaffInvitation,
  normalizeStaffInvitation,
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

test('normalizeStaffInvitation maps backend invitation fields cleanly', () => {
  const item = normalizeStaffInvitation({
    staff_id: 24,
    restaurant_id: 5,
    restaurant_name: 'Salo Grill',
    staff_position: 'Order Handler',
    status: 'pending',
    staff_status: 'invited',
    invitation_note: 'Join our weekend shift',
    invited_by_first_name: 'Sofia',
    invited_at: '2026-11-18T10:00:00+08:00',
    expires_at: '2026-11-25T10:00:00+08:00',
    responded_at: null,
    joined_at: null,
  });

  assert.equal(item.id, 24);
  assert.equal(item.staff_id, 24);
  assert.equal(item.restaurant_name, 'Salo Grill');
  assert.equal(item.staff_position, 'Order Handler');
  assert.equal(item.status, 'pending');
  assert.equal(item.invited_by_first_name, 'Sofia');
  assert.equal(item.invitation_note, 'Join our weekend shift');
});

test('accountService staff invitation methods call real endpoints and propagate errors', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || 'GET' });
    if (String(url).endsWith('/auth/csrf')) {
      return mockJsonResponse({ success: true, data: { csrf_token: 'tok' } });
    }
    if (String(url).endsWith('/account/staff-invitations')) {
      return mockJsonResponse({
        success: true,
        data: {
          invitations: [
            {
              staff_id: 11,
              restaurant_id: 2,
              restaurant_name: 'Iloilo Kitchen',
              staff_position: 'Manager',
              status: 'pending',
              staff_status: 'invited',
              invited_by_first_name: 'Marco',
              invited_at: '2026-11-18T09:00:00+08:00',
              expires_at: '2026-11-25T09:00:00+08:00',
            },
          ],
        },
      });
    }
    if (String(url).endsWith('/account/staff-invitations/11/accept')) {
      return mockJsonResponse({ success: true, data: { staff_id: 11, status: 'accepted' } });
    }
    if (String(url).endsWith('/account/staff-invitations/11/decline')) {
      return mockJsonResponse({ success: false, message: 'This staff invitation has expired.' }, 409);
    }
    return mockJsonResponse({ success: false }, 404);
  };

  const list = await staffInvitationService.getStaffInvitations();
  assert.equal(list.length, 1);
  assert.equal(list[0].restaurant_name, 'Iloilo Kitchen');

  const accepted = await staffInvitationService.acceptStaffInvitation(11);
  assert.equal(accepted.status, 'accepted');

  await assert.rejects(
    () => staffInvitationService.declineStaffInvitation(11),
    /expired/,
  );

  assert.ok(calls.some((c) => c.method === 'GET' && c.url.endsWith('/account/staff-invitations')));
  assert.ok(calls.some((c) => c.method === 'POST' && c.url.endsWith('/account/staff-invitations/11/accept')));
  assert.ok(calls.some((c) => c.method === 'POST' && c.url.endsWith('/account/staff-invitations/11/decline')));
});

test('Customer notification components & pages are wired to customer workspace and real APIs', () => {
  const menuSrc = fs.readFileSync(path.resolve('src/features/customer/components/CustomerNotificationsMenu.jsx'), 'utf8');
  const pageSrc = fs.readFileSync(path.resolve('src/features/customer/pages/NotificationsPage.jsx'), 'utf8');
  const inboxSrc = fs.readFileSync(path.resolve('src/features/customer/pages/InvitationsInboxPage.jsx'), 'utf8');

  assert.match(menuSrc, /useWorkspaceNotifications\(/);
  assert.match(menuSrc, /workspace:\s*'customer'/);
  assert.match(menuSrc, /markAsRead\(/);
  assert.match(menuSrc, /markAllAsRead\(/);
  assert.doesNotMatch(menuSrc, /customerService\.markAllNotificationsRead/);

  assert.match(pageSrc, /useWorkspaceNotifications\(/);
  assert.match(pageSrc, /workspace:\s*'customer'/);
  assert.match(pageSrc, /state="error"/);
  assert.match(pageSrc, /markAllAsRead\(/);

  assert.match(inboxSrc, /staffInvitationService\.getStaffInvitations/);
  assert.match(inboxSrc, /executeAcceptStaffInvitation/);
  assert.match(inboxSrc, /staffInvitationService\.acceptStaffInvitation/);
  assert.match(inboxSrc, /staffInvitationService\.declineStaffInvitation/);
  assert.match(inboxSrc, /useAuth\(/);
  assert.match(inboxSrc, /refreshUser/);
  assert.match(inboxSrc, /submittingId !== null/);
  assert.match(inboxSrc, /Refresh account roles/);
});

test('executeAcceptStaffInvitation calls refreshUser and reloads invitations on success', async () => {
  const events = [];
  const result = await executeAcceptStaffInvitation({
    invitationId: 21,
    acceptFn: async (id) => {
      events.push(`accept:${id}`);
      return { staff_id: id, status: 'accepted' };
    },
    refreshUserFn: async () => {
      events.push('refreshUser');
      return { roles: ['customer', 'staff'] };
    },
    reloadInvitationsFn: async () => {
      events.push('reloadInvitations');
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.userRefreshed, true);
  assert.deepEqual(events, ['accept:21', 'refreshUser', 'reloadInvitations']);
});

test('executeAcceptStaffInvitation does not call refreshUser when accept fails', async () => {
  let refreshCalled = false;
  let reloadCalled = false;

  await assert.rejects(
    () => executeAcceptStaffInvitation({
      invitationId: 22,
      acceptFn: async () => {
        throw new Error('This staff invitation has expired.');
      },
      refreshUserFn: async () => {
        refreshCalled = true;
      },
      reloadInvitationsFn: async () => {
        reloadCalled = true;
      },
    }),
    /expired/,
  );

  assert.equal(refreshCalled, false);
  assert.equal(reloadCalled, false);
});

test('executeAcceptStaffInvitation preserves acceptance and reloads list even if refreshUser fails', async () => {
  let reloadCalled = false;

  const result = await executeAcceptStaffInvitation({
    invitationId: 23,
    acceptFn: async (id) => ({ staff_id: id, status: 'accepted' }),
    refreshUserFn: async () => {
      throw new Error('Temporary network timeout');
    },
    reloadInvitationsFn: async () => {
      reloadCalled = true;
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.userRefreshed, false);
  assert.match(result.refreshError.message, /Temporary network timeout/);
  assert.equal(reloadCalled, true);
});

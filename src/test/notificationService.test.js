import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getNotificationCategory,
  getNotificationCategoryLabel,
  getNotificationRoute,
  normalizeNotification,
  normalizeUnreadCounts,
} from '../utils/notificationUtils.js';
import notificationService from '../services/notificationService.js';

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

test('normalizeNotification preserves backend fields and handles unknown types gracefully', () => {
  const raw = {
    notification_id: 15,
    user_id: 7,
    workspace: 'customer',
    type: 'order_accepted',
    title: 'Order SALO-ORD-1 accepted',
    body: 'Manila Bistro accepted your order.',
    related_entity_type: 'order',
    related_entity_id: 99,
    is_read: false,
    read_at: null,
    created_at: '2026-11-18T22:00:00+08:00',
  };

  const normalized = normalizeNotification(raw);
  assert.equal(normalized.notification_id, 15);
  assert.equal(normalized.id, 15);
  assert.equal(normalized.user_id, 7);
  assert.equal(normalized.workspace, 'customer');
  assert.equal(normalized.type, 'order_accepted');
  assert.equal(normalized.body, 'Manila Bistro accepted your order.');
  assert.equal(normalized.description, 'Manila Bistro accepted your order.');
  assert.equal(normalized.is_read, false);
  assert.equal(normalized.read, false);
  assert.equal(normalized.category, 'order');
  assert.equal(normalized.href, '/customer/orders/99');

  const unknown = normalizeNotification({
    notification_id: 16,
    workspace: 'rider',
    type: 'future_unmapped_event',
    title: 'Notice',
    body: 'Something happened.',
    is_read: true,
    read_at: '2026-11-18T22:05:00+08:00',
    created_at: '2026-11-18T22:00:00+08:00',
  });

  assert.equal(unknown.category, 'system');
  assert.equal(getNotificationCategory('future_unmapped_event'), 'system');
  assert.equal(getNotificationCategoryLabel('future_unmapped_event'), 'Update');
  assert.equal(unknown.href, '/rider');
  assert.equal(unknown.is_read, true);
});

test('getNotificationRoute maps all 4 workspaces and falls back safely for unknown types', () => {
  assert.equal(
    getNotificationRoute({ workspace: 'customer', type: 'order_ready', related_entity_type: 'order', related_entity_id: 12 }),
    '/customer/orders/12',
  );
  assert.equal(
    getNotificationRoute({ workspace: 'customer', type: 'staff_invitation_received', related_entity_type: 'staff_invitation', related_entity_id: 5 }),
    '/customer/invitations',
  );
  assert.equal(
    getNotificationRoute({ workspace: 'customer', type: 'restaurant_application_rejected', related_entity_type: 'restaurant_applications', related_entity_id: 3 }),
    '/business-application/status',
  );
  assert.equal(
    getNotificationRoute({ workspace: 'customer', type: 'rider_application_under_review', related_entity_type: 'rider_applications', related_entity_id: 4 }),
    '/rider-application/status',
  );
  assert.equal(
    getNotificationRoute({ workspace: 'customer', type: 'unknown_thing' }),
    '/customer',
  );

  assert.equal(
    getNotificationRoute({ workspace: 'restaurant', type: 'order_received', related_entity_type: 'order', related_entity_id: 21 }),
    '/owner/orders',
  );
  assert.equal(
    getNotificationRoute({ workspace: 'restaurant', type: 'staff_invitation_accepted', related_entity_type: 'staff_invitation', related_entity_id: 8 }),
    '/owner/team',
  );
  assert.equal(
    getNotificationRoute({ workspace: 'restaurant', type: 'restaurant_application_approved', related_entity_type: 'restaurant_applications', related_entity_id: 9 }),
    '/owner',
  );

  assert.equal(
    getNotificationRoute({ workspace: 'rider', type: 'rider_application_approved', related_entity_type: 'rider_applications', related_entity_id: 4 }),
    '/rider/application/status',
  );
  assert.equal(
    getNotificationRoute({ workspace: 'rider', type: 'rider_activated', related_entity_type: 'rider', related_entity_id: 2 }),
    '/rider',
  );

  assert.equal(
    getNotificationRoute({ workspace: 'admin', type: 'restaurant_application_submitted', related_entity_type: 'restaurant_applications', related_entity_id: 7 }),
    '/admin/applications',
  );
  assert.equal(
    getNotificationRoute({ workspace: 'admin', type: 'unknown_admin_event' }),
    '/admin',
  );
});

test('normalizeUnreadCounts maps total and all 4 workspaces', () => {
  const counts = normalizeUnreadCounts({
    total: 6,
    by_workspace: {
      customer: 2,
      restaurant: 3,
      rider: 1,
      admin: 0,
    },
  });

  assert.deepEqual(counts, {
    total: 6,
    by_workspace: { customer: 2, restaurant: 3, rider: 1, admin: 0 },
  });
});

test('fetchNotifications enforces workspace isolation, deduplicates concurrent calls, and propagates errors', async () => {
  await assert.rejects(
    () => notificationService.fetchNotifications({ workspace: 'invalid_ws' }),
    /Invalid notification workspace/,
  );

  let callCount = 0;
  globalThis.fetch = async (url) => {
    callCount += 1;
    assert.match(String(url), /\/notifications\?workspace=restaurant&unread_only=1&page=2&per_page=10$/);
    return mockJsonResponse({
      success: true,
      data: {
        items: [
          {
            notification_id: 101,
            workspace: 'restaurant',
            type: 'order_received',
            title: 'New order',
            body: 'Juan placed an order.',
            related_entity_type: 'order',
            related_entity_id: 55,
            is_read: false,
            read_at: null,
            created_at: '2026-11-18T22:00:00+08:00',
          },
          {
            notification_id: 102,
            workspace: 'customer',
            type: 'order_accepted',
            title: 'Wrong workspace leak',
            body: 'Should be filtered out.',
            is_read: false,
            read_at: null,
            created_at: '2026-11-18T22:00:00+08:00',
          },
        ],
        pagination: { current_page: 2, per_page: 10, total: 1, last_page: 1 },
      },
    });
  };

  const [resA, resB] = await Promise.all([
    notificationService.fetchNotifications({ workspace: 'restaurant', unreadOnly: true, page: 2, perPage: 10 }),
    notificationService.fetchNotifications({ workspace: 'restaurant', unreadOnly: true, page: 2, perPage: 10 }),
  ]);

  assert.equal(callCount, 1);
  assert.equal(resA.items.length, 1);
  assert.equal(resB.items.length, 1);
  assert.equal(resA.items[0].workspace, 'restaurant');

  globalThis.fetch = async () => mockJsonResponse({ success: false, message: 'Server error' }, 500);
  await assert.rejects(
    () => notificationService.fetchNotifications({ workspace: 'customer' }),
    /Server error/,
  );
});

test('fetchUnreadCounts, markNotificationRead, and markAllNotificationsRead call real endpoints', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || 'GET', body: init?.body || null });

    if (String(url).endsWith('/auth/csrf')) {
      return mockJsonResponse({ success: true, data: { csrf_token: 'tok-123' } });
    }
    if (String(url).endsWith('/notifications/unread-count')) {
      return mockJsonResponse({
        success: true,
        data: { total: 4, by_workspace: { customer: 1, restaurant: 2, rider: 1, admin: 0 } },
      });
    }
    if (String(url).endsWith('/notifications/77/read')) {
      return mockJsonResponse({
        success: true,
        data: {
          notification_id: 77,
          workspace: 'rider',
          type: 'rider_activated',
          title: 'Activated',
          body: 'You are active.',
          is_read: true,
          read_at: '2026-11-18T22:10:00+08:00',
          created_at: '2026-11-18T22:00:00+08:00',
        },
      });
    }
    if (String(url).endsWith('/notifications/read-all')) {
      return mockJsonResponse({ success: true, data: { updated_count: 2 } });
    }

    return mockJsonResponse({ success: false }, 404);
  };

  const counts = await notificationService.fetchUnreadCounts();
  assert.equal(counts.total, 4);
  assert.equal(counts.by_workspace.rider, 1);

  const readItem = await notificationService.markNotificationRead(77);
  assert.equal(readItem.is_read, true);
  assert.equal(readItem.href, '/rider');

  const readAllRes = await notificationService.markAllNotificationsRead({ workspace: 'restaurant' });
  assert.equal(readAllRes.updated_count, 2);

  const readAllCall = calls.find((c) => c.url.endsWith('/notifications/read-all'));
  assert.equal(readAllCall.method, 'POST');
  assert.equal(readAllCall.body, JSON.stringify({ workspace: 'restaurant' }));
});

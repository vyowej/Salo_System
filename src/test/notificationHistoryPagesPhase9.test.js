import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  getNotificationDateBucketManila,
  groupNotificationsByDateManila,
} from '../utils/notificationUtils.js';

test('groupNotificationsByDateManila groups notifications into Today, Yesterday, and Earlier', () => {
  const nowIso = new Date().toISOString();
  const yestIso = new Date(Date.now() - 86400000).toISOString();
  const oldIso = '2025-01-01T10:00:00+08:00';

  assert.equal(getNotificationDateBucketManila(nowIso), 'Today');
  assert.equal(getNotificationDateBucketManila(yestIso), 'Yesterday');
  assert.equal(getNotificationDateBucketManila(oldIso), 'Earlier');

  const grouped = groupNotificationsByDateManila([
    { notification_id: 1, created_at: nowIso },
    { notification_id: 2, created_at: yestIso },
    { notification_id: 3, created_at: oldIso },
  ]);

  assert.deepEqual(
    grouped.map((g) => g.label),
    ['Today', 'Yesterday', 'Earlier'],
  );
  assert.equal(grouped[0].items.length, 1);
});

test('AdminNotificationsPage and OwnerNotificationsPage implement filters, read actions, pagination, and states', () => {
  const adminPageSrc = fs.readFileSync(path.resolve('src/features/admin/pages/AdminNotificationsPage.jsx'), 'utf8');
  const ownerPageSrc = fs.readFileSync(path.resolve('src/features/restaurant/pages/OwnerNotificationsPage.jsx'), 'utf8');

  for (const [label, src, expectedWs] of [
    ['AdminNotificationsPage', adminPageSrc, 'admin'],
    ['OwnerNotificationsPage', ownerPageSrc, 'restaurant'],
  ]) {
    assert.match(src, new RegExp(`workspace:\\s*'${expectedWs}'`), `${label} must scope workspace`);
    assert.match(src, /unreadOnly:\s*filter === 'unread'/, `${label} must support unread filter`);
    assert.match(src, /groupNotificationsByDateManila\(/, `${label} must group by Manila date`);
    assert.match(src, /markAsRead\(/, `${label} must support markAsRead`);
    assert.match(src, /markAllAsRead\(/, `${label} must support markAllAsRead`);
    assert.match(src, /pagination\.last_page > 1/, `${label} must support pagination`);
    assert.match(src, /state="loading"/, `${label} must render loading state`);
    assert.match(src, /state="error"/, `${label} must render error state`);
    assert.match(src, /state="empty"/, `${label} must render empty state`);
    assert.match(src, /Retry/, `${label} must support retry`);
    assert.match(src, /getNotificationRoute\(/, `${label} must use getNotificationRoute`);
  }
});

test('Dropdown View all actions and App.jsx routes wire /admin/notifications and /owner/notifications without module restrictions', () => {
  const appSrc = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8');
  const adminTopbarSrc = fs.readFileSync(path.resolve('src/features/admin/components/AdminTopbar.jsx'), 'utf8');
  const ownerMenuSrc = fs.readFileSync(path.resolve('src/features/restaurant/components/OwnerNotificationsMenu.jsx'), 'utf8');

  assert.match(adminTopbarSrc, /navigate\('\/admin\/notifications'\)/);
  assert.match(ownerMenuSrc, /to="\/owner\/notifications"/);

  assert.match(appSrc, /<Route path="notifications" element=\{<RequireAccess><OwnerNotificationsPage \/><\/RequireAccess>\} \/>/);
  assert.match(appSrc, /<Route path="notifications" element=\{<AdminNotificationsPage \/>\} \/>/);
});

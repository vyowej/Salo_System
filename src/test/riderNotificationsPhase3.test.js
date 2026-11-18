import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getNotificationRoute, normalizeNotification } from '../utils/notificationUtils.js';

test('Rider backend notification types normalize and map to valid rider routes', () => {
  const approved = normalizeNotification({
    notification_id: 301,
    workspace: 'rider',
    type: 'rider_application_approved',
    title: 'Rider application approved',
    body: 'Your rider application (SALO-RID-1001) is approved.',
    related_entity_type: 'rider_applications',
    related_entity_id: 12,
    is_read: false,
    read_at: null,
    created_at: '2026-11-18T22:00:00+08:00',
  });

  assert.equal(approved.workspace, 'rider');
  assert.equal(approved.category, 'application');
  assert.equal(approved.href, '/rider/application/status');

  const activated = normalizeNotification({
    notification_id: 302,
    workspace: 'rider',
    type: 'rider_activated',
    title: 'Rider account activated',
    body: 'Your rider account has been activated.',
    related_entity_type: 'rider',
    related_entity_id: 9,
    is_read: false,
    read_at: null,
    created_at: '2026-11-18T22:05:00+08:00',
  });

  assert.equal(activated.category, 'rider');
  assert.equal(activated.href, '/rider');

  assert.equal(
    getNotificationRoute({ workspace: 'rider', type: 'unknown_rider_event' }),
    '/rider',
  );
});

test('RiderLayout, RiderNotificationsMenu, and RiderNotificationsPage are wired to workspace rider', () => {
  const layoutSrc = fs.readFileSync(path.resolve('src/layouts/RiderLayout.jsx'), 'utf8');
  const menuSrc = fs.readFileSync(path.resolve('src/features/rider/components/RiderNotificationsMenu.jsx'), 'utf8');
  const pageSrc = fs.readFileSync(path.resolve('src/features/rider/pages/RiderNotificationsPage.jsx'), 'utf8');

  assert.match(layoutSrc, /RiderNotificationsMenu/);
  assert.match(layoutSrc, /notificationsSlot=\{<RiderNotificationsMenu \/>\}/);
  assert.doesNotMatch(layoutSrc, /dashboard\?\.unread_notifications/);

  assert.match(menuSrc, /useWorkspaceNotifications\(/);
  assert.match(menuSrc, /workspace:\s*'rider'/);
  assert.match(menuSrc, /markAsRead\(/);
  assert.match(menuSrc, /markAllAsRead\(/);
  assert.match(menuSrc, /getNotificationRoute\(/);

  assert.match(pageSrc, /useWorkspaceNotifications\(/);
  assert.match(pageSrc, /workspace:\s*'rider'/);
  assert.match(pageSrc, /state="error"/);
  assert.match(pageSrc, /markAllAsRead\(/);
  assert.match(pageSrc, /Asia\/Manila/);
});

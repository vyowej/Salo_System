import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getNotificationRoute, normalizeNotification } from '../utils/notificationUtils.js';

test('Admin backend notification types normalize and map to valid admin routes', () => {
  const types = [
    { type: 'restaurant_application_submitted', entity: 'restaurant_applications', id: 10 },
    { type: 'rider_application_submitted', entity: 'rider_applications', id: 11 },
    { type: 'restaurant_application_resubmitted', entity: 'restaurant_applications', id: 12 },
    { type: 'rider_application_resubmitted', entity: 'rider_applications', id: 13 },
  ];

  for (const sample of types) {
    const normalized = normalizeNotification({
      notification_id: sample.id,
      workspace: 'admin',
      type: sample.type,
      title: 'Application update',
      body: 'An applicant submitted documents.',
      related_entity_type: sample.entity,
      related_entity_id: sample.id,
      is_read: false,
      read_at: null,
      created_at: '2026-11-18T22:10:00+08:00',
    });

    assert.equal(normalized.workspace, 'admin');
    assert.equal(normalized.category, 'application');
    assert.equal(normalized.href, '/admin/applications');
  }

  assert.equal(
    getNotificationRoute({ workspace: 'admin', type: 'unknown_admin_event' }),
    '/admin',
  );
});

test('AdminNotificationsContext and AdminTopbar are wired to workspace admin with loading, error, retry, and read actions', () => {
  const contextSrc = fs.readFileSync(path.resolve('src/features/admin/contexts/AdminNotificationsContext.jsx'), 'utf8');
  const topbarSrc = fs.readFileSync(path.resolve('src/features/admin/components/AdminTopbar.jsx'), 'utf8');

  assert.match(contextSrc, /useWorkspaceNotifications\(/);
  assert.match(contextSrc, /workspace:\s*'admin'/);
  assert.match(contextSrc, /Asia\/Manila/);
  assert.doesNotMatch(contextSrc, /getAdminNotifications/);
  assert.doesNotMatch(contextSrc, /hasAdminPermission/);

  assert.match(topbarSrc, /markAsRead\(/);
  assert.match(topbarSrc, /markAllAsRead\(/);
  assert.match(topbarSrc, /getNotificationRoute\(/);
  assert.match(topbarSrc, /Retry/);
  assert.match(topbarSrc, /Loading notifications/);
  assert.match(topbarSrc, /No notifications right now/);
});

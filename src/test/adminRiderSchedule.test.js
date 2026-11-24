import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import apiClient from '../services/apiClient.js';
import riderService from '../services/riderService.js';
import { getNotificationRoute, getNotificationTitle } from '../utils/notificationUtils.js';

test('riderService and adminApiService call real schedule endpoints without mock fallback', async () => {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
  });

  try {
    const adminApiMod = await vite.ssrLoadModule('/src/services/adminApiService.js');
    const viteApiClientMod = await vite.ssrLoadModule('/src/services/apiClient.js');
    const adminApiService = adminApiMod.default;
    const viteApiClient = viteApiClientMod.default;

    const calls = [];
    const originalGet = apiClient.get;
    const originalPost = apiClient.post;
    const originalViteGet = viteApiClient.get;
    const originalVitePost = viteApiClient.post;
    const originalVitePatch = viteApiClient.patch;

    const mockGet = async (url) => {
      calls.push(['GET', url]);
      return { data: { approved_schedule: { available_days: ['mon'] }, items: [], pending_count: 0 } };
    };
    const mockPost = async (url, body) => {
      calls.push(['POST', url, body]);
      return { data: { request: { id: 12, status: 'pending' } } };
    };
    const mockPatch = async (url, body) => {
      calls.push(['PATCH', url, body]);
      return { data: { approved_schedule: { available_days: ['tue'] } } };
    };

    apiClient.get = mockGet;
    apiClient.post = mockPost;
    viteApiClient.get = mockGet;
    viteApiClient.post = mockPost;
    viteApiClient.patch = mockPatch;

    try {
      await riderService.getSchedule();
      await riderService.submitScheduleChangeRequest({ available_days: ['tue'], reason: 'Shift update' });
      await riderService.cancelScheduleChangeRequest(12);
      await adminApiService.getRiderScheduleRequests({ status: 'pending', page: 1 });
      await adminApiService.getRiderSchedule(7);
      await adminApiService.updateRiderSchedule(7, { available_days: ['tue'], reason: 'Admin update' });
      await adminApiService.approveRiderScheduleRequest(12, 'Approved');
      await adminApiService.rejectRiderScheduleRequest(12, 'Slot full');

      assert.deepEqual(
        calls.map(([method, url]) => `${method} ${url}`),
        [
          'GET /rider/schedule',
          'POST /rider/schedule/requests',
          'POST /rider/schedule/requests/12/cancel',
          'GET /admin/rider-schedule-requests?status=pending&page=1',
          'GET /admin/riders/7/schedule',
          'PATCH /admin/riders/7/schedule',
          'POST /admin/rider-schedule-requests/12/approve',
          'POST /admin/rider-schedule-requests/12/reject',
        ],
      );
    } finally {
      apiClient.get = originalGet;
      apiClient.post = originalPost;
      viteApiClient.get = originalViteGet;
      viteApiClient.post = originalVitePost;
      viteApiClient.patch = originalVitePatch;
    }
  } finally {
    await vite.close();
  }
});

test('notificationUtils maps rider schedule notifications for both Rider and Admin workspaces', () => {
  assert.equal(
    getNotificationRoute({
      workspace: 'rider',
      type: 'rider_schedule_request_approved',
      related_entity_type: 'rider_schedule_requests',
      related_entity_id: 5,
    }),
    '/rider/schedule',
  );
  assert.equal(
    getNotificationRoute({
      workspace: 'admin',
      type: 'rider_schedule_request_submitted',
      related_entity_type: 'rider_schedule_requests',
      related_entity_id: 5,
    }),
    '/admin/riders?tab=schedule-requests',
  );
  assert.equal(
    getNotificationTitle({ type: 'rider_schedule_admin_updated' }),
    'Approved schedule updated by Admin',
  );
});

test('mock/localStorage schedule store is removed and Rider/Admin pages use real APIs', () => {
  assert.equal(fs.existsSync(path.resolve('src/utils/riderScheduleStore.js')), false);

  const riderPage = fs.readFileSync(
    path.resolve('src/features/rider/pages/RiderSchedulePage.jsx'),
    'utf8',
  );
  assert.equal(riderPage.includes('localStorage'), false);
  assert.equal(riderPage.includes('riderScheduleStore'), false);
  assert.ok(riderPage.includes('riderService.getSchedule'));
  assert.ok(riderPage.includes('Manage Online Status'));
  assert.ok(riderPage.includes('/rider/go-online'));

  const adminPage = fs.readFileSync(
    path.resolve('src/features/admin/pages/AdminRidersPage.jsx'),
    'utf8',
  );
  assert.equal(adminPage.includes('localStorage'), false);
  assert.equal(adminPage.includes('riderScheduleStore'), false);
  assert.ok(adminPage.includes('adminApiService.getRiderScheduleRequests'));
  assert.ok(adminPage.includes('adminApiService.getRiderSchedule'));
  assert.ok(adminPage.includes('adminApiService.approveRiderScheduleRequest'));
  assert.ok(adminPage.includes('adminApiService.rejectRiderScheduleRequest'));
  assert.ok(adminPage.includes('adminApiService.updateRiderSchedule'));
});

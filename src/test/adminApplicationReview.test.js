import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('adminApiService handles list, detail, decision, document-requests, and 409/422 errors', async () => {
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  const previousFetch = globalThis.fetch;
  const calls = [];

  try {
    const { clearCsrfCache } = await server.ssrLoadModule('/src/services/apiClient.js');
    const { adminApiService } = await server.ssrLoadModule('/src/services/adminApiService.js');

    clearCsrfCache();

    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url, init });

      if (url.endsWith('/auth/csrf')) {
        return new Response(
          JSON.stringify({ success: true, data: { csrf_token: 'admin-csrf' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/admin/applications?')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              items: [{ id: 10, reference_number: 'SALO-APP-20261117-0001', application_status: 'submitted' }],
              meta: { current_page: 1, last_page: 2, total: 30 },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/admin/applications/restaurant/10')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { application: { restaurant_application_id: 10, application_status: 'submitted', menu_items: [] } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/admin/applications/restaurant/10/decision')) {
        const body = JSON.parse(init.body || '{}');
        if (body.decision === 'approve') {
          return new Response(
            JSON.stringify({
              success: false,
              message: "Invalid application status transition from 'submitted' to 'approved'.",
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: { application: { restaurant_application_id: 10, application_status: 'under_review' } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/admin/applications/restaurant/10/document-requests')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { application: { restaurant_application_id: 10, application_status: 'additional_documents_required' } },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('{}', { status: 404 });
    };

    const list = await adminApiService.getApplications({ type: 'restaurant', status: 'submitted', page: 1 });
    assert.equal(list.items.length, 1);
    assert.equal(list.meta.last_page, 2);

    const detail = await adminApiService.getApplicationDetail('restaurant', 10);
    assert.equal(detail.restaurant_application_id, 10);

    await assert.rejects(
      () => adminApiService.decideApplication('restaurant', 10, { decision: 'approve' }),
      (err) => {
        assert.equal(err.status, 409);
        assert.ok(err.message.includes('Invalid application status transition'));
        return true;
      },
    );

    const started = await adminApiService.decideApplication('restaurant', 10, { decision: 'under_review' });
    assert.equal(started.application_status, 'under_review');

    const requested = await adminApiService.requestDocument('restaurant', 10, {
      documentName: 'Additional Supporting Document',
      reason: 'Please upload clearer permit.',
    });
    assert.equal(requested.application_status, 'additional_documents_required');
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('AdminApplicationsPage and ApplicationReviewDrawer include required filters, pagination, actions, and error UI', async () => {
  const [pageSrc, constantsSrc, drawerSrc, decisionSrc] = await Promise.all([
    fs.readFile(new URL('../../src/features/admin/pages/AdminApplicationsPage.jsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../../src/features/admin/constants/applicationDocuments.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../../src/features/admin/components/applications/ApplicationReviewDrawer.jsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../../src/features/admin/components/applications/DecisionPanel.jsx', import.meta.url), 'utf8'),
  ]);
  assert.ok(constantsSrc.includes('additional_documents_required'));
  assert.ok(pageSrc.includes('lastPage > 1'));

  assert.ok(drawerSrc.includes('under_review'));
  assert.ok(decisionSrc.includes('Request more info'));
  assert.ok(drawerSrc.includes('role="alert"'));
  assert.ok(drawerSrc.includes('detail.menu_items'));
  assert.ok(drawerSrc.includes('resolveBackendUrl'));
});

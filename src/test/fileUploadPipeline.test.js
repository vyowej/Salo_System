import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('applicationService sends FormData without manual Content-Type and surfaces backend validation errors', async () => {
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
    const { applicationService, resolveBackendUrl } = await server.ssrLoadModule('/src/services/applicationService.js');
    const { resolveUploadableFile } = await server.ssrLoadModule('/src/services/formDataHelper.js');

    clearCsrfCache();

    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url, init });

      if (url.endsWith('/auth/csrf')) {
        return new Response(
          JSON.stringify({ success: true, data: { csrf_token: 'test-csrf' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/restaurant/applications')) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'The given data was invalid.',
            errors: {
              logo_image: ['The uploaded image could not be decoded safely.'],
            },
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/restaurant/applications/5/documents')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { application: { restaurant_application_id: 5, documents: [{ document_id: 9 }] } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('{}', { status: 404 });
    };

    const fd = new FormData();
    const file = new File(['hello'], 'logo.png', { type: 'image/png' });
    fd.append('logo_image', file);

    await assert.rejects(
      () => applicationService.submitRestaurantApplication(fd),
      (err) => {
        assert.equal(err.status, 422);
        assert.deepEqual(err.errors.logo_image, ['The uploaded image could not be decoded safely.']);
        return true;
      },
    );

    const submitCall = calls.find((c) => c.url.endsWith('/restaurant/applications'));
    assert.ok(submitCall);
    assert.equal(submitCall.init.credentials, 'include');
    assert.ok(submitCall.init.body instanceof FormData);
    assert.equal(submitCall.init.headers['Content-Type'], undefined);

    const docApp = await applicationService.uploadRestaurantDocument(5, {
      documentCode: 'requested_document',
      requestId: 12,
      file,
    });
    assert.equal(docApp.restaurant_application_id, 5);

    const uploadCall = calls.find((c) => c.url.endsWith('/restaurant/applications/5/documents'));
    assert.ok(uploadCall);
    assert.ok(uploadCall.init.body instanceof FormData);
    assert.equal(uploadCall.init.headers['Content-Type'], undefined);

    assert.equal(
      resolveBackendUrl('/api/applications/documents/9/file'),
      'http://localhost:8000/api/applications/documents/9/file',
    );
    assert.equal(
      resolveBackendUrl('http://localhost:8000/storage/restaurants/1/logo.png'),
      'http://localhost:8000/storage/restaurants/1/logo.png',
    );

    const resolved = resolveUploadableFile({ file, name: 'logo.png' });
    assert.equal(resolved, file);
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('upload UI components enforce 5 MB limit and ApplicationStatus has no stubbed upload error', async () => {
  const filesToCheck = [
    'src/pages/BusinessApplication/components/DocumentUploadCard.jsx',
    'src/pages/RiderApplication/components/RiderDocumentUploadCard.jsx',
    'src/pages/BusinessApplication/components/ApplicationStatus.jsx',
  ];

  for (const relPath of filesToCheck) {
    const content = await fs.readFile(new URL(`../../${relPath}`, import.meta.url), 'utf8');
    assert.equal(content.includes('10 MB'), false, `${relPath} should not advertise 10 MB`);
    assert.equal(content.includes('not available yet'), false, `${relPath} should not contain stubbed upload message`);
  }

  const configStep = await fs.readFile(
    new URL('../../src/pages/BusinessApplication/components/RestaurantConfigurationStep.jsx', import.meta.url),
    'utf8',
  );
  assert.ok(configStep.includes('photoFile: file'));
  assert.ok(configStep.includes('errors.logo_image'));
  assert.ok(configStep.includes('errors.cover_image'));
  assert.ok(configStep.includes('MAX_INITIAL_MENU_ITEMS = 8'));
});

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

test('apiClient uses credentials include, initializes CSRF, retries 419 once, and authService normalizes users', async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  const previousFetch = globalThis.fetch;
  const calls = [];

  try {
    const { default: apiClient, clearCsrfCache } = await server.ssrLoadModule('/src/services/apiClient.js');
    const { authService, getDefaultWorkspace } = await server.ssrLoadModule('/src/services/authService.js');

    clearCsrfCache();

    let loginAttempts = 0;
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url, init });

      if (url.endsWith('/auth/csrf')) {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'CSRF token issued.',
            data: { csrf_token: `csrf-${calls.length}` },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/auth/login')) {
        loginAttempts += 1;
        if (loginAttempts === 1) {
          return new Response(
            JSON.stringify({ success: false, message: 'CSRF token mismatch.' }),
            { status: 419, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Logged in.',
            data: {
              user: {
                user_id: 42,
                username: 'maria_s',
                first_name: 'Maria',
                middle_initial: 'L',
                last_name: 'Santos',
                email: 'maria@example.com',
                roles: ['customer', 'owner'],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/auth/me')) {
        return new Response(
          JSON.stringify({ success: false, message: 'Unauthenticated.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('{}', { status: 404 });
    };

    const loginResult = await authService.login({
      email: 'maria@example.com',
      password: 'SecretPass123!',
    });

    assert.equal(loginResult.user.user_id, 42);
    assert.equal(loginResult.user.name, 'Maria L. Santos');
    assert.equal(loginResult.user.role, 'owner');
    assert.equal(loginAttempts, 2);
    assert.equal(calls.filter((c) => c.url.endsWith('/auth/csrf')).length, 2);
    assert.ok(calls.every((c) => c.init.credentials === 'include'));

    const unauthenticatedUser = await authService.getCurrentUser();
    assert.equal(unauthenticatedUser, null);

    // Concurrent in-flight getCurrentUser calls share a single /auth/me request
    const beforeMeCalls = calls.filter((c) => c.url.endsWith('/auth/me')).length;
    const [meA, meB] = await Promise.all([
      authService.getCurrentUser(),
      authService.getCurrentUser(),
    ]);
    const afterMeCalls = calls.filter((c) => c.url.endsWith('/auth/me')).length;
    assert.equal(afterMeCalls - beforeMeCalls, 1);
    assert.equal(meA, null);
    assert.equal(meB, null);

    // Login / logout / register clear any in-flight getCurrentUser promise so stale user is never cached
    let resolveDelayedMe = null;
    globalThis.fetch = async (url) => {
      calls.push({ url, init: { credentials: 'include' } });
      if (url.endsWith('/auth/csrf')) {
        return new Response(
          JSON.stringify({ success: true, data: { csrf_token: 'csrf-tok' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/auth/me')) {
        if (!resolveDelayedMe) {
          return new Promise((resolve) => {
            resolveDelayedMe = () =>
              resolve(
                new Response(
                  JSON.stringify({
                    success: true,
                    data: { user: { user_id: 1, username: 'old_user', roles: ['customer'] } },
                  }),
                  { status: 200, headers: { 'Content-Type': 'application/json' } },
                ),
              );
          });
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: { user: { user_id: 99, username: 'fresh_user', roles: ['customer'] } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/auth/logout')) {
        return new Response(
          JSON.stringify({ success: true, data: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    };

    const staleInFlight = authService.getCurrentUser();
    await authService.logout();
    const freshAfterLogout = await authService.getCurrentUser();
    assert.equal(freshAfterLogout.user_id, 99);
    resolveDelayedMe();
    await staleInFlight;

    assert.equal(getDefaultWorkspace(['customer', 'owner', 'admin']), 'admin');
    assert.equal(getDefaultWorkspace(['customer', 'staff', 'rider']), 'rider');
    assert.equal(getDefaultWorkspace(['customer', 'staff']), 'staff');
    assert.equal(getDefaultWorkspace(['customer']), 'customer');
    assert.ok(apiClient.getBaseUrl().endsWith('/api'));
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

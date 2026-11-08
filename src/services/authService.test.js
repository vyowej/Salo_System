import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

test('demo and legacy demo tokens skip current-user API while real tokens keep API refresh', async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  });

  try {
    const { default: apiClient } = await server.ssrLoadModule('/src/services/apiClient.js');
    const { authService, DEMO_AUTH_ENABLED } = await server.ssrLoadModule('/src/services/authService.js');
    const originalGet = apiClient.get;
    let requestCount = 0;
    apiClient.get = async () => {
      requestCount += 1;
      return { user: { id: 8, email: 'backend@salo.ph' } };
    };

    try {
      assert.equal(DEMO_AUTH_ENABLED, true);
      const demoUser = { id: 2, email: 'owner@salo.ph', role: 'owner' };
      values.set('salo_user', JSON.stringify(demoUser));
      for (const token of ['salo_demo_token_owner_123', 'salo_token_legacy_123']) {
        values.set('salo_token', token);
        assert.deepEqual(await authService.getCurrentUser(), demoUser);
      }
      assert.equal(requestCount, 0);

      values.set('salo_token', 'backend-access-token');
      assert.deepEqual(await authService.getCurrentUser(), { id: 8, email: 'backend@salo.ph' });
      assert.equal(requestCount, 1);
    } finally {
      apiClient.get = originalGet;
    }
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
    await server.close();
  }
});

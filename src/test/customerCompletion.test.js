import test from 'node:test';
import assert from 'node:assert/strict';
import customerService from '../services/customerService.js';

function createMockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? 'application/json' : null;
      },
    },
    async json() {
      return body;
    },
  };
}

test('customerService favorites APIs call GET/PUT/DELETE endpoints and handle inactive favorites', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const calls = [];

  globalThis.document = { cookie: 'XSRF-TOKEN=test-csrf-token' };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    if (options.method === 'PUT') {
      return createMockResponse(200, { success: true, data: { restaurant_id: 10, favorited: true } });
    }
    if (options.method === 'DELETE') {
      return createMockResponse(200, { success: true, data: { restaurant_id: 10, favorited: false } });
    }
    return createMockResponse(200, {
      success: true,
      data: {
        favorites: [
          {
            restaurant_id: 10,
            restaurant_name: 'Salo Grill',
            is_available: false,
            restaurant_status: 'suspended',
          },
        ],
        favorite_ids: [10],
      },
    });
  };

  try {
    const added = await customerService.addFavorite(10);
    assert.equal(added.favorited, true);

    const list = await customerService.fetchFavorites();
    assert.equal(list.favorites.length, 1);
    assert.equal(list.favorites[0].isAvailable, false);
    assert.deepEqual(list.favoriteIds, ['10']);

    const removed = await customerService.removeFavorite(10);
    assert.equal(removed.favorited, false);

    assert.equal(calls[0].method, 'PUT');
    assert.match(calls[0].url, /\/customer\/favorites\/10$/);
    assert.equal(calls[1].method, 'GET');
    assert.match(calls[1].url, /\/customer\/favorites$/);
    assert.equal(calls[2].method, 'DELETE');
    assert.match(calls[2].url, /\/customer\/favorites\/10$/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
  }
});

test('customerService.initiateReservationDeposit calls POST /customer/reservations/{id}/deposit/initiate', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const calls = [];

  globalThis.document = { cookie: 'XSRF-TOKEN=test-csrf-token' };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body || null });
    return createMockResponse(201, {
      success: true,
      data: {
        payment: {
          payment_id: 99,
          payment_status: 'pending',
          amount: 250,
        },
      },
    });
  };

  try {
    const payment = await customerService.initiateReservationDeposit(12, {
      paymentMethod: 'gcash',
      idempotencyKey: 'resdep-12-abcdef',
    });
    assert.equal(payment.payment_id, 99);
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].url, /\/customer\/reservations\/12\/deposit\/initiate$/);
    assert.deepEqual(JSON.parse(calls[0].body), {
      payment_method: 'gcash',
      idempotency_key: 'resdep-12-abcdef',
    });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
  }
});

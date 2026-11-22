import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('ownerService calls restaurant table endpoints, normalizes tables, and propagates 422/409 errors', async () => {
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
    const { ownerService, normalizeTable } = await server.ssrLoadModule('/src/services/ownerService.js');

    clearCsrfCache();

    globalThis.fetch = async (url, init = {}) => {
      calls.push({
        url,
        method: init.method || 'GET',
        body: init.body ? JSON.parse(init.body) : null,
      });

      if (url.endsWith('/auth/csrf')) {
        return new Response(JSON.stringify({ success: true, data: { csrf_token: 'tables-csrf' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/restaurant/tables') && (init.method || 'GET') === 'GET') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              items: [
                {
                  table_id: 12,
                  restaurant_id: 3,
                  table_name: 'T-01',
                  seating_capacity: 4,
                  min_party_size: 2,
                  dining_area: 'Terrace',
                  description: 'Sunset corner',
                  is_active: true,
                  table_status: 'reserved',
                  reservations_count: 1,
                  next_reservation: {
                    reservation_id: 88,
                    reservation_reference: 'SALO-RES-20261123-AA11',
                    reservation_start: '2026-11-23T19:00:00+08:00',
                    number_of_guests: 4,
                    status: 'confirmed',
                  },
                  upcoming_reservations_count: 2,
                },
              ],
              summary: {
                total_tables: 5,
                active_tables: 4,
                archived_tables: 1,
                total_seats: 20,
                available_now: 3,
                reserved_count: 1,
                occupied_count: 0,
              },
              dining_areas: ['Indoor', 'Terrace'],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/restaurant/tables') && init.method === 'POST') {
        const body = JSON.parse(init.body);
        if (body.table_name === 'DUPLICATE') {
          return new Response(
            JSON.stringify({
              success: false,
              message: 'The given data was invalid.',
              errors: { table_name: ['A table with this name already exists for your restaurant.'] },
            }),
            { status: 422, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              table: {
                table_id: 15,
                restaurant_id: 3,
                table_name: body.table_name,
                seating_capacity: body.seating_capacity,
                min_party_size: body.min_party_size,
                dining_area: body.dining_area,
                description: body.description,
                is_active: true,
                table_status: 'available',
                reservations_count: 0,
                next_reservation: null,
                upcoming_reservations_count: 0,
              },
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/restaurant/tables/12') && init.method === 'PATCH') {
        const body = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              table: {
                table_id: 12,
                restaurant_id: 3,
                table_name: body.table_name || 'T-01',
                seating_capacity: body.seating_capacity || 4,
                min_party_size: body.min_party_size || 2,
                dining_area: 'Terrace',
                description: 'Updated description',
                is_active: true,
                table_status: 'available',
                reservations_count: 0,
                next_reservation: null,
                upcoming_reservations_count: 0,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/restaurant/tables/99/archive') && init.method === 'POST') {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Cannot archive table "T-99": 2 upcoming active reservation(s) are assigned to it.',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/restaurant/tables/12/archive') && init.method === 'POST') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              table: {
                table_id: 12,
                restaurant_id: 3,
                table_name: 'T-01',
                seating_capacity: 4,
                min_party_size: 2,
                is_active: false,
                table_status: 'archived',
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/restaurant/tables/12/reactivate') && init.method === 'POST') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              table: {
                table_id: 12,
                restaurant_id: 3,
                table_name: 'T-01',
                seating_capacity: 4,
                min_party_size: 2,
                is_active: true,
                table_status: 'available',
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ success: false, message: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const result = await ownerService.getTables(3, '2026-11-23', {
      search: 'T-01',
      dining_area: 'Terrace',
      status: 'active',
    });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, 12);
    assert.equal(result.items[0].tableName, 'T-01');
    assert.equal(result.items[0].capacity, 4);
    assert.equal(result.items[0].minPartySize, 2);
    assert.equal(result.items[0].diningArea, 'Terrace');
    assert.equal(result.items[0].status, 'reserved');
    assert.equal(result.items[0].nextReservation.reservationReference, 'SALO-RES-20261123-AA11');
    assert.equal(result.summary.totalTables, 5);
    assert.equal(result.summary.totalSeats, 20);
    assert.equal(result.summary.availableNow, 3);
    assert.deepEqual(result.diningAreas, ['Indoor', 'Terrace']);

    const created = await ownerService.addTable(3, {
      tableName: 'T-05',
      capacity: 6,
      minPartySize: 3,
      diningArea: 'Indoor',
      description: 'Center table',
    });
    assert.equal(created.id, 15);
    assert.equal(created.tableName, 'T-05');
    assert.equal(created.capacity, 6);

    const updated = await ownerService.updateTable(3, 12, { seating_capacity: 6 });
    assert.equal(updated.capacity, 6);

    const archived = await ownerService.archiveTable(3, 12);
    assert.equal(archived.isActive, false);
    assert.equal(archived.status, 'archived');

    const reactivated = await ownerService.reactivateTable(3, 12);
    assert.equal(reactivated.isActive, true);
    assert.equal(reactivated.status, 'available');

    // 422 field error propagation
    await assert.rejects(
      () => ownerService.addTable(3, { table_name: 'DUPLICATE', seating_capacity: 4 }),
      (err) => err.status === 422 && Array.isArray(err.errors?.table_name),
    );

    // 409 conflict error propagation
    await assert.rejects(
      () => ownerService.archiveTable(3, 99),
      (err) => err.status === 409 && err.message.includes('2 upcoming active reservation'),
    );

    assert.equal(normalizeTable(null), null);
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('OwnerTablesPage and OwnerDashboard are wired to real async table APIs and CSS classes', async () => {
  const [tablesPageSrc, dashboardSrc] = await Promise.all([
    fs.readFile(new URL('../features/restaurant/pages/OwnerTablesPage.jsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../features/restaurant/pages/OwnerDashboard.jsx', import.meta.url), 'utf8'),
  ]);

  assert.equal(tablesPageSrc.includes('not available yet'), false);
  assert.ok(tablesPageSrc.includes('owner-tables-page'));
  assert.ok(tablesPageSrc.includes('owner-tables-stats'));
  assert.ok(tablesPageSrc.includes('owner-tables-toolbar'));
  assert.ok(tablesPageSrc.includes('owner-tables-grid'));
  assert.ok(tablesPageSrc.includes('owner-table-card'));
  assert.ok(tablesPageSrc.includes('owner-table-form'));
  assert.ok(tablesPageSrc.includes('owner-archive-dialog'));
  assert.ok(tablesPageSrc.includes("access.canAccess(['tables.add'])"));
  assert.ok(tablesPageSrc.includes("access.canAccess(['tables.edit'])"));
  assert.ok(tablesPageSrc.includes("access.canAccess(['tables.manageAvailability'])"));
  assert.ok(tablesPageSrc.includes('ownerService.getTables'));
  assert.ok(tablesPageSrc.includes('ownerService.addTable'));
  assert.ok(tablesPageSrc.includes('ownerService.updateTable'));
  assert.ok(tablesPageSrc.includes('ownerService.archiveTable'));
  assert.ok(tablesPageSrc.includes('ownerService.reactivateTable'));

  assert.ok(dashboardSrc.includes('await ownerService.getTables'));
});

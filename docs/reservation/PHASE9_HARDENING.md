# Phase 9 — Security, Concurrency & Hardening Audit

## 1. Route & Middleware Inventory (32 Routes)

| Method | URI | Controller@Method | Middleware | Role / Permission | Throttle |
|---|---|---|---|---|---|
| GET | `/api/restaurants/{id}/reservation-info` | `ReservationAvailabilityController@info` | `api, throttle:60,1` | Public (`whereNumber('id')`) | `60,1` |
| GET | `/api/restaurants/{id}/reservation-availability/month` | `ReservationAvailabilityController@month` | `api, throttle:60,1` | Public (`whereNumber('id')`) | `60,1` |
| GET | `/api/restaurants/{id}/reservation-availability` | `ReservationAvailabilityController@day` | `api, throttle:60,1` | Public (`whereNumber('id')`) | `60,1` |
| GET | `/api/restaurants/{id}/reservation-availability/tables` | `ReservationAvailabilityController@tables` | `api, throttle:60,1` | Public (`whereNumber('id')`) | `60,1` |
| POST | `/api/customer/reservations` | `CustomerReservationController@store` | `api, auth, throttle:20,1` | Authenticated active user | `20,1` |
| GET | `/api/customer/reservations` | `CustomerReservationController@index` | `api, auth` | Authenticated active user | Default API |
| GET | `/api/customer/reservations/{id}` | `CustomerReservationController@show` | `api, auth` | Owner of reservation (`whereNumber('id')`) | Default API |
| POST | `/api/customer/reservations/{id}/cancel` | `CustomerReservationController@cancel` | `api, auth, throttle:30,1` | Owner of reservation (`whereNumber('id')`) | `30,1` |
| GET | `/api/restaurant/settings` | `OwnerProfileController@settings` | `api, auth, role:owner` | Owner only | Default API |
| PATCH | `/api/restaurant/settings` | `OwnerProfileController@updateSettings` | `api, auth, role:owner, throttle:30,1` | Owner only | `30,1` |
| GET | `/api/restaurant/tables` | `OwnerTableController@index` | `api, auth, role:owner,staff` | `tables.view` | Default API |
| POST | `/api/restaurant/tables` | `OwnerTableController@store` | `api, auth, role:owner,staff, throttle:60,1` | `tables.add` | `60,1` |
| GET | `/api/restaurant/tables/{id}` | `OwnerTableController@show` | `api, auth, role:owner,staff` | `tables.view` (`whereNumber('id')`) | Default API |
| PATCH | `/api/restaurant/tables/{id}` | `OwnerTableController@update` | `api, auth, role:owner,staff, throttle:60,1` | `tables.edit` (`whereNumber('id')`) | `60,1` |
| POST | `/api/restaurant/tables/{id}/archive` | `OwnerTableController@archive` | `api, auth, role:owner,staff, throttle:60,1` | `tables.manageAvailability` (`whereNumber('id')`) | `60,1` |
| POST | `/api/restaurant/tables/{id}/reactivate` | `OwnerTableController@reactivate` | `api, auth, role:owner,staff, throttle:60,1` | `tables.manageAvailability` (`whereNumber('id')`) | `60,1` |
| GET | `/api/restaurant/reservations` | `OwnerReservationController@index` | `api, auth, role:owner,staff` | `reservations.view` | Default API |
| GET | `/api/restaurant/reservations/calendar` | `OwnerReservationController@calendar` | `api, auth, role:owner,staff` | `reservations.view` | Default API |
| GET | `/api/restaurant/reservations/{id}` | `OwnerReservationController@show` | `api, auth, role:owner,staff` | `reservations.view` (`whereNumber('id')`) | Default API |
| POST | `/api/restaurant/reservations/{id}/approve` | `OwnerReservationController@approve` | `api, auth, role:owner,staff, throttle:60,1` | `reservations.approve` (`whereNumber('id')`) | `60,1` |
| POST | `/api/restaurant/reservations/{id}/reject` | `OwnerReservationController@reject` | `api, auth, role:owner,staff, throttle:60,1` | `reservations.reject` (`whereNumber('id')`) | `60,1` |
| POST | `/api/restaurant/reservations/{id}/confirm-deposit` | `OwnerReservationController@confirmDeposit` | `api, auth, role:owner,staff, throttle:60,1` | `reservations.updateStatus` (`whereNumber('id')`) | `60,1` |
| POST | `/api/restaurant/reservations/{id}/deposit` | `OwnerReservationController@deposit` | `api, auth, role:owner,staff, throttle:60,1` | `reservations.updateStatus` (`whereNumber('id')`) | `60,1` |
| POST | `/api/restaurant/reservations/{id}/arrived` | `OwnerReservationController@arrived` | `api, auth, role:owner,staff, throttle:60,1` | `reservations.manageArrival` (`whereNumber('id')`) | `60,1` |
| POST | `/api/restaurant/reservations/{id}/seat` | `OwnerReservationController@seat` | `api, auth, role:owner,staff, throttle:60,1` | `reservations.updateStatus` (`whereNumber('id')`) | `60,1` |
| POST | `/api/restaurant/reservations/{id}/complete` | `OwnerReservationController@complete` | `api, auth, role:owner,staff, throttle:60,1` | `reservations.updateStatus` (`whereNumber('id')`) | `60,1` |
| POST | `/api/restaurant/reservations/{id}/no-show` | `OwnerReservationController@noShow` | `api, auth, role:owner,staff, throttle:60,1` | `reservations.manageArrival` (`whereNumber('id')`) | `60,1` |
| POST | `/api/restaurant/reservations/{id}/cancel` | `OwnerReservationController@cancel` | `api, auth, role:owner,staff, throttle:30,1` | `reservations.updateStatus` (`whereNumber('id')`) | `30,1` |
| PATCH | `/api/restaurant/reservations/{id}/table` | `OwnerReservationController@assignTable` | `api, auth, role:owner,staff, throttle:60,1` | `reservations.assignTables` (`whereNumber('id')`) | `60,1` |
| GET | `/api/admin/reservations` | `AdminReservationController@index` | `api, auth, role:admin` | Admin | Default API |
| GET | `/api/admin/reservations/stats` | `AdminReservationController@stats` | `api, auth, role:admin` | Admin | Default API |
| GET | `/api/admin/reservations/{id}` | `AdminReservationController@show` | `api, auth, role:admin` | Admin (`whereNumber('id')`) | Default API |

---

## 2. Findings Table

| ID | Severity | Area | Description | Evidence | Fix | Test | Status |
|---|---|---|---|---|---|---|---|
| F-01 | Critical | Concurrency | Plain `SELECT`s inside `DB::transaction()` before `lockForUpdate()` created a `REPEATABLE READ` snapshot before locking candidate tables | `CustomerReservationService.php:135-160`, `ReservationAvailabilityService.php:671` | Moved non-locking reads outside transaction; locked candidate `restaurant_tables` (`table_id ASC`) as first statement inside `DB::transaction`; passed `pendingExpiryMinutes` into `getAvailableTables()` | `ReservationConcurrencyLockTest`, `ReservationSecurityTest` | Fixed |
| F-02 | High | Concurrency | `assignTable` locked `reservations` before `restaurant_tables`, opposite of `create()` (`tables` → `reservations`), risking deadlocks | `OwnerReservationService.php:1016,1056` | Reversed to lock `restaurant_tables` (`table_id ASC`) first, then `reservations`; added 3-attempt deadlock retry (`409 TRY_AGAIN`) | `ReservationSecurityTest` | Fixed |
| F-03 | High | Idempotency | Replaying an `idempotency_key` with a different `restaurant_id`, `start`, or `party_size` silently returned the original booking | `CustomerReservationService.php:57-64` | Compare `(restaurant_id, reservation_start, number_of_guests)` and throw `409 IDEMPOTENCY_KEY_REUSED` on mismatch | `ReservationSecurityTest::test_idempotency_key_reuse_with_different_payload_is_rejected` | Fixed |
| F-04 | Medium | Privacy | Customer `ReservationFormatter::format()` exposed `no_show_marked_by` and `changed_by_user_id` | `ReservationFormatter.php:160,350` | Added `$includeInternalActorIds = false` for customer payloads (`true` for owner/admin) | `ReservationSecurityTest::test_customer_payload_omits_internal_actor_ids` | Fixed |
| F-05 | Medium | Rate Limiting | Customer cancel, owner reservation/table mutations, and owner settings PATCH lacked explicit route throttles | `backend/routes/api.php:179,198,260-280` | Added `throttle:30,1` on cancel/settings PATCH and `throttle:60,1` on owner table/reservation mutations | `ReservationSecurityTest::test_mutation_throttles_are_registered` | Fixed |
| F-06 | Medium | Input Validation | `ListOwnerReservationsRequest` lacked `366`-day cap and `after_or_equal:date_from`; `StoreCustomerReservationRequest` allowed control chars and unvalidated `contact_phone` format | `ListOwnerReservationsRequest.php`, `StoreCustomerReservationRequest.php` | Added `366`-day cap + control-char stripping + phone regex | `ReservationSecurityTest::test_input_bounds_and_control_characters` | Fixed |
| F-07 | Medium | Availability DoS | `generateSlots()` had no per-day slot cap or 24h period cap against corrupt `operating_hours` | `ReservationAvailabilityService.php:385-405` | Added `96` slots/day cap, `24h` period cap, and start-time deduplication | `ReservationSecurityTest::test_corrupt_operating_hours_cannot_hang_slot_generation` | Fixed |
| F-08 | Low | Frontend XSS/Links | `OwnerReservationsPage.jsx` interpolated `guestPhone`/`customerEmail` directly into `tel:`/`mailto:` hrefs | `OwnerReservationsPage.jsx:1485,1492` | Added `sanitizeTelHref()` and `sanitizeMailtoHref()` | `src/test/reservationSecurity.test.js` | Fixed |
| F-09 | Low | Lifecycle | When a restaurant becomes inactive/suspended/unpublished, owner actions are blocked by `WorkspaceAccessResolver`; customers can still view/cancel own reservations; admin console is read-only | `WorkspaceAccessResolver` | Documented operational handling (Accepted Risk: admin cancel intentionally omitted to match Orders) | `ReservationSecurityTest` | Accepted-risk |

---

## 3. Lock Protocol (Deadlock-Safe)
1. **Pre-transaction validation**: Restaurant lookup, settings load, booking window check, and idempotency pre-check run **before** `DB::transaction()`.
2. **Table lock first (`table_id ASC`)**: Every booking/approve/seat/reassign transaction acquires `FOR UPDATE` on candidate `restaurant_tables` ordered by `table_id ASC` as its **first** query.
3. **Reservation lock second**: Lock customer's overlapping/pending rows (in `create`) or the target `reservations` row (in `approve`/`seat`/`assignTable`), followed by `getAvailableTables(..., lockForUpdate: true)` which locks overlapping blocking reservations `FOR UPDATE`.
4. **Deadlock retry**: Transactions run with `DB::transaction($cb, 3)`; if MySQL raises SQLSTATE `40001` / error `1205` or `1213` after 3 attempts, a `409 TRY_AGAIN` `ReservationBookingException` is returned.

---

## 4. Two-Session Concurrency Verification
Run `docs/reservation/concurrency-check.ps1` against a running local dev server (`php artisan serve`):
```powershell
.\docs\reservation\concurrency-check.ps1 -BaseUrl "http://127.0.0.1:8000" -RestaurantId 1 -Date "2026-11-28" -Time "18:00" -Rounds 3
```
Also covered by `ReservationConcurrencyLockTest` (two independent PDO connections on `salo_test` without `DatabaseTransactions`).

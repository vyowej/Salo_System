# SALO Backend Architecture Notes (Round 3 Cleanup)

## Shared Support Helpers (`backend/app/Support/`)

- `App\Support\SqlLike::escape(string $value): string`
  - Escapes SQL `LIKE` wildcards (`\`, `%`, `_`).
  - Used by `AdminOrderService` and `RestaurantService` (replacing duplicate inline/private `escapeLike` logic).
- `App\Support\Money`
  - `toCents(string $decimal): int` — parses decimal money strings into integer centavos (clamps negative strings to `0`; used by `CheckoutService`).
  - `parseStrictCents(string $decimal): int` — strictly parses non-negative decimal money strings matching `/^\d+(?:\.\d{1,2})?$/` or returns `-1` (used by `RiderDeliveryService`).
  - `fromCents(int $cents): string` — formats integer centavos into 2-decimal strings (used by `CheckoutService`).
- `App\Support\WorkspaceAccessResolver`
  - `requireActiveOwnedRestaurant(User $user, ?int $restaurantId = null)` — used by `OwnerProfileService` (and via it by `OwnerMenuService` and `StaffInvitationService` where applicable).
  - `requireActiveAuthorizedRestaurantForOrders(User $user, ?int $restaurantId = null)` — used by `RestaurantOrderService`.
  - `requireActiveAuthorizedRestaurantForInventory(User $user, ?int $restaurantId = null)` — used by `OwnerInventoryService`.
  - `requireActiveRider(User $user, ...)` — used by `RiderDeliveryService` and `RiderService::updateAvailability()`.

## Orders Support (`backend/app/Features/Orders/Support/`)

- `App\Features\Orders\Support\OrderPaymentSnapshotLoader::loadByOrderIds(array $orderIds)`
  - Batch-loads the latest `order_payment` allocation snapshot per `order_id` (`WHERE pa.order_id IN (...) ORDER BY p.payment_id DESC`).
  - Replaces duplicate `loadPaymentsByOrder()` methods in `CustomerOrderService`, `RestaurantOrderService`, and the non-filtered batch loader in `AdminOrderService`.

## Restaurants FormRequests (`backend/app/Features/Restaurants/Requests/`)

Inline `$request->validate(...)` rules from `OwnerInventoryController`, `OwnerMenuController`, `OwnerProfileController`, `StaffInvitationController`, and `RestaurantApplicationController::uploadDocument` were extracted into dedicated `FormRequest` classes (`authorize(): bool` returns `true`, keeping authorization in middleware and services):

- `ShowOwnerInventoryConfigRequest`
- `UpdateOwnerInventoryConfigRequest`
- `UpdateOwnerProfileRequest`
- `UpdateOwnerMediaRequest`
- `UpdateOwnerAcceptingStatusRequest`
- `UpdateOwnerOperatingHoursRequest`
- `StoreMenuCategoryRequest`
- `UpdateMenuCategoryRequest`
- `ReorderMenuCategoriesRequest`
- `StoreMenuItemRequest`
- `UpdateMenuItemRequest`
- `UpdateMenuItemAvailabilityRequest`
- `StoreStaffInvitationRequest`
- `UploadRestaurantApplicationDocumentRequest`

## Admin FormRequests (`backend/app/Features/Admin/Requests/`)

Inline `$request->validate(...)` rules from `AdminManagementController`, `AdminApplicationController`, and `AdminOrderController` were extracted into dedicated `FormRequest` classes (`authorize(): bool` returns `true`, keeping authorization in middleware and services; application-type routes preserve `404` validation in `prepareForValidation()`):

- `CreateAdminUserRequest`
- `UpdateAdminUserRequest`
- `UpdateAdminRestaurantStatusRequest`
- `UpdateAdminRiderStatusRequest`
- `ReviewApplicationDocumentRequest`
- `RequestApplicationDocumentRequest`
- `DecideApplicationRequest`
- `ListAdminOrdersRequest`

## AdminApplicationService (`listApplications` Decomposition)

`AdminApplicationService::listApplications()` was decomposed into focused private helpers while preserving exact SQL queries, ordering, pagination metadata, and the Round 2 batch document-count query (`loadApplicationDocumentCounts()`):

- `buildRiderApplicationsQuery(string $search)` / `buildRestaurantApplicationsQuery(string $search)`
- `applyCommonApplicationFilters(Builder $query, string $status, string $dateRange)`
- `loadApplicationDocumentCounts(string $foreignKey, array $applicationIds)`
- `formatRiderApplicationRow(object $row, ?object $docCounts)` / `formatRestaurantApplicationRow(object $row, ?object $docCounts)`

## AdminManagementService (Listing Methods Cleanup)

The 4 paginated listing methods (`listUsers`, `listRestaurants`, `listRiders`, `listAuditLogs`) in `AdminManagementService` share cohesive private helpers while preserving their distinct defaults, sort orders, and the Round 2 batch primary-owner query (`attachPrimaryOwnersToRestaurants()`):

- `attachPrimaryOwnersToRestaurants(array $items)`
- `applyLikeSearch(Builder $query, string $search, array $columns)`
- `resolvePerPage(array $filters, int $default = 15)` / `resolveSortDirection(array $filters)`
- `formatPaginatedResult(LengthAwarePaginator $paginator, ?array $items = null)`

## AdminServiceAreaService (`getLocationsOverview` Decomposition)

`AdminServiceAreaService::getLocationsOverview()` was decomposed into cohesive private helpers while preserving exact SQL limits, privacy filtering, and the Round 2 batch `rider_locations` lookup (`loadLatestGpsByRider()`):

- `loadOverviewRestaurants()`
- `loadOverviewActiveDeliveries()`
- `loadLatestGpsByRider(array $activeRiderIds)`
- `formatOverviewDeliveryRow(object $row, ?object $latestGps)`

## AdminOrderService (`listOrders` Decomposition)

`AdminOrderService::listOrders()` was decomposed into cohesive private helpers while preserving exact SQL semantics, `Asia/Manila` next-day-exclusive `date_to` filtering, `COUNT(*)` before joining `deliveries`, and `OrderPaymentSnapshotLoader::loadByOrderIds()` batching:

- `buildOrdersBaseQuery(array $filters, string $paymentStatus, bool $hasPaymentStatusFilter)`
- `applyDateRangeFilters(Builder $query, string $dateFrom, string $dateTo)`
- `selectOrderColumns(bool $hasPaymentStatusFilter)`
- `loadOrderItemCounts(array $orderIds)`
- `formatAdminOrderRow(object $row, ?object $counts, ?object $latestPayment, bool $hasPaymentStatusFilter)`

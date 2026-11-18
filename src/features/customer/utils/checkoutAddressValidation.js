/**
 * Helpers for consistent delivery address selection, validation, and checkout
 * payload construction across CartContext and CheckoutPage.
 *
 * Note on IDs:
 * - Saved address items from /api/customer/addresses use `id` (user_addresses.user_address_id)
 *   as the dropdown/selection identifier, and `addressId` (addresses.address_id) as the
 *   foreign key expected by POST /api/customer/checkout (`groups.*.address_id`).
 */

/**
 * Extract the backend `addresses.address_id` integer used by the checkout endpoint.
 *
 * @param {object|null|undefined} address
 * @returns {number|null}
 */
export function getCheckoutAddressId(address) {
  if (!address || typeof address !== 'object') return null;
  const raw = address.addressId ?? address.address_id ?? address.id;
  const num = Number(raw);
  return Number.isInteger(num) && num > 0 ? num : null;
}

/**
 * Match a saved address by its UI selection ID (`user_address_id`), normalizing
 * string vs number types from HTML <select> values.
 *
 * @param {Array<object>} addresses
 * @param {string|number|null|undefined} selectedId
 * @returns {object|null}
 */
export function findAddressBySelectionId(addresses, selectedId) {
  if (!Array.isArray(addresses) || selectedId === null || selectedId === undefined || selectedId === '') {
    return null;
  }
  const target = String(selectedId);
  return addresses.find((addr) => addr && addr.id !== null && addr.id !== undefined && String(addr.id) === target) || null;
}

/**
 * Validate a single restaurant sub-order's delivery address against the user's
 * currently loaded saved addresses.
 *
 * @param {object} group
 * @param {Array<object>} savedAddresses
 * @param {boolean} [addressesLoading=false]
 * @returns {{ isValid: boolean, error: string|null, addressId: number|null }}
 */
export function validateGroupDeliveryAddress(group, savedAddresses, addressesLoading = false) {
  if (!group || group.fulfillment !== 'delivery') {
    return { isValid: true, error: null, addressId: null };
  }

  const list = Array.isArray(savedAddresses) ? savedAddresses : [];

  if (addressesLoading && list.length === 0) {
    return { isValid: true, error: null, addressId: null };
  }

  if (!group.deliveryAddress) {
    return {
      isValid: false,
      error:
        list.length === 0
          ? 'No saved delivery addresses found. Please add a delivery address to continue.'
          : 'Please select a delivery address for this sub-order.',
      addressId: null,
    };
  }

  const matched = findAddressBySelectionId(list, group.deliveryAddress.id);
  if (!matched) {
    return {
      isValid: false,
      error: 'The selected delivery address was not found in your saved addresses.',
      addressId: null,
    };
  }

  const addressId = getCheckoutAddressId(matched);
  if (!addressId) {
    return {
      isValid: false,
      error: 'The selected delivery address is missing a valid address ID. Please re-select or add an address.',
      addressId: null,
    };
  }

  return { isValid: true, error: null, addressId };
}

/**
 * Build the POST /api/customer/checkout payload from restaurantGroups.
 *
 * @param {{
 *   restaurantGroups: Array<object>,
 *   orderNotes?: string,
 *   idempotencyKey: string,
 *   expectedTotalsByRestaurant?: Record<string, number>,
 * }} params
 * @returns {object}
 */
export function buildCheckoutPayload({
  restaurantGroups,
  orderNotes = '',
  idempotencyKey,
  expectedTotalsByRestaurant = {},
}) {
  const trimmedNotes = String(orderNotes || '').trim();
  return {
    payment_method: 'cod',
    idempotency_key: idempotencyKey,
    groups: (restaurantGroups || []).map((group) => {
      const overrideTotal = expectedTotalsByRestaurant?.[group.restaurantId];
      const rawItemsSubtotal = (group.items || []).reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0
      );
      const computedSubtotal = Number.isFinite(Number(group.subtotal))
        ? Number(group.subtotal)
        : rawItemsSubtotal;
      const computedDeliveryFee =
        group.fulfillment === 'delivery'
          ? (Number.isFinite(Number(group.deliveryFee)) ? Number(group.deliveryFee) : 0)
          : 0;
      const expectedTotal =
        overrideTotal !== undefined && overrideTotal !== null && Number.isFinite(Number(overrideTotal))
          ? Math.round(Number(overrideTotal) * 100) / 100
          : Math.round((computedSubtotal + computedDeliveryFee) * 100) / 100;

      return {
        restaurant_id: Number(group.restaurantId),
        fulfillment: group.fulfillment === 'pickup' ? 'pickup' : 'delivery',
        address_id: group.fulfillment === 'delivery' ? getCheckoutAddressId(group.deliveryAddress) : null,
        delivery_notes: trimmedNotes || group.deliveryAddress?.notes || null,
        expected_total: expectedTotal,
        items: (group.items || []).map((item) => ({
          menu_item_id: Number(item.id),
          quantity: Number(item.quantity),
        })),
      };
    }),
  };
}

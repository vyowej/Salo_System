/**
 * Helpers for consistent delivery address selection, validation, and checkout
 * payload construction across CartContext and CheckoutPage.
 *
 * Note on IDs:
 * - Saved address items from /api/customer/addresses use `id` (user_addresses.user_address_id)
 *   as the dropdown/selection identifier, and `addressId` (addresses.address_id) as the
 *   foreign key expected by POST /api/customer/checkout (`groups.*.address_id`).
 */

export const DELIVERY_NOTES_MAX_LENGTH = 500;

/**
 * Validate general and per-sub-order delivery notes against the backend
 * 500-character limit. Empty notes are valid.
 *
 * @param {{
 *   orderNotes?: string,
 *   orderNotesBySubOrder?: Record<string, string>,
 *   subOrders?: Array<object>,
 * }} [params]
 * @returns {{ isValid: boolean, error: string|null, errors: Record<string, string> }}
 */
export function validateDeliveryNotes({
  orderNotes = '',
  orderNotesBySubOrder = {},
  subOrders = [],
} = {}) {
  const errors = {};
  const generalNotes = String(orderNotes ?? '').trim();

  if (generalNotes.length > DELIVERY_NOTES_MAX_LENGTH) {
    errors.general = `Delivery notes cannot exceed ${DELIVERY_NOTES_MAX_LENGTH} characters.`;
  }

  (subOrders || []).forEach((subOrder, idx) => {
    const key = subOrder?.subOrderKey;
    const perSubOrder = key ? String(orderNotesBySubOrder?.[key] ?? '').trim() : '';
    const addressNote = String(subOrder?.deliveryAddress?.notes ?? '').trim();
    const resolved = perSubOrder || generalNotes || addressNote;

    if (resolved.length > DELIVERY_NOTES_MAX_LENGTH) {
      errors[key || String(idx)] = `Delivery notes for ${subOrder?.restaurantName || `Sub-order ${idx + 1}`} cannot exceed ${DELIVERY_NOTES_MAX_LENGTH} characters.`;
    }
  });

  const firstError = Object.values(errors)[0] || null;
  return {
    isValid: !firstError,
    error: firstError,
    errors,
  };
}

/**
 * Normalize a Philippine mobile number by stripping separators and converting
 * `+639XXXXXXXXX` to `09XXXXXXXXX`.
 *
 * @param {string|number|null|undefined} raw
 * @returns {string}
 */
export function normalizePhilippineMobile(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';
  const cleaned = String(raw).replace(/[\s\-()]+/g, '').trim();
  const match = cleaned.match(/^\+63(9\d{9})$/);
  if (match) {
    return `0${match[1]}`;
  }
  return cleaned;
}

/**
 * Check whether a phone number is a valid Philippine mobile number (`09XXXXXXXXX`
 * or `+639XXXXXXXXX` after normalization).
 *
 * @param {string|number|null|undefined} raw
 * @returns {boolean}
 */
export function isValidPhilippineMobile(raw) {
  return /^09\d{9}$/.test(normalizePhilippineMobile(raw));
}

/**
 * Validate that the authenticated customer has a valid contact phone number
 * when any checkout sub-order requires delivery.
 *
 * @param {object|null|undefined} user
 * @param {Array<object>} subOrders
 * @returns {{ isValid: boolean, error: string|null, phone: string|null }}
 */
export function validateDeliveryContactPhone(user, subOrders) {
  const hasDelivery = (subOrders || []).some((sub) => sub && sub.fulfillment === 'delivery');
  if (!hasDelivery) {
    return { isValid: true, error: null, phone: null };
  }

  const rawPhone = user?.phone_number ?? user?.phone ?? '';
  const normalized = normalizePhilippineMobile(rawPhone);
  if (!normalized) {
    return {
      isValid: false,
      error: 'A valid contact phone number is required before placing a delivery order.',
      phone: null,
    };
  }

  if (!/^09\d{9}$/.test(normalized)) {
    return {
      isValid: false,
      error: 'Enter a valid Philippine mobile number (e.g. 09171234567 or +639171234567).',
      phone: null,
    };
  }

  return { isValid: true, error: null, phone: normalized };
}

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
 * Build a stable canonical signature for an item's selected add-ons so
 * identical configurations can be compared regardless of key/array ordering.
 *
 * @param {Array<object>|undefined|null} selectedAddOns
 * @returns {string}
 */
function getAddOnsSignature(selectedAddOns) {
  if (!Array.isArray(selectedAddOns) || selectedAddOns.length === 0) {
    return '[]';
  }

  const normalized = selectedAddOns
    .filter((addon) => addon && typeof addon === 'object')
    .map((addon) => ({
      id: addon.id ?? addon.addon_id ?? null,
      name: addon.name ?? addon.label ?? '',
      price: Number(addon.price || 0),
    }))
    .sort((a, b) => {
      const keyA = `${a.id ?? ''}:${a.name}:${a.price}`;
      const keyB = `${b.id ?? ''}:${b.name}:${b.price}`;
      return keyA.localeCompare(keyB);
    });

  return JSON.stringify(normalized);
}

function getItemAddOnCost(item) {
  if (!Array.isArray(item?.selectedAddOns)) return 0;
  return item.selectedAddOns.reduce((sum, addon) => sum + Number(addon?.price || 0), 0);
}

function extractAddOnOptionIds(selectedAddOns, itemName, menuItemId, groupIndex) {
  if (!Array.isArray(selectedAddOns) || selectedAddOns.length === 0) {
    return [];
  }

  const ids = [];
  for (const addon of selectedAddOns) {
    if (!addon || typeof addon !== 'object') continue;
    const rawId = addon.id ?? addon.add_on_option_id ?? addon.addon_id;
    const numId = Number(rawId);
    if (!Number.isInteger(numId) || numId <= 0) {
      const itemLabel = itemName ? `"${itemName}"` : `menu item #${menuItemId}`;
      const message = `Selected add-on "${addon.name || 'option'}" for ${itemLabel} is missing a valid option ID. Please re-add the item from the menu.`;
      const err = new Error(message);
      err.code = 'MISSING_ADDON_OPTION_ID';
      err.errors = {
        [`groups.${groupIndex}.items`]: [message],
      };
      throw err;
    }
    ids.push(numId);
  }

  return ids;
}

/**
 * Map a restaurant group's cart items into checkout payload items.
 * - Identical (menu_item_id, selectedAddOns) configurations are merged by summing quantity.
 * - Distinct add-on configurations for the same menu_item_id remain separate order lines.
 * - Selected add-on option IDs are sent via `add_on_option_ids` for server-side validation and pricing.
 *
 * @param {Array<object>} items
 * @param {number} groupIndex
 * @returns {Array<{ menu_item_id: number, quantity: number, add_on_option_ids?: number[] }>}
 */
function mapGroupItemsForCheckout(items, groupIndex) {
  const seenByConfig = new Map();

  for (const item of items || []) {
    const menuItemId = Number(item.id);
    const quantity = Number(item.quantity);
    const addOnsSignature = getAddOnsSignature(item.selectedAddOns);
    const addOnOptionIds = extractAddOnOptionIds(item.selectedAddOns, item.name, menuItemId, groupIndex);
    const configKey = `${menuItemId}:${addOnsSignature}`;

    if (seenByConfig.has(configKey)) {
      seenByConfig.get(configKey).quantity += quantity;
    } else {
      seenByConfig.set(configKey, {
        menu_item_id: menuItemId,
        quantity,
        add_on_option_ids: addOnOptionIds,
      });
    }
  }

  return Array.from(seenByConfig.values()).map(({ menu_item_id, quantity, add_on_option_ids }) =>
    add_on_option_ids.length > 0
      ? { menu_item_id, quantity, add_on_option_ids }
      : { menu_item_id, quantity }
  );
}

/**
 * Group items by delivery address when `addressMode === 'multiple'` and
 * precomputed `addressGroups` are not present.
 *
 * @param {object} group
 * @returns {Array<object>}
 */
function buildFallbackAddressGroups(group) {
  const addrMap = new Map();
  const baseFee = Number.isFinite(Number(group.baseDeliveryFee))
    ? Number(group.baseDeliveryFee)
    : (Number.isFinite(Number(group.deliveryFee)) ? Number(group.deliveryFee) : 0);

  for (const item of group.items || []) {
    const addr = item.deliveryAddress ?? group.deliveryAddress ?? null;
    const addrKey = addr?.id ?? getCheckoutAddressId(addr) ?? 'unassigned';
    if (!addrMap.has(addrKey)) {
      addrMap.set(addrKey, {
        addressId: addrKey,
        address: addr,
        items: [],
        subtotal: 0,
        deliveryFee: baseFee,
      });
    }
    const entry = addrMap.get(addrKey);
    entry.items.push(item);
    const lineTotal = Number.isFinite(Number(item.itemTotal))
      ? Number(item.itemTotal)
      : (Number(item.price || 0) + getItemAddOnCost(item)) * Number(item.quantity || 0);
    entry.subtotal += lineTotal;
  }

  return Array.from(addrMap.values());
}

/**
 * Expand restaurantGroups into checkout sub-orders.
 *
 * When a delivery restaurant group uses `addressMode === 'multiple'`, each
 * destination address group becomes its own sub-order so every item keeps its
 * selected delivery address, delivery fee, and expected total.
 * Single-address and pickup groups remain 1:1 with the restaurant group.
 *
 * @param {Array<object>} restaurantGroups
 * @returns {Array<object>}
 */
export function expandRestaurantGroupsToSubOrders(restaurantGroups) {
  const subOrders = [];

  for (const group of restaurantGroups || []) {
    if (!group) continue;

    if (group.fulfillment === 'pickup') {
      subOrders.push({
        subOrderKey: `${group.restaurantId}:pickup`,
        restaurantId: group.restaurantId,
        restaurantName: group.restaurantName,
        fulfillment: 'pickup',
        addressMode: group.addressMode || 'single',
        addressGroupIndex: 0,
        addressGroupCount: 1,
        deliveryAddress: null,
        items: group.items || [],
        subtotal: group.subtotal,
        deliveryFee: 0,
        baseDeliveryFee: group.baseDeliveryFee,
      });
      continue;
    }

    if (group.addressMode === 'multiple') {
      const addressGroups =
        Array.isArray(group.addressGroups) && group.addressGroups.length > 0
          ? group.addressGroups
          : buildFallbackAddressGroups(group);

      addressGroups.forEach((addrGroup, addrIdx) => {
        const fee = Number.isFinite(Number(addrGroup.deliveryFee))
          ? Number(addrGroup.deliveryFee)
          : (Number.isFinite(Number(group.baseDeliveryFee)) ? Number(group.baseDeliveryFee) : 0);

        subOrders.push({
          subOrderKey: `${group.restaurantId}:addr:${addrGroup.addressId ?? addrIdx}`,
          restaurantId: group.restaurantId,
          restaurantName: group.restaurantName,
          fulfillment: 'delivery',
          addressMode: 'multiple',
          addressGroupIndex: addrIdx,
          addressGroupCount: addressGroups.length,
          deliveryAddress: addrGroup.address ?? null,
          items: addrGroup.items || [],
          subtotal: addrGroup.subtotal,
          deliveryFee: fee,
          baseDeliveryFee: group.baseDeliveryFee,
        });
      });
      continue;
    }

    subOrders.push({
      subOrderKey: `${group.restaurantId}:single`,
      restaurantId: group.restaurantId,
      restaurantName: group.restaurantName,
      fulfillment: 'delivery',
      addressMode: 'single',
      addressGroupIndex: 0,
      addressGroupCount: 1,
      deliveryAddress: group.deliveryAddress ?? null,
      items: group.items || [],
      subtotal: group.subtotal,
      deliveryFee: group.deliveryFee,
      baseDeliveryFee: group.baseDeliveryFee,
    });
  }

  return subOrders;
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
  orderNotesBySubOrder = {},
  idempotencyKey,
  expectedTotalsByRestaurant = {},
}) {
  const trimmedNotes = String(orderNotes || '').trim();
  const subOrders = expandRestaurantGroupsToSubOrders(restaurantGroups);

  return {
    payment_method: 'cod',
    idempotency_key: idempotencyKey,
    groups: subOrders.map((subOrder, groupIndex) => {
      const addressIdForKey = getCheckoutAddressId(subOrder.deliveryAddress);
      const overrideTotal =
        expectedTotalsByRestaurant?.[subOrder.subOrderKey] ??
        (addressIdForKey ? expectedTotalsByRestaurant?.[`${subOrder.restaurantId}:${addressIdForKey}`] : undefined) ??
        expectedTotalsByRestaurant?.[subOrder.restaurantId];
      const rawItemsSubtotal = (subOrder.items || []).reduce(
        (sum, item) => sum + (Number(item.price || 0) + getItemAddOnCost(item)) * Number(item.quantity || 0),
        0
      );
      const computedSubtotal = Number.isFinite(Number(subOrder.subtotal))
        ? Number(subOrder.subtotal)
        : rawItemsSubtotal;
      const computedDeliveryFee =
        subOrder.fulfillment === 'delivery'
          ? (Number.isFinite(Number(subOrder.deliveryFee)) ? Number(subOrder.deliveryFee) : 0)
          : 0;
      const expectedTotal =
        overrideTotal !== undefined && overrideTotal !== null && Number.isFinite(Number(overrideTotal))
          ? Math.round(Number(overrideTotal) * 100) / 100
          : Math.round((computedSubtotal + computedDeliveryFee) * 100) / 100;

      const subOrderNote = String(orderNotesBySubOrder?.[subOrder.subOrderKey] ?? '').trim();
      const addressNote = String(subOrder.deliveryAddress?.notes ?? '').trim();

      return {
        restaurant_id: Number(subOrder.restaurantId),
        fulfillment: subOrder.fulfillment === 'pickup' ? 'pickup' : 'delivery',
        address_id: subOrder.fulfillment === 'delivery' ? addressIdForKey : null,
        delivery_notes: subOrderNote || trimmedNotes || addressNote || null,
        expected_total: expectedTotal,
        items: mapGroupItemsForCheckout(subOrder.items || [], groupIndex),
      };
    }),
  };
}

/**
 * Parse backend 422 checkout validation errors into per-sub-order and per-item
 * error maps so the UI can identify the exact restaurant sub-order and menu
 * item that failed (e.g. sold out, inactive, or deleted items) without
 * modifying or clearing the customer's cart.
 *
 * @param {Record<string, string|string[]>|undefined|null} errors
 * @param {Array<object>} [subOrders=[]]
 * @param {Array<object>} [payloadGroups=[]]
 * @returns {{
 *   groupErrors: Record<number, string[]>,
 *   itemErrorsByGroup: Record<number, Record<number, string[]>>,
 *   hasItemErrors: boolean,
 *   summaryMessage: string | null,
 * }}
 */
export function parseCheckoutValidationErrors(errors, subOrders = [], payloadGroups = []) {
  const groupErrors = {};
  const itemErrorsByGroup = {};
  let hasItemErrors = false;
  let firstItemGroupIdx = null;

  if (!errors || typeof errors !== 'object') {
    return { groupErrors, itemErrorsByGroup, hasItemErrors, summaryMessage: null };
  }

  for (const [key, rawMsgs] of Object.entries(errors)) {
    const list = Array.isArray(rawMsgs) ? rawMsgs : [String(rawMsgs)];
    const itemMatch = key.match(/^groups\.(\d+)\.items\.(\d+)\./);

    if (itemMatch) {
      const gIdx = Number(itemMatch[1]);
      const iIdx = Number(itemMatch[2]);
      hasItemErrors = true;
      if (firstItemGroupIdx === null) firstItemGroupIdx = gIdx;

      const subOrder = subOrders[gIdx];
      const payloadMenuItemId = payloadGroups?.[gIdx]?.items?.[iIdx]?.menu_item_id;
      const matchedItem =
        (subOrder?.items || []).find((it) =>
          payloadMenuItemId != null ? Number(it.id) === Number(payloadMenuItemId) : false
        ) ||
        subOrder?.items?.[iIdx] ||
        null;

      const resolvedMenuItemId =
        payloadMenuItemId != null
          ? Number(payloadMenuItemId)
          : matchedItem
            ? Number(matchedItem.id)
            : null;

      const formattedList = list.map((msg) => {
        const text = String(msg);
        if (matchedItem?.name && !text.toLowerCase().includes(matchedItem.name.toLowerCase())) {
          return `${matchedItem.name}: ${text}`;
        }
        return text;
      });

      groupErrors[gIdx] = [...(groupErrors[gIdx] || []), ...formattedList];
      if (resolvedMenuItemId !== null && Number.isFinite(resolvedMenuItemId)) {
        itemErrorsByGroup[gIdx] = itemErrorsByGroup[gIdx] || {};
        itemErrorsByGroup[gIdx][resolvedMenuItemId] = [
          ...(itemErrorsByGroup[gIdx][resolvedMenuItemId] || []),
          ...formattedList,
        ];
      }
      continue;
    }

    const groupMatch = key.match(/^groups\.(\d+)\./);
    if (groupMatch) {
      const gIdx = Number(groupMatch[1]);
      groupErrors[gIdx] = [...(groupErrors[gIdx] || []), ...list.map(String)];
    }
  }

  let summaryMessage = Object.values(groupErrors).flat()[0] || null;
  if (hasItemErrors && firstItemGroupIdx !== null) {
    const firstMsg = groupErrors[firstItemGroupIdx]?.[0];
    const restaurantName = subOrders[firstItemGroupIdx]?.restaurantName;
    if (firstMsg) {
      summaryMessage =
        restaurantName && !firstMsg.toLowerCase().includes(restaurantName.toLowerCase())
          ? `${restaurantName}: ${firstMsg}`
          : firstMsg;
    }
  }

  return {
    groupErrors,
    itemErrorsByGroup,
    hasItemErrors,
    summaryMessage,
  };
}

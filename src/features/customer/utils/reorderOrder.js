/**
 * Helpers for mapping backend customer order items and validating them
 * against the restaurant's live menu before adding to cart on Reorder.
 */

function normalizeAddOns(rawAddOns) {
  if (!Array.isArray(rawAddOns)) return [];
  return rawAddOns
    .map((addOn) => {
      if (typeof addOn === 'string') {
        return { name: addOn, price: 0 };
      }
      if (addOn && typeof addOn === 'object') {
        return {
          ...addOn,
          name: addOn.name || addOn.option_name || '',
          price: Number(addOn.price ?? addOn.additional_price ?? 0),
        };
      }
      return null;
    })
    .filter((addOn) => addOn && addOn.name);
}

/**
 * Map raw backend `order.items` entries into a normalized frontend shape.
 * Preserves `menuItemId` (`menu_item_id`) so cart/checkout receive a valid numeric ID.
 */
export function mapOrderItemsForReorder(rawItems = []) {
  if (!Array.isArray(rawItems)) return [];

  return rawItems.map((item) => ({
    orderItemId: item.order_item_id != null ? String(item.order_item_id) : null,
    menuItemId: item.menu_item_id != null ? String(item.menu_item_id) : null,
    name: item.item_name ?? item.name ?? '',
    price: Number(item.unit_price ?? item.price ?? 0),
    quantity: Math.max(1, Number(item.quantity ?? item.qty ?? 1)),
    addOns: normalizeAddOns(item.add_ons ?? item.addOns ?? item.selected_add_ons),
  }));
}

function resolveValidAddOns(requestedAddOns, liveMenuItem) {
  if (!Array.isArray(requestedAddOns) || requestedAddOns.length === 0) {
    return { validAddOns: [], unavailableAddOns: [], priceChangedAddOns: [] };
  }

  const liveGroups = Array.isArray(liveMenuItem?.addOns) ? liveMenuItem.addOns : [];
  if (liveGroups.length === 0) {
    return {
      validAddOns: [],
      unavailableAddOns: requestedAddOns.map((a) => a.name).filter(Boolean),
      priceChangedAddOns: [],
    };
  }

  const liveOptionsById = new Map();
  const liveOptionsByName = new Map();
  for (const group of liveGroups) {
    for (const option of group.options || []) {
      if (option.id != null) liveOptionsById.set(String(option.id), option);
      if (option.name) liveOptionsByName.set(option.name.toLowerCase(), option);
    }
  }

  const validAddOns = [];
  const unavailableAddOns = [];
  const priceChangedAddOns = [];

  for (const addOn of requestedAddOns) {
    const match =
      (addOn.id != null ? liveOptionsById.get(String(addOn.id)) : null) ||
      (addOn.name ? liveOptionsByName.get(addOn.name.toLowerCase()) : null);
    if (!match || !match.isAvailable) {
      if (addOn.name) unavailableAddOns.push(addOn.name);
      continue;
    }

    const livePrice = Number(match.price ?? 0);
    if (addOn.price != null && Number(addOn.price) !== livePrice) {
      priceChangedAddOns.push({
        name: match.name,
        oldPrice: Number(addOn.price),
        newPrice: livePrice,
      });
    }

    validAddOns.push({
      id: match.id,
      name: match.name,
      price: livePrice,
    });
  }

  return { validAddOns, unavailableAddOns, priceChangedAddOns };
}

/**
 * Validate mapped order items against a restaurant's live menu.
 * Unavailable, deleted (`menuItemId === null`), or inactive items are excluded
 * and returned in `skippedItems` instead of being silently added.
 */
export function resolveReorderItems(orderItems = [], restaurant = null) {
  if (!restaurant) {
    return {
      cartItems: [],
      skippedItems: orderItems.map((it) => it.name || 'Menu item'),
      unavailableAddOns: [],
      priceChangedAddOns: [],
      requiresReview: false,
      unavailableReason: 'This restaurant is currently unavailable.',
    };
  }

  if (
    restaurant.availability?.temporarily_unavailable ||
    restaurant.operatingSchedule?.acceptingOrders === false
  ) {
    return {
      cartItems: [],
      skippedItems: orderItems.map((it) => it.name || 'Menu item'),
      unavailableAddOns: [],
      priceChangedAddOns: [],
      requiresReview: false,
      unavailableReason: `${restaurant.name || 'This restaurant'} is not accepting orders right now.`,
    };
  }

  const liveMenuById = new Map(
    (Array.isArray(restaurant.menu) ? restaurant.menu : []).map((menuItem) => [
      String(menuItem.id),
      menuItem,
    ]),
  );

  const cartItems = [];
  const skippedItems = [];
  const unavailableAddOns = [];
  const priceChangedAddOns = [];

  for (const item of orderItems) {
    const liveItem = item.menuItemId ? liveMenuById.get(String(item.menuItemId)) : null;

    if (!liveItem || !liveItem.isAvailable) {
      skippedItems.push(item.name || 'Unavailable item');
      continue;
    }

    const addOnResolution = resolveValidAddOns(item.addOns, liveItem);
    addOnResolution.unavailableAddOns.forEach((name) => {
      unavailableAddOns.push(`${liveItem.name || item.name}: ${name}`);
    });
    addOnResolution.priceChangedAddOns.forEach((change) => {
      priceChangedAddOns.push({
        itemName: liveItem.name || item.name,
        ...change,
      });
    });

    cartItems.push({
      id: String(liveItem.id),
      name: liveItem.name || item.name,
      price: Number(liveItem.price ?? item.price ?? 0),
      quantity: Math.max(1, Number(item.quantity ?? 1)),
      restaurantId: String(restaurant.id),
      restaurantName: restaurant.name,
      image: liveItem.photo || restaurant.logoImage || 'R',
      selectedAddOns: addOnResolution.validAddOns,
    });
  }

  return {
    cartItems,
    skippedItems,
    unavailableAddOns,
    priceChangedAddOns,
    requiresReview: skippedItems.length > 0 || unavailableAddOns.length > 0 || priceChangedAddOns.length > 0,
    unavailableReason: null,
  };
}

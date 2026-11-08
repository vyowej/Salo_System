export const MENU_AVAILABILITY = Object.freeze([
  'available',
  'sold_out',
  'temporarily_unavailable',
  'hidden',
]);

export function normalizeMenuAvailability(item = {}) {
  if (MENU_AVAILABILITY.includes(item.availability)) return item.availability;
  return item.isAvailable === false ? 'sold_out' : 'available';
}

export function normalizeMenuItem(item = {}) {
  return {
    ...item,
    price: Number(item.price || 0),
    discountedPrice: item.discountedPrice ?? '',
    availability: normalizeMenuAvailability(item),
    isAvailable: normalizeMenuAvailability(item) === 'available',
    photo: item.photo || null,
    preparationInfo: item.preparationInfo || '',
    dietaryInfo: Array.isArray(item.dietaryInfo) ? item.dietaryInfo : [],
    addOns: Array.isArray(item.addOns) ? item.addOns.map((group) => ({
      ...group,
      minSelection: Number(group.minSelection ?? (group.required ? 1 : 0)),
      maxSelection: Number(group.maxSelection ?? (group.required ? 1 : Math.max(group.options?.length || 1, 1))),
      isAvailable: group.isAvailable !== false,
      options: Array.isArray(group.options) ? group.options.map((option) => ({
        ...option,
        price: Number(option.price || 0),
        isAvailable: option.isAvailable !== false,
      })) : [],
    })) : [],
  };
}

export function normalizeMenuCategories(restaurant = {}) {
  const rawCategories = Array.isArray(restaurant.menuCategories) && restaurant.menuCategories.length
    ? restaurant.menuCategories
    : restaurant.categories || [];
  return rawCategories.map((category, index) => {
    if (typeof category === 'string') {
      return {
        id: `category-${index}-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name: category,
        visible: true,
        sortOrder: index,
      };
    }
    return {
      id: category.id || `category-${index}-${category.name}`,
      name: category.name || '',
      visible: category.visible !== false,
      sortOrder: Number(category.sortOrder ?? index),
    };
  }).filter((category) => category.name).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function validateMenuItem(item, { canManagePricing = true } = {}) {
  const errors = {};
  const name = String(item.name || '').trim();
  const price = Number(item.price);
  const discountedPrice = item.discountedPrice === '' || item.discountedPrice == null
    ? null
    : Number(item.discountedPrice);

  if (!name) errors.name = 'Item name is required.';
  if (canManagePricing && (!Number.isFinite(price) || price <= 0)) {
    errors.price = 'Enter a price greater than zero.';
  }
  if (canManagePricing && discountedPrice !== null
    && (!Number.isFinite(discountedPrice) || discountedPrice <= 0 || discountedPrice >= price)) {
    errors.discountedPrice = 'Discounted price must be greater than zero and lower than the regular price.';
  }
  if (!item.category) errors.category = 'Choose a menu category.';
  if (!MENU_AVAILABILITY.includes(item.availability)) errors.availability = 'Choose a valid availability state.';

  const addOnGroupNames = new Set();
  (item.addOns || []).forEach((group, groupIndex) => {
    const min = Number(group.minSelection);
    const max = Number(group.maxSelection);
    const groupErrors = [];
    const groupName = String(group.name || '').trim();
    if (!groupName) groupErrors.push('Add-on group name is required.');
    else if (addOnGroupNames.has(groupName.toLowerCase())) groupErrors.push('Add-on group names must be unique.');
    addOnGroupNames.add(groupName.toLowerCase());
    if (!Number.isInteger(min) || min < 0 || !Number.isInteger(max) || max < 1 || min > max) {
      groupErrors.push('Add-on selection limits must be valid; minimum cannot exceed maximum.');
    }
    const optionNames = new Set();
    if (!Array.isArray(group.options) || !group.options.length
      || group.options.some((option) => !String(option.name || '').trim()
        || !Number.isFinite(Number(option.price)) || Number(option.price) < 0)) {
      groupErrors.push('Each add-on group needs named options with prices of zero or more.');
    }
    (group.options || []).forEach((option) => {
      const optionName = String(option.name || '').trim().toLowerCase();
      if (optionName && optionNames.has(optionName)) {
        groupErrors.push('Option names within each add-on group must be unique.');
      }
      optionNames.add(optionName);
    });
    if (groupErrors.length) errors[`addOnGroup${groupIndex}`] = groupErrors.join(' ');
  });

  return errors;
}

export function getMenuCustomerPrice(item) {
  const discountedPrice = item.discountedPrice === '' || item.discountedPrice == null
    ? null
    : Number(item.discountedPrice);
  return Number.isFinite(discountedPrice) && discountedPrice > 0
    ? discountedPrice
    : Number(item.price || 0);
}

export const MENU_STOCK_STATUS = Object.freeze({
  OUT: 'out-of-stock',
  LOW: 'low-stock',
  IN: 'in-stock',
  UNTRACKED: 'untracked',
});

export const MENU_STOCK_ACTION = Object.freeze({
  RECEIVE: 'received',
  USAGE: 'usage',
  ADJUST: 'adjusted',
});

export const MENU_STOCK_FILTER = Object.freeze({
  ALL: 'all',
});

export const INVENTORY_MENU_DISPLAY = Object.freeze({
  defaultAlertThreshold: 5,
  defaultUnit: 'portions',
  minimumQuantity: 0,
  quantityStep: 'any',
  defaults: Object.freeze({
    ingredientItem: Object.freeze({
      name: '',
      category: '',
      unit: '',
      quantity: '0',
      minimumLevel: '0',
      maximumLevel: '',
      supplier: '',
      expirationDate: '',
    }),
    settings: Object.freeze({ deductionMode: 'manual', expiringSoonDays: 7 }),
  }),
  page: Object.freeze({
    eyebrow: 'Restaurant operations',
    title: 'Inventory',
    description: 'Track supplies, menu item stock, and every stock movement.',
    addIngredient: 'Add inventory item',
    loading: 'Loading inventory...',
    loadErrorTitle: 'Inventory could not be loaded',
  }),
  settings: Object.freeze({
    ariaLabel: 'Stock deduction settings',
    title: 'Order stock deduction',
    description: 'On-completion deductions apply to tracked menu quantities and are recorded once per order.',
    fieldLabel: 'Deduction mode',
    fieldAriaLabel: 'Inventory deduction mode',
    modes: Object.freeze([
      Object.freeze({ value: 'manual', label: 'Manual (default)' }),
      Object.freeze({ value: 'on_completion', label: 'On order completion' }),
    ]),
  }),
  ingredientForm: Object.freeze({
    editTitle: 'Edit inventory item',
    addTitle: 'Add inventory item',
    description: 'Quantity and unit must be valid; stock cannot become negative.',
    name: 'Name *',
    category: 'Category *',
    unit: 'Unit *',
    unitPlaceholder: 'kg, L, pieces',
    startingQuantity: 'Starting quantity',
    minimumLevel: 'Minimum level',
    maximumLevel: 'Maximum level',
    supplier: 'Supplier (optional)',
    expirationDate: 'Expiration date (optional)',
    save: 'Save item',
    create: 'Create item',
    cancel: 'Cancel',
    limits: Object.freeze({ name: 100, category: 60, unit: 20 }),
  }),
  errors: Object.freeze({
    load: 'Unable to load inventory.',
    save: 'Unable to save inventory changes.',
    history: 'Unable to load stock history.',
  }),
  statusOrder: Object.freeze({
    [MENU_STOCK_STATUS.OUT]: 0,
    [MENU_STOCK_STATUS.LOW]: 1,
    [MENU_STOCK_STATUS.IN]: 2,
    [MENU_STOCK_STATUS.UNTRACKED]: 3,
  }),
  labels: Object.freeze({
    statuses: Object.freeze({
      [MENU_STOCK_STATUS.OUT]: 'Out of Stock',
      [MENU_STOCK_STATUS.LOW]: 'Low Stock',
      [MENU_STOCK_STATUS.IN]: 'In Stock',
      [MENU_STOCK_STATUS.UNTRACKED]: 'Not tracked',
    }),
    filters: Object.freeze([
      Object.freeze({ value: MENU_STOCK_FILTER.ALL, label: 'All' }),
      Object.freeze({ value: MENU_STOCK_STATUS.LOW, label: 'Low Stock' }),
      Object.freeze({ value: MENU_STOCK_STATUS.OUT, label: 'Out of Stock' }),
    ]),
    search: 'Search menu items',
    searchPlaceholder: 'Name or category',
    category: 'Category',
    allCategories: 'All categories',
    alertSummary: (low, out) => `${low} ${low === 1 ? 'item' : 'items'} low on stock · ${out} ${out === 1 ? 'item' : 'items'} out of stock`,
    showOnlyAlerts: 'Show only items',
    showAll: 'Show all',
    lowStockAlertAt: (quantity) => `Low-stock alert at ${quantity}`,
    itemCount: (count) => `${count} ${count === 1 ? 'item' : 'items'}`,
    needsAttention: (count) => `${count} ${count === 1 ? 'item needs' : 'items need'} attention`,
    uncategorized: 'Uncategorized',
    noItemsTitle: 'No menu items match these filters',
    noItemsDescription: 'Adjust the search or filters to see menu items.',
    emptyTitle: 'No menu items yet',
    emptyDescription: 'Add orderable items in Menu Management to track their stock here.',
    receive: 'Receive',
    recordUsage: 'Record usage',
    more: 'More',
    adjust: 'Adjust',
    markUnavailable: 'Mark unavailable',
    restoreAvailability: 'Restore availability',
    unavailable: 'Unavailable',
    editDetails: 'Edit details',
    movementHistory: 'Movement history',
    hideHistory: 'Hide history',
    historyTitle: 'Menu stock movement history',
    noHistory: 'No stock movements recorded.',
    quantity: 'Quantity',
    setQuantity: 'Set quantity',
    reason: 'Reason',
    saveMovement: 'Save movement',
    cancel: 'Cancel',
    restockedReason: 'Restocked',
    usedReason: 'Used/sold',
    adjustReason: '',
    quantityRequired: 'Enter a quantity greater than zero.',
    adjustmentReasonRequired: 'Enter a reason for this adjustment.',
    usageExceedsStock: 'The usage quantity cannot exceed the current stock.',
    invalidQuantity: 'Enter a valid non-negative quantity.',
    menuEditNotFound: 'The menu item could not be found.',
    menuEditPermission: 'You do not have permission to edit this menu item.',
    inventoryAlerts: 'Menu stock alerts',
    categoryCount: 'items',
    categoryFilter: 'Filter by category',
    stockFilters: 'Filter by stock status',
  }),
});

function isProvidedThreshold(value) {
  return value !== null
    && value !== undefined
    && String(value).trim() !== ''
    && Number.isFinite(Number(value))
    && Number(value) >= 0;
}

export function getMenuStockDisplay(item) {
  const rawQuantity = item.stockQuantity;
  const tracked = rawQuantity !== null
    && rawQuantity !== undefined
    && rawQuantity !== '';

  if (!tracked) {
    return {
      ...item,
      stockTracked: false,
      inventoryStockStatus: MENU_STOCK_STATUS.UNTRACKED,
      stockThreshold: null,
      stockDisplayUnit: item.unit === 'pcs' ? 'pcs' : INVENTORY_MENU_DISPLAY.defaultUnit,
    };
  }

  const quantity = Number(rawQuantity);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error(`The stock quantity for ${item.name} is invalid.`);
  }

  const threshold = isProvidedThreshold(item.minimumLevel)
    ? Number(item.minimumLevel)
    : INVENTORY_MENU_DISPLAY.defaultAlertThreshold;
  const inventoryStockStatus = quantity === 0
    ? MENU_STOCK_STATUS.OUT
    : quantity <= threshold ? MENU_STOCK_STATUS.LOW : MENU_STOCK_STATUS.IN;

  return {
    ...item,
    stockQuantity: quantity,
    stockTracked: true,
    inventoryStockStatus,
    stockThreshold: threshold,
    stockDisplayUnit: item.unit === 'pcs' ? 'pcs' : INVENTORY_MENU_DISPLAY.defaultUnit,
  };
}

export function sortInventoryMenuItems(items) {
  return [...items].sort((first, second) => (
    INVENTORY_MENU_DISPLAY.statusOrder[first.inventoryStockStatus]
      - INVENTORY_MENU_DISPLAY.statusOrder[second.inventoryStockStatus]
    || String(first.name).localeCompare(String(second.name), undefined, { sensitivity: 'base' })
  ));
}

export function filterInventoryMenuItems(items, {
  search = '',
  category = MENU_STOCK_FILTER.ALL,
  status = MENU_STOCK_FILTER.ALL,
  alertOnly = false,
} = {}) {
  const searchText = search.trim().toLowerCase();
  return items.filter((item) => {
    const text = `${item.name} ${item.category || ''}`.toLowerCase();
    return text.includes(searchText)
      && (category === MENU_STOCK_FILTER.ALL || item.category === category)
      && (status === MENU_STOCK_FILTER.ALL || item.inventoryStockStatus === status)
      && (!alertOnly || [MENU_STOCK_STATUS.LOW, MENU_STOCK_STATUS.OUT].includes(item.inventoryStockStatus));
  });
}

export function groupInventoryMenuItems(categories, items) {
  const grouped = categories
    .map((category) => ({
      ...category,
      items: sortInventoryMenuItems(items.filter((item) => item.category === category.name)),
    }))
    .filter((category) => category.items.length > 0);
  const knownCategories = new Set(categories.map((category) => category.name));
  const unlistedItems = items.filter((item) => !knownCategories.has(item.category));

  if (unlistedItems.length) {
    const categoryNames = [...new Set(unlistedItems.map((item) => item.category || INVENTORY_MENU_DISPLAY.labels.uncategorized))];
    categoryNames.forEach((name) => {
      grouped.push({
        id: `unlisted-${name}`,
        name,
        items: sortInventoryMenuItems(unlistedItems.filter((item) => (item.category || INVENTORY_MENU_DISPLAY.labels.uncategorized) === name)),
      });
    });
  }

  return grouped;
}

export function getInventoryMenuAlertCounts(items) {
  return items.reduce((counts, item) => {
    if (item.inventoryStockStatus === MENU_STOCK_STATUS.LOW) counts.low += 1;
    if (item.inventoryStockStatus === MENU_STOCK_STATUS.OUT) counts.out += 1;
    return counts;
  }, { low: 0, out: 0 });
}

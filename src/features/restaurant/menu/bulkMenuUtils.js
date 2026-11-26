export const MAX_BULK_MENU_ROWS = 30;

export function parseBulkCategoryPaste(text = '') {
  return String(text || '')
    .split(/[\r\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function validateBulkCategoryRows(rows = [], existingCategories = []) {
  const existingSet = new Set(
    (Array.isArray(existingCategories) ? existingCategories : [])
      .map((c) => String(c?.name || c?.category_name || '').trim().toLowerCase())
      .filter(Boolean),
  );
  const seenInBatch = new Set();
  const errorsByIndex = {};

  if (!Array.isArray(rows) || rows.length === 0) {
    return { valid: false, errorsByIndex: { 0: 'Add at least one category.' } };
  }
  if (rows.length > MAX_BULK_MENU_ROWS) {
    return { valid: false, errorsByIndex: { 0: `Maximum ${MAX_BULK_MENU_ROWS} categories per batch.` } };
  }

  rows.forEach((row, index) => {
    const name = String(row?.name || '').trim();
    if (!name) {
      errorsByIndex[index] = 'Category name is required.';
      return;
    }
    if (name.length > 100) {
      errorsByIndex[index] = 'Category name must be 100 characters or fewer.';
      return;
    }
    const lower = name.toLowerCase();
    if (seenInBatch.has(lower)) {
      errorsByIndex[index] = 'Duplicate name in this batch.';
      return;
    }
    if (existingSet.has(lower)) {
      errorsByIndex[index] = 'Already exists in this restaurant.';
      return;
    }
    seenInBatch.add(lower);
  });

  return {
    valid: Object.keys(errorsByIndex).length === 0,
    errorsByIndex,
  };
}

export function validateBulkItemRows(rows = []) {
  const errorsByIndex = {};

  if (!Array.isArray(rows) || rows.length === 0) {
    return { valid: false, errorsByIndex: { 0: { name: 'Add at least one item.' } } };
  }
  if (rows.length > MAX_BULK_MENU_ROWS) {
    return { valid: false, errorsByIndex: { 0: { name: `Maximum ${MAX_BULK_MENU_ROWS} items per batch.` } } };
  }

  rows.forEach((row, index) => {
    const rowErr = {};
    const name = String(row?.name || '').trim();
    const price = Number(row?.price);

    if (!name) {
      rowErr.name = 'Item name is required.';
    } else if (name.length > 200) {
      rowErr.name = 'Item name must be 200 characters or fewer.';
    }

    if (row?.price === '' || row?.price === null || row?.price === undefined || !Number.isFinite(price) || price <= 0 || price > 999999.99) {
      rowErr.price = 'Enter a valid price greater than 0.';
    }

    if (Object.keys(rowErr).length > 0) {
      errorsByIndex[index] = rowErr;
    }
  });

  return {
    valid: Object.keys(errorsByIndex).length === 0,
    errorsByIndex,
  };
}

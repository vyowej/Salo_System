export const INVENTORY_ALERT_STATUSES = Object.freeze([
  'In Stock',
  'Low Stock',
  'Out of Stock',
  'Expiring Soon',
  'Unavailable',
]);

export function classifyInventoryItem(item, expiringSoonDays, now = new Date()) {
  if (item.availability === 'unavailable') return 'Unavailable';
  const quantity = Number(item.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return 'Out of Stock';

  if (item.expirationDate) {
    const expiresAt = new Date(`${item.expirationDate}T00:00:00`);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + expiringSoonDays);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt >= today && expiresAt <= cutoff) {
      return 'Expiring Soon';
    }
  }

  return quantity <= Number(item.minimumLevel || 0) ? 'Low Stock' : 'In Stock';
}

export function validateStockQuantity(value, label = 'Quantity') {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return quantity;
}

export function createStockMovement(item, type, requestedQuantity, reason = '', user = {}, now = new Date()) {
  const quantity = validateStockQuantity(requestedQuantity, 'Movement quantity');
  if (quantity <= 0) throw new Error('Movement quantity must be greater than zero.');
  if (type === 'adjusted' && !String(reason).trim()) {
    throw new Error('A reason is required for stock adjustments.');
  }

  const before = validateStockQuantity(item.quantity, 'Current stock');
  const after = type === 'deducted' ? before - quantity : before + quantity;
  if (after < 0) throw new Error('This movement would make stock negative.');

  return {
    quantity: type === 'deducted' ? -quantity : type === 'adjusted' ? after - before : quantity,
    before,
    after,
    movement: {
      id: `move-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
      itemId: item.id,
      itemName: item.name,
      type,
      quantity: type === 'deducted' ? -quantity : type === 'adjusted' ? after - before : quantity,
      before,
      after,
      date: now.toISOString(),
      responsibleUser: user.name || user.username || user.email || 'Unknown user',
      reason: String(reason).trim(),
    },
  };
}

export function createStockAdjustment(item, nextQuantity, reason = '', user = {}, now = new Date()) {
  const after = validateStockQuantity(nextQuantity, 'Adjusted stock');
  if (!String(reason).trim()) throw new Error('A reason is required for stock adjustments.');
  const before = validateStockQuantity(item.quantity, 'Current stock');
  return {
    quantity: after - before,
    before,
    after,
    movement: {
      id: `move-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
      itemId: item.id,
      itemName: item.name,
      type: 'adjusted',
      quantity: after - before,
      before,
      after,
      date: now.toISOString(),
      responsibleUser: user.name || user.username || user.email || 'Unknown user',
      reason: String(reason).trim(),
    },
  };
}

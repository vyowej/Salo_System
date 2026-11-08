import { useCallback, useEffect, useMemo, useState } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { EmptyState, ErrorState, LoadingSpinner } from '../../../components/feedback';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import './OwnerInventoryPage.css';

const EMPTY_ITEM = {
  name: '',
  category: '',
  unit: '',
  quantity: '0',
  minimumLevel: '0',
  maximumLevel: '',
  supplier: '',
  expirationDate: '',
};

const STOCK_ACTION_LABELS = {
  received: 'Receive stock',
  usage: 'Record usage',
  returned: 'Return stock',
  adjusted: 'Adjust quantity',
};

export default function OwnerInventoryPage() {
  const access = useRestaurantAccess();
  const restaurantId = access.selectedRestaurantId;
  const [items, setItems] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [settings, setSettings] = useState({ deductionMode: 'manual', expiringSoonDays: 7 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [actionItem, setActionItem] = useState(null);
  const [actionType, setActionType] = useState('received');
  const [actionQuantity, setActionQuantity] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [menuStockValues, setMenuStockValues] = useState({});
  const [historyItem, setHistoryItem] = useState(null);
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);

  const can = (permission) => access.canAccess([permission]);

  const loadInventory = useCallback(() => {
    setLoading(true);
    setError('');
    try {
      setItems(ownerService.getInventoryItems(restaurantId));
      setMenuItems(ownerService.getMenuItems(restaurantId)
        .filter((item) => item.stockQuantity !== null && item.stockQuantity !== undefined && item.stockQuantity !== '')
        .map((item) => ({ ...item, stockQuantity: Number(item.stockQuantity) })));
      setSettings(ownerService.getInventorySettings(restaurantId));
      if (historyItem) setHistory(ownerService.getInventoryMovements(restaurantId, historyItem));
    } catch (loadError) {
      setError(loadError.message || 'Unable to load inventory.');
    } finally {
      setLoading(false);
    }
  }, [historyItem, restaurantId]);

  useEffect(() => {
    loadInventory();
    window.addEventListener('salo:demoStoreUpdated', loadInventory);
    return () => window.removeEventListener('salo:demoStoreUpdated', loadInventory);
  }, [loadInventory]);

  const categories = [...new Set(items.map((item) => item.category))].filter(Boolean).sort();
  const filteredItems = useMemo(() => items.filter((item) => {
    const text = `${item.name} ${item.category || ''}`.toLowerCase();
    return (item.kind !== 'menu')
      && text.includes(search.trim().toLowerCase())
      && (categoryFilter === 'all' || item.category === categoryFilter)
      && (statusFilter === 'all' || item.stockStatus === statusFilter);
  }), [categoryFilter, items, search, statusFilter]);
  const filteredMenuItems = useMemo(() => menuItems.filter((item) => {
    const text = `${item.name} ${item.category || ''}`.toLowerCase();
    const itemStatus = Number(item.stockQuantity) > 0 ? 'In Stock' : 'Out of Stock';
    return text.includes(search.trim().toLowerCase())
      && (categoryFilter === 'all' || item.category === categoryFilter)
      && (statusFilter === 'all' || statusFilter === itemStatus);
  }), [categoryFilter, menuItems, search, statusFilter]);
  const counts = useMemo(() => ({
    'In Stock': items.filter((item) => item.kind !== 'menu' && item.stockStatus === 'In Stock').length,
    'Low Stock': items.filter((item) => item.kind !== 'menu' && item.stockStatus === 'Low Stock').length,
    'Out of Stock': items.filter((item) => item.kind !== 'menu' && item.stockStatus === 'Out of Stock').length,
    'Expiring Soon': items.filter((item) => item.kind !== 'menu' && item.stockStatus === 'Expiring Soon').length,
  }), [items]);

  const runAction = (action) => {
    setError('');
    setSaving(true);
    try {
      action();
      loadInventory();
    } catch (actionError) {
      setError(actionError.message || 'Unable to save inventory changes.');
    } finally {
      setSaving(false);
    }
  };

  const openNewItem = () => {
    setEditingItem(null);
    setItemForm(EMPTY_ITEM);
    setItemFormOpen(true);
  };

  const openEditItem = (item) => {
    setEditingItem(item);
    setItemForm({
      ...EMPTY_ITEM,
      ...item,
      quantity: String(item.quantity),
      minimumLevel: String(item.minimumLevel),
      maximumLevel: item.maximumLevel == null ? '' : String(item.maximumLevel),
    });
    setItemFormOpen(true);
  };

  const saveItem = (event) => {
    event.preventDefault();
    runAction(() => {
      const payload = {
        ...itemForm,
        quantity: Number(itemForm.quantity),
        minimumLevel: Number(itemForm.minimumLevel),
        maximumLevel: itemForm.maximumLevel === '' ? null : Number(itemForm.maximumLevel),
      };
      if (editingItem) ownerService.updateInventoryItem(editingItem.id, payload, restaurantId);
      else ownerService.createInventoryItem(payload, restaurantId);
      setItemFormOpen(false);
      setEditingItem(null);
      setItemForm(EMPTY_ITEM);
    });
  };

  const applyStockAction = (event) => {
    event.preventDefault();
    if (!actionItem) return;
    const quantity = Number(actionQuantity);
    runAction(() => {
      if (actionType === 'received') ownerService.receiveInventoryStock(actionItem.id, quantity, restaurantId, actionReason);
      if (actionType === 'usage') ownerService.recordInventoryUsage(actionItem.id, quantity, restaurantId, actionReason);
      if (actionType === 'returned') ownerService.returnInventoryStock(actionItem.id, quantity, restaurantId, actionReason);
      if (actionType === 'adjusted') ownerService.adjustInventoryStock(actionItem.id, quantity, actionReason, restaurantId);
      setActionItem(null);
      setActionQuantity('');
      setActionReason('');
    });
  };

  const toggleHistory = (item) => {
    if (historyItem === item.id) {
      setHistoryItem(null);
      setHistory([]);
      return;
    }
    setError('');
    try {
      setHistory(ownerService.getInventoryMovements(restaurantId, item.id));
      setHistoryItem(item.id);
    } catch (historyError) {
      setError(historyError.message || 'Unable to load stock history.');
    }
  };

  const saveMenuStock = (item) => {
    const entry = menuStockValues[item.id] || { quantity: String(item.stockQuantity), reason: '' };
    runAction(() => {
      ownerService.updateMenuItemStock(item.id, Number(entry.quantity), entry.reason, restaurantId);
      setMenuStockValues((current) => ({ ...current, [item.id]: { quantity: String(entry.quantity), reason: '' } }));
    });
  };

  return (
    <OwnerLayout>
      <div className="owner-inventory-page">
        <header className="owner-inventory-header">
          <div>
            <p className="owner-inventory-eyebrow">Restaurant operations</p>
            <h1>Inventory</h1>
            <p>Track supplies, menu item stock, and every stock movement.</p>
          </div>
          {can('inventory.addStock') && <Button onClick={openNewItem}>Add inventory item</Button>}
        </header>

        {error && <div className="owner-inventory-error" role="alert">{error}</div>}
        {loading ? <LoadingSpinner size="lg" label="Loading inventory..." />
          : error && items.length === 0 ? <ErrorState title="Inventory could not be loaded" description={error} onRetry={loadInventory} />
            : (
              <>
                <section className="owner-inventory-summary" aria-label="Inventory alerts">
                  {Object.entries(counts).map(([label, count]) => (
                    <button className={`owner-inventory-stat ${statusFilter === label ? 'active' : ''}`} type="button" key={label} onClick={() => setStatusFilter(statusFilter === label ? 'all' : label)}>
                      <span>{label}</span><strong>{count}</strong>
                    </button>
                  ))}
                </section>

                <section className="owner-inventory-settings" aria-label="Stock deduction settings">
                  <div>
                    <h2>Order stock deduction</h2>
                    <p>On-completion deductions apply to tracked menu quantities and are recorded once per order.</p>
                  </div>
                  <label>
                    <span>Deduction mode</span>
                    <select
                      aria-label="Inventory deduction mode"
                      value={settings.deductionMode}
                      disabled={!can('inventory.adjustStock')}
                      onChange={(event) => runAction(() => ownerService.setInventoryDeductionMode(event.target.value, restaurantId))}
                    >
                      <option value="manual">Manual (default)</option>
                      <option value="on_completion">On order completion</option>
                    </select>
                  </label>
                </section>

                {itemFormOpen && (
                  <form className="owner-inventory-form" onSubmit={saveItem}>
                    <div className="owner-inventory-form-heading"><h2>{editingItem ? 'Edit inventory item' : 'Add inventory item'}</h2><p>Quantity and unit must be valid; stock cannot become negative.</p></div>
                    <div className="owner-inventory-form-grid">
                      <label><span>Name *</span><input value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} required maxLength={100} /></label>
                      <label><span>Category *</span><input value={itemForm.category} onChange={(event) => setItemForm({ ...itemForm, category: event.target.value })} required maxLength={60} /></label>
                      <label><span>Unit *</span><input value={itemForm.unit} onChange={(event) => setItemForm({ ...itemForm, unit: event.target.value })} placeholder="kg, L, pieces" required maxLength={20} /></label>
                      {!editingItem && <label><span>Starting quantity</span><input type="number" min="0" step="any" value={itemForm.quantity} onChange={(event) => setItemForm({ ...itemForm, quantity: event.target.value })} /></label>}
                      <label><span>Minimum level</span><input type="number" min="0" step="any" value={itemForm.minimumLevel} onChange={(event) => setItemForm({ ...itemForm, minimumLevel: event.target.value })} /></label>
                      <label><span>Maximum level</span><input type="number" min="0" step="any" value={itemForm.maximumLevel} onChange={(event) => setItemForm({ ...itemForm, maximumLevel: event.target.value })} /></label>
                      <label><span>Supplier (optional)</span><input value={itemForm.supplier} onChange={(event) => setItemForm({ ...itemForm, supplier: event.target.value })} /></label>
                      <label><span>Expiration date (optional)</span><input type="date" value={itemForm.expirationDate} onChange={(event) => setItemForm({ ...itemForm, expirationDate: event.target.value })} /></label>
                    </div>
                    <div className="owner-inventory-form-actions"><Button type="submit" loading={saving}>{editingItem ? 'Save item' : 'Create item'}</Button><Button variant="ghost" onClick={() => setItemFormOpen(false)}>Cancel</Button></div>
                  </form>
                )}

                <section className="owner-inventory-filters" aria-label="Inventory filters">
                  <label><span>Search inventory</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or category" /></label>
                  <label><span>Category</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
                  <label><span>Stock status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{['In Stock', 'Low Stock', 'Out of Stock', 'Expiring Soon', 'Unavailable'].map((status) => <option key={status}>{status}</option>)}</select></label>
                </section>

                {!filteredItems.length ? <EmptyState title={items.length ? 'No inventory items match these filters' : 'No inventory items yet'} description={items.length ? 'Adjust the search or filters to see items.' : 'Add inventory items to track stock levels and alerts.'} />
                  : <section className="owner-inventory-grid" aria-label="Inventory items">
                    {filteredItems.map((item) => (
                      <article className="owner-inventory-card" key={item.id}>
                        <div className="owner-inventory-card-heading"><div><p>{item.category}</p><h2>{item.name}</h2></div><Badge variant={item.stockStatus === 'In Stock' ? 'success' : item.stockStatus === 'Low Stock' || item.stockStatus === 'Expiring Soon' ? 'warning' : 'default'}>{item.stockStatus}</Badge></div>
                        <div className="owner-inventory-quantity"><strong>{item.quantity} <span>{item.unit}</span></strong><small>Minimum {item.minimumLevel}{item.maximumLevel == null ? '' : ` · Maximum ${item.maximumLevel}`}</small></div>
                        <dl className="owner-inventory-meta"><div><dt>Supplier</dt><dd>{item.supplier || 'Not recorded'}</dd></div><div><dt>Expires</dt><dd>{item.expirationDate || 'Not tracked'}</dd></div></dl>
                        <div className="owner-inventory-actions">
                          {can('inventory.addStock') && <Button size="sm" variant="outline" onClick={() => { setActionItem(item); setActionType('received'); setActionQuantity(''); setActionReason(''); }}>Receive</Button>}
                          {can('inventory.deductStock') && <Button size="sm" variant="outline" onClick={() => { setActionItem(item); setActionType('usage'); setActionQuantity(''); setActionReason(''); }}>Record usage</Button>}
                          {can('inventory.addStock') && <Button size="sm" variant="ghost" onClick={() => { setActionItem(item); setActionType('returned'); setActionQuantity(''); setActionReason(''); }}>Return</Button>}
                          {can('inventory.adjustStock') && <Button size="sm" variant="ghost" onClick={() => { setActionItem(item); setActionType('adjusted'); setActionQuantity(String(item.quantity)); setActionReason(''); }}>Adjust</Button>}
                          {can('inventory.adjustStock') && <Button size="sm" variant="ghost" onClick={() => runAction(() => ownerService.markInventoryUnavailable(item.id, item.availability !== 'unavailable', restaurantId))}>{item.availability === 'unavailable' ? 'Restore item' : 'Mark unavailable'}</Button>}
                          {can('inventory.adjustStock') && <Button size="sm" variant="ghost" onClick={() => openEditItem(item)}>Edit details</Button>}
                          {can('inventory.viewHistory') && <Button size="sm" variant="ghost" onClick={() => toggleHistory(item)}>{historyItem === item.id ? 'Hide history' : 'Movement history'}</Button>}
                        </div>
                        {actionItem?.id === item.id && (
                          <form className="owner-stock-action-form" onSubmit={applyStockAction}>
                            <label><span>Stock action</span><select value={actionType} onChange={(event) => setActionType(event.target.value)}>{Object.entries(STOCK_ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                            <label><span>{actionType === 'adjusted' ? 'Set quantity' : 'Quantity'}</span><input type="number" min="0" step="any" value={actionQuantity} onChange={(event) => setActionQuantity(event.target.value)} required /></label>
                            <label><span>Reason (required for adjustment)</span><input value={actionReason} onChange={(event) => setActionReason(event.target.value)} required={actionType === 'adjusted'} /></label>
                            <div><Button size="sm" type="submit" loading={saving}>Save movement</Button><Button size="sm" variant="ghost" onClick={() => setActionItem(null)}>Cancel</Button></div>
                          </form>
                        )}
                        {historyItem === item.id && (
                          <div className="owner-inventory-history"><h3>Append-only movement history</h3>{history.length ? history.map((movement) => <div key={movement.id}><strong>{movement.type} · {movement.quantity > 0 ? '+' : ''}{movement.quantity} {item.unit}</strong><span>{movement.before} → {movement.after} · {new Date(movement.date).toLocaleString()}</span><span>{movement.responsibleUser}{movement.reason ? ` · ${movement.reason}` : ''}</span></div>) : <p>No stock movements recorded.</p>}</div>
                        )}
                      </article>
                    ))}
                  </section>}

                <section className="owner-menu-stock-section">
                  <div className="owner-inventory-form-heading"><h2>Tracked menu item stock</h2><p>These quantities are the same stock values used by Menu Management and customer availability.</p></div>
                  {!filteredMenuItems.length ? <EmptyState title={menuItems.length ? 'No tracked menu stock matches these filters' : 'No menu stock is tracked'} description={menuItems.length ? 'Adjust the search or filters to see tracked menu items.' : 'Set a stock quantity on a menu item to manage it here.'} />
                    : <div className="owner-menu-stock-grid">{filteredMenuItems.map((item) => {
                      const value = menuStockValues[item.id] || { quantity: String(item.stockQuantity), reason: '' };
                      return <article className="owner-menu-stock-card" key={item.id}>
                        <div><h3>{item.name}</h3><Badge variant={item.stockQuantity > 0 ? 'success' : 'default'}>{item.stockQuantity > 0 ? 'In Stock' : 'Sold Out'}</Badge></div>
                        <strong>{item.stockQuantity} available</strong>
                        {can('inventory.adjustStock') && <div className="owner-menu-stock-form">
                          <label><span>Set quantity</span><input type="number" min="0" step="1" value={value.quantity} onChange={(event) => setMenuStockValues((current) => ({ ...current, [item.id]: { ...value, quantity: event.target.value } }))} /></label>
                          <label><span>Reason</span><input value={value.reason} onChange={(event) => setMenuStockValues((current) => ({ ...current, [item.id]: { ...value, reason: event.target.value } }))} required /></label>
                          <Button size="sm" onClick={() => saveMenuStock(item)} loading={saving}>Update stock</Button>
                        </div>}
                      </article>;
                    })}</div>}
                </section>
              </>
            )}
      </div>
    </OwnerLayout>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { EmptyState, ErrorState, LoadingSpinner } from '../../../components/feedback';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import { normalizeMenuCategories, normalizeMenuItem } from '../menu/menuData';
import {
  filterInventoryMenuItems,
  getInventoryMenuAlertCounts,
  getMenuStockDisplay,
  groupInventoryMenuItems,
  INVENTORY_MENU_DISPLAY,
  MENU_STOCK_ACTION,
  MENU_STOCK_FILTER,
  MENU_STOCK_STATUS,
} from './inventoryMenuDisplayConfig';
import './OwnerInventoryPage.css';

const EMPTY_ITEM = INVENTORY_MENU_DISPLAY.defaults.ingredientItem;

export default function OwnerInventoryPage() {
  const access = useRestaurantAccess();
  const restaurantId = access.selectedRestaurantId;
  const navigate = useNavigate();
  const [_items, setItems] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState(INVENTORY_MENU_DISPLAY.defaults.settings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(MENU_STOCK_FILTER.ALL);
  const [statusFilter, setStatusFilter] = useState(MENU_STOCK_FILTER.ALL);
  const [alertOnly, setAlertOnly] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [actionItem, setActionItem] = useState(null);
  const [actionType, setActionType] = useState(MENU_STOCK_ACTION.RECEIVE);
  const [actionQuantity, setActionQuantity] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionError, setActionError] = useState('');
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
        .map(normalizeMenuItem)
        .map(getMenuStockDisplay));
      setCategories(normalizeMenuCategories({
        categories: ownerService.getMenuCategories(restaurantId),
      }));
      setSettings(ownerService.getInventorySettings(restaurantId));
      if (historyItem) setHistory(ownerService.getInventoryMovements(restaurantId, historyItem));
    } catch (loadError) {
      setError(loadError.message || INVENTORY_MENU_DISPLAY.errors.load);
    } finally {
      setLoading(false);
    }
  }, [historyItem, restaurantId]);

  useEffect(() => {
    loadInventory();
    window.addEventListener('salo:demoStoreUpdated', loadInventory);
    return () => window.removeEventListener('salo:demoStoreUpdated', loadInventory);
  }, [loadInventory]);

  const filteredMenuItems = useMemo(() => filterInventoryMenuItems(menuItems, {
    search,
    category: categoryFilter,
    status: statusFilter,
    alertOnly,
  }), [alertOnly, categoryFilter, menuItems, search, statusFilter]);
  const sections = useMemo(
    () => groupInventoryMenuItems(categories, filteredMenuItems),
    [categories, filteredMenuItems],
  );
  const alertCounts = useMemo(() => getInventoryMenuAlertCounts(menuItems), [menuItems]);

  const runAction = (action) => {
    setError('');
    setSaving(true);
    try {
      action();
      loadInventory();
    } catch (actionError) {
      setError(actionError.message || INVENTORY_MENU_DISPLAY.errors.save);
    } finally {
      setSaving(false);
    }
  };

  const openNewItem = () => {
    setEditingItem(null);
    setItemForm(EMPTY_ITEM);
    setItemFormOpen(true);
  };

  const _openEditItem = (item) => {
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

  const openMenuStockAction = (item, type) => {
    setActionItem(item);
    setActionType(type);
    setActionQuantity(type === MENU_STOCK_ACTION.ADJUST && item.stockTracked ? String(item.stockQuantity) : '');
    setActionReason(type === MENU_STOCK_ACTION.RECEIVE
      ? INVENTORY_MENU_DISPLAY.labels.restockedReason
      : type === MENU_STOCK_ACTION.USAGE ? INVENTORY_MENU_DISPLAY.labels.usedReason : INVENTORY_MENU_DISPLAY.labels.adjustReason);
    setActionError('');
  };

  const applyMenuStockAction = (event) => {
    event.preventDefault();
    if (!actionItem) return;
    const quantity = Number(actionQuantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setActionError(INVENTORY_MENU_DISPLAY.labels.invalidQuantity);
      return;
    }
    if (actionType !== MENU_STOCK_ACTION.ADJUST && quantity <= 0) {
      setActionError(INVENTORY_MENU_DISPLAY.labels.quantityRequired);
      return;
    }
    if (!actionReason.trim()) {
      setActionError(INVENTORY_MENU_DISPLAY.labels.adjustmentReasonRequired);
      return;
    }
    const currentQuantity = actionItem.stockTracked ? actionItem.stockQuantity : 0;
    const nextQuantity = actionType === MENU_STOCK_ACTION.RECEIVE
      ? currentQuantity + quantity
      : actionType === MENU_STOCK_ACTION.USAGE ? currentQuantity - quantity : quantity;
    if (nextQuantity < 0) {
      setActionError(INVENTORY_MENU_DISPLAY.labels.usageExceedsStock);
      return;
    }

    runAction(() => {
      ownerService.updateMenuItemStock(actionItem.id, nextQuantity, actionReason.trim(), restaurantId);
      setActionItem(null);
      setActionQuantity('');
      setActionReason('');
      setActionError('');
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
      setError(historyError.message || INVENTORY_MENU_DISPLAY.errors.history);
    }
  };

  const toggleMenuAvailability = (item, restoreAvailability) => {
    const nextAvailability = restoreAvailability
      ? 'available'
      : 'temporarily_unavailable';
    runAction(() => {
      ownerService.updateMenuItem(item.id, { availability: nextAvailability }, restaurantId);
    });
  };

  const openMenuEditor = (item) => {
    navigate('/owner/menu', { state: { inventoryEditMenuItemId: item.id } });
  };

  const closeMoreMenu = (event) => {
    const menu = event.currentTarget.closest('details');
    if (menu) menu.open = false;
  };

  const toggleCategory = (categoryId) => {
    setCollapsedCategories((current) => ({
      ...current,
      [categoryId]: !current[categoryId],
    }));
  };

  return (
    <OwnerLayout>
      <div className="owner-inventory-page">
        <header className="owner-inventory-header">
          <div>
            <p className="owner-inventory-eyebrow">{INVENTORY_MENU_DISPLAY.page.eyebrow}</p>
            <h1>{INVENTORY_MENU_DISPLAY.page.title}</h1>
            <p>{INVENTORY_MENU_DISPLAY.page.description}</p>
          </div>
          {can('inventory.addStock') && <Button onClick={openNewItem}>{INVENTORY_MENU_DISPLAY.page.addIngredient}</Button>}
        </header>

        {error && <div className="owner-inventory-error" role="alert">{error}</div>}
        {loading ? <LoadingSpinner size="lg" label={INVENTORY_MENU_DISPLAY.page.loading} />
          : error && menuItems.length === 0 ? <ErrorState title={INVENTORY_MENU_DISPLAY.page.loadErrorTitle} description={error} onRetry={loadInventory} />
            : (
              <>
                {(alertCounts.low + alertCounts.out) > 0 && (
                  <section className="owner-inventory-alert-summary" aria-label={INVENTORY_MENU_DISPLAY.labels.inventoryAlerts}>
                    <p>{INVENTORY_MENU_DISPLAY.labels.alertSummary(alertCounts.low, alertCounts.out)}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAlertOnly((current) => !current);
                        setStatusFilter(MENU_STOCK_FILTER.ALL);
                      }}
                    >
                      {alertOnly ? INVENTORY_MENU_DISPLAY.labels.showAll : INVENTORY_MENU_DISPLAY.labels.showOnlyAlerts}
                    </Button>
                  </section>
                )}

                <section className="owner-inventory-settings" aria-label={INVENTORY_MENU_DISPLAY.settings.ariaLabel}>
                  <div>
                    <h2>{INVENTORY_MENU_DISPLAY.settings.title}</h2>
                    <p>{INVENTORY_MENU_DISPLAY.settings.description}</p>
                  </div>
                  <label>
                    <span>{INVENTORY_MENU_DISPLAY.settings.fieldLabel}</span>
                    <select
                      aria-label={INVENTORY_MENU_DISPLAY.settings.fieldAriaLabel}
                      value={settings.deductionMode}
                      disabled={!can('inventory.adjustStock')}
                      onChange={(event) => runAction(() => ownerService.setInventoryDeductionMode(event.target.value, restaurantId))}
                    >
                      {INVENTORY_MENU_DISPLAY.settings.modes.map((mode) => (
                        <option key={mode.value} value={mode.value}>{mode.label}</option>
                      ))}
                    </select>
                  </label>
                </section>

                {itemFormOpen && (
                  <form className="owner-inventory-form" onSubmit={saveItem}>
                    <div className="owner-inventory-form-heading">
                      <h2>{editingItem ? INVENTORY_MENU_DISPLAY.ingredientForm.editTitle : INVENTORY_MENU_DISPLAY.ingredientForm.addTitle}</h2>
                      <p>{INVENTORY_MENU_DISPLAY.ingredientForm.description}</p>
                    </div>
                    <div className="owner-inventory-form-grid">
                      <label>
                        <span>{INVENTORY_MENU_DISPLAY.ingredientForm.name}</span>
                        <input value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} required maxLength={INVENTORY_MENU_DISPLAY.ingredientForm.limits.name} />
                      </label>
                      <label>
                        <span>{INVENTORY_MENU_DISPLAY.ingredientForm.category}</span>
                        <input value={itemForm.category} onChange={(event) => setItemForm({ ...itemForm, category: event.target.value })} required maxLength={INVENTORY_MENU_DISPLAY.ingredientForm.limits.category} />
                      </label>
                      <label>
                        <span>{INVENTORY_MENU_DISPLAY.ingredientForm.unit}</span>
                        <input value={itemForm.unit} onChange={(event) => setItemForm({ ...itemForm, unit: event.target.value })} placeholder={INVENTORY_MENU_DISPLAY.ingredientForm.unitPlaceholder} required maxLength={INVENTORY_MENU_DISPLAY.ingredientForm.limits.unit} />
                      </label>
                      {!editingItem && (
                        <label>
                          <span>{INVENTORY_MENU_DISPLAY.ingredientForm.startingQuantity}</span>
                          <input type="number" min={INVENTORY_MENU_DISPLAY.minimumQuantity} step={INVENTORY_MENU_DISPLAY.quantityStep} value={itemForm.quantity} onChange={(event) => setItemForm({ ...itemForm, quantity: event.target.value })} />
                        </label>
                      )}
                      <label>
                        <span>{INVENTORY_MENU_DISPLAY.ingredientForm.minimumLevel}</span>
                        <input type="number" min={INVENTORY_MENU_DISPLAY.minimumQuantity} step={INVENTORY_MENU_DISPLAY.quantityStep} value={itemForm.minimumLevel} onChange={(event) => setItemForm({ ...itemForm, minimumLevel: event.target.value })} />
                      </label>
                      <label>
                        <span>{INVENTORY_MENU_DISPLAY.ingredientForm.maximumLevel}</span>
                        <input type="number" min={INVENTORY_MENU_DISPLAY.minimumQuantity} step={INVENTORY_MENU_DISPLAY.quantityStep} value={itemForm.maximumLevel} onChange={(event) => setItemForm({ ...itemForm, maximumLevel: event.target.value })} />
                      </label>
                      <label>
                        <span>{INVENTORY_MENU_DISPLAY.ingredientForm.supplier}</span>
                        <input value={itemForm.supplier} onChange={(event) => setItemForm({ ...itemForm, supplier: event.target.value })} />
                      </label>
                      <label>
                        <span>{INVENTORY_MENU_DISPLAY.ingredientForm.expirationDate}</span>
                        <input type="date" value={itemForm.expirationDate} onChange={(event) => setItemForm({ ...itemForm, expirationDate: event.target.value })} />
                      </label>
                    </div>
                    <div className="owner-inventory-form-actions">
                      <Button type="submit" loading={saving}>
                        {editingItem ? INVENTORY_MENU_DISPLAY.ingredientForm.save : INVENTORY_MENU_DISPLAY.ingredientForm.create}
                      </Button>
                      <Button variant="ghost" onClick={() => setItemFormOpen(false)}>{INVENTORY_MENU_DISPLAY.ingredientForm.cancel}</Button>
                    </div>
                  </form>
                )}

                <section className="owner-inventory-filters" aria-label={INVENTORY_MENU_DISPLAY.labels.stockFilters}>
                  <div className="owner-inventory-status-filters" role="group" aria-label={INVENTORY_MENU_DISPLAY.labels.stockFilters}>
                    {INVENTORY_MENU_DISPLAY.labels.filters.map((filter) => (
                      <button
                        className={statusFilter === filter.value && !alertOnly ? 'active' : ''}
                        type="button"
                        key={filter.value}
                        aria-pressed={statusFilter === filter.value && !alertOnly}
                        onClick={() => {
                          setStatusFilter(filter.value);
                          setAlertOnly(false);
                        }}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                  <label>
                    <span>{INVENTORY_MENU_DISPLAY.labels.search}</span>
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={INVENTORY_MENU_DISPLAY.labels.searchPlaceholder}
                    />
                  </label>
                  <label>
                    <span>{INVENTORY_MENU_DISPLAY.labels.category}</span>
                    <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                      <option value={MENU_STOCK_FILTER.ALL}>{INVENTORY_MENU_DISPLAY.labels.allCategories}</option>
                      {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                    </select>
                  </label>
                </section>

                {!sections.length
                  ? <EmptyState
                    title={menuItems.length ? INVENTORY_MENU_DISPLAY.labels.noItemsTitle : INVENTORY_MENU_DISPLAY.labels.emptyTitle}
                    description={menuItems.length ? INVENTORY_MENU_DISPLAY.labels.noItemsDescription : INVENTORY_MENU_DISPLAY.labels.emptyDescription}
                  />
                  : sections.map((section, sectionIndex) => {
                    const sectionAlerts = getInventoryMenuAlertCounts(section.items);
                    const alertCount = sectionAlerts.low + sectionAlerts.out;
                    const collapsed = Boolean(collapsedCategories[section.id]);
                    const sectionId = `owner-inventory-category-${sectionIndex}`;

                    return (
                      <section className="owner-inventory-category" key={section.id}>
                        <button
                          className="owner-inventory-category-heading"
                          type="button"
                          aria-expanded={!collapsed}
                          aria-controls={sectionId}
                          onClick={() => toggleCategory(section.id)}
                        >
                          <span className="owner-inventory-category-name">{section.name}</span>
                          <span className="owner-inventory-category-count">{INVENTORY_MENU_DISPLAY.labels.itemCount(section.items.length)}</span>
                          {alertCount > 0 && <span className="owner-inventory-category-alert">{INVENTORY_MENU_DISPLAY.labels.needsAttention(alertCount)}</span>}
                        </button>
                        {!collapsed && (
                          <div className="owner-inventory-grid" id={sectionId}>
                            {section.items.map((item) => {
                              const status = item.inventoryStockStatus;
                              const isOutOfStock = status === MENU_STOCK_STATUS.OUT;
                              const isLowStock = status === MENU_STOCK_STATUS.LOW;
                              const availabilityCanRestore = item.availability !== 'available' && !isOutOfStock;
                              const availabilityBlocked = isOutOfStock && item.availability !== 'available';
                              const availabilityLabel = availabilityBlocked
                                ? INVENTORY_MENU_DISPLAY.labels.unavailable
                                : availabilityCanRestore
                                  ? INVENTORY_MENU_DISPLAY.labels.restoreAvailability
                                  : INVENTORY_MENU_DISPLAY.labels.markUnavailable;
                              const canEditMenuItem = [
                                'menu.items.edit',
                                'menu.pricing.manage',
                                'menu.photos.manage',
                                'menu.availability.manage',
                                'menu.addons.manage',
                              ].some(can);

                              return (
                                <article className={`owner-inventory-card owner-inventory-card--${status}`} key={item.id}>
                                  <div className="owner-inventory-card-heading">
                                    <div>
                                      <p>{item.category}</p>
                                      <h2>{item.name}</h2>
                                    </div>
                                    <div className="owner-inventory-card-status">
                                      {isLowStock && <span className="owner-inventory-warning-icon" aria-hidden="true">!</span>}
                                      <Badge variant={status === MENU_STOCK_STATUS.LOW ? 'warning' : status === MENU_STOCK_STATUS.OUT ? 'error' : status === MENU_STOCK_STATUS.IN ? 'success' : 'default'}>
                                        {INVENTORY_MENU_DISPLAY.labels.statuses[status]}
                                      </Badge>
                                    </div>
                                  </div>

                                  <div className="owner-inventory-quantity">
                                    {item.stockTracked ? (
                                      <>
                                        <strong>{item.stockQuantity} <span>{item.stockDisplayUnit}</span></strong>
                                        <small>{INVENTORY_MENU_DISPLAY.labels.lowStockAlertAt(item.stockThreshold)}</small>
                                      </>
                                    ) : <strong className="owner-inventory-untracked">{INVENTORY_MENU_DISPLAY.labels.statuses.untracked}</strong>}
                                  </div>

                                  <div className="owner-inventory-card-actions">
                                    <div className="owner-inventory-actions">
                                      {can('inventory.adjustStock') && (
                                        <>
                                          <Button size="sm" variant="outline" onClick={() => openMenuStockAction(item, MENU_STOCK_ACTION.RECEIVE)}>
                                            {INVENTORY_MENU_DISPLAY.labels.receive}
                                          </Button>
                                          <Button size="sm" variant="outline" disabled={!item.stockTracked} onClick={() => openMenuStockAction(item, MENU_STOCK_ACTION.USAGE)}>
                                            {INVENTORY_MENU_DISPLAY.labels.recordUsage}
                                          </Button>
                                        </>
                                      )}
                                    </div>

                                    <details className="owner-inventory-more">
                                      <summary aria-label={INVENTORY_MENU_DISPLAY.labels.more}>⋮</summary>
                                      <div className="owner-inventory-more-menu">
                                        {can('inventory.adjustStock') && (
                                          <Button size="sm" variant="ghost" onClick={(event) => {
                                            openMenuStockAction(item, MENU_STOCK_ACTION.ADJUST);
                                            closeMoreMenu(event);
                                          }}>
                                            {INVENTORY_MENU_DISPLAY.labels.adjust}
                                          </Button>
                                        )}
                                        {can('menu.availability.manage') && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={availabilityBlocked}
                                            onClick={(event) => {
                                              toggleMenuAvailability(item, availabilityCanRestore);
                                              closeMoreMenu(event);
                                            }}
                                          >
                                            {availabilityLabel}
                                          </Button>
                                        )}
                                        {canEditMenuItem && (
                                          <Button size="sm" variant="ghost" onClick={() => openMenuEditor(item)}>
                                            {INVENTORY_MENU_DISPLAY.labels.editDetails}
                                          </Button>
                                        )}
                                        {can('inventory.viewHistory') && (
                                          <Button size="sm" variant="ghost" onClick={(event) => {
                                            toggleHistory(item);
                                            closeMoreMenu(event);
                                          }}>
                                            {historyItem === item.id ? INVENTORY_MENU_DISPLAY.labels.hideHistory : INVENTORY_MENU_DISPLAY.labels.movementHistory}
                                          </Button>
                                        )}
                                      </div>
                                    </details>
                                  </div>

                                  {actionItem?.id === item.id && (
                                    <form className="owner-stock-action-form" onSubmit={applyMenuStockAction}>
                                      <label>
                                        <span>{actionType === MENU_STOCK_ACTION.ADJUST ? INVENTORY_MENU_DISPLAY.labels.setQuantity : INVENTORY_MENU_DISPLAY.labels.quantity}</span>
                                        <input
                                          type="number"
                                          min={INVENTORY_MENU_DISPLAY.minimumQuantity}
                                          step={INVENTORY_MENU_DISPLAY.quantityStep}
                                          value={actionQuantity}
                                          onChange={(event) => {
                                            setActionQuantity(event.target.value);
                                            setActionError('');
                                          }}
                                          required
                                        />
                                      </label>
                                      <label>
                                        <span>{INVENTORY_MENU_DISPLAY.labels.reason}</span>
                                        <input
                                          value={actionReason}
                                          onChange={(event) => setActionReason(event.target.value)}
                                          required
                                        />
                                      </label>
                                      {actionError && <p className="owner-stock-action-error" role="alert">{actionError}</p>}
                                      <div>
                                        <Button size="sm" type="submit" loading={saving}>{INVENTORY_MENU_DISPLAY.labels.saveMovement}</Button>
                                        <Button size="sm" variant="ghost" onClick={() => {
                                          setActionItem(null);
                                          setActionError('');
                                        }}>
                                          {INVENTORY_MENU_DISPLAY.labels.cancel}
                                        </Button>
                                      </div>
                                    </form>
                                  )}

                                  {historyItem === item.id && (
                                    <div className="owner-inventory-history">
                                      <h3>{INVENTORY_MENU_DISPLAY.labels.historyTitle}</h3>
                                      {history.length ? history.map((movement) => (
                                        <div key={movement.id}>
                                          <strong>{movement.type} · {movement.quantity > 0 ? '+' : ''}{movement.quantity} {item.stockDisplayUnit}</strong>
                                          <span>{movement.before} → {movement.after} · {new Date(movement.date).toLocaleString()}</span>
                                          <span>{movement.responsibleUser}{movement.reason ? ` · ${movement.reason}` : ''}</span>
                                        </div>
                                      )) : <p>{INVENTORY_MENU_DISPLAY.labels.noHistory}</p>}
                                    </div>
                                  )}
                                </article>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })}
              </>
            )}
      </div>
    </OwnerLayout>
  );
}

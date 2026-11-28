import { useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import ItemModal from './ItemModal';
import { getMenuCustomerPrice } from '../../restaurant/menu/menuData';
import './ReservationPreOrderSection.css';

function formatPeso(amount) {
  return `₱${Number(amount || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildLineKey(item) {
  const optIds = (item.addOns || [])
    .map((ao) => Number(ao.id ?? ao.addOnOptionId ?? 0))
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
    .join(',');
  const note = String(item.specialInstructions || '').trim();
  return `${Number(item.menuItemId)}:${optIds}:${note}`;
}

export default function ReservationPreOrderSection({
  restaurant,
  menuLoading = false,
  preOrderItems = [],
  onChangeItems,
  preOrderNotes = '',
  onChangeNotes,
}) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeItem, setActiveItem] = useState(null);

  const menuItems = useMemo(() => {
    const rawMenu = Array.isArray(restaurant?.menu) ? restaurant.menu : [];
    return rawMenu.filter((item) => item && item.availability !== 'hidden');
  }, [restaurant?.menu]);

  const categories = useMemo(() => {
    const set = new Set();
    menuItems.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return ['All', ...Array.from(set)];
  }, [menuItems]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        String(item.name || '').toLowerCase().includes(q) ||
        String(item.description || '').toLowerCase().includes(q) ||
        String(item.category || '').toLowerCase().includes(q)
      );
    });
  }, [menuItems, search, selectedCategory]);

  const handleAddFromModal = (payload) => {
    const addOns = (payload.selectedAddOns || []).map((ao) => ({
      id: Number(ao.id ?? ao.addOnOptionId ?? 0),
      groupName: ao.groupName || '',
      name: ao.name || ao.optionName || '',
      price: Number(ao.price ?? ao.additionalPrice ?? 0),
    }));
    const addOnUnit = addOns.reduce((sum, ao) => sum + ao.price, 0);
    const unitPrice = Number(payload.price || 0) + addOnUnit;

    const newItem = {
      lineKey: '',
      menuItemId: Number(payload.id),
      name: payload.name,
      image: payload.image || null,
      basePrice: Number(payload.price || 0),
      unitPrice,
      quantity: Number(payload.quantity || 1),
      addOns,
      addOnOptionIds: addOns.map((ao) => ao.id).filter((n) => n > 0),
      specialInstructions: String(payload.specialInstructions || '').trim(),
    };
    newItem.lineKey = buildLineKey(newItem);

    const existingIdx = preOrderItems.findIndex((entry) => entry.lineKey === newItem.lineKey);
    if (existingIdx >= 0) {
      const next = [...preOrderItems];
      next[existingIdx] = {
        ...next[existingIdx],
        quantity: Math.min(50, next[existingIdx].quantity + newItem.quantity),
      };
      onChangeItems(next);
    } else {
      onChangeItems([...preOrderItems, newItem]);
    }
  };

  const handleQuickAdd = (item) => {
    if (item.availability !== 'available') return;
    const hasRequired =
      Array.isArray(item.addOns) &&
      item.addOns.some((g) => g.isAvailable !== false && (Boolean(g.required) || Number(g.minSelection || 0) > 0));
    if (hasRequired || (Array.isArray(item.addOns) && item.addOns.length > 0)) {
      setActiveItem(item);
      return;
    }

    const basePrice = getMenuCustomerPrice(item);
    handleAddFromModal({
      id: item.id,
      name: item.name,
      price: basePrice,
      quantity: 1,
      selectedAddOns: [],
      specialInstructions: '',
      image: item.photo || item.image || null,
    });
  };

  const updateLineQty = (lineKey, delta) => {
    const next = preOrderItems
      .map((entry) =>
        entry.lineKey === lineKey
          ? { ...entry, quantity: Math.min(50, entry.quantity + delta) }
          : entry,
      )
      .filter((entry) => entry.quantity > 0);
    onChangeItems(next);
  };

  const removeLine = (lineKey) => {
    onChangeItems(preOrderItems.filter((entry) => entry.lineKey !== lineKey));
  };

  const totalItemsCount = preOrderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const subtotal = preOrderItems.reduce(
    (sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
    0,
  );

  return (
    <div className="rpo-container">
      <ItemModal
        open={Boolean(activeItem)}
        onClose={() => setActiveItem(null)}
        item={activeItem}
        restaurant={restaurant}
        onAddOverride={handleAddFromModal}
      />

      <div className="rpo-menu-panel">
        <div className="rpo-search-row">
          <input
            type="search"
            className="rpo-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${restaurant?.name || 'restaurant'} menu…`}
            aria-label="Search pre-order menu items"
          />
        </div>

        {categories.length > 1 && (
          <div className="rpo-categories" role="tablist" aria-label="Menu categories">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`rpo-cat-pill${selectedCategory === cat ? ' is-active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {menuLoading ? (
          <div style={{ padding: 'var(--space-4)', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
            Loading menu items…
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: 'var(--space-4)', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
            {menuItems.length === 0
              ? 'This restaurant has no published menu items available for pre-ordering right now.'
              : 'No menu items match your search.'}
          </div>
        ) : (
          <div className="rpo-items-list">
            {filteredItems.map((item) => {
              const isAvailable = item.availability === 'available';
              const price = getMenuCustomerPrice(item);
              const photo = item.photo || item.image;
              const hasOptions = Array.isArray(item.addOns) && item.addOns.length > 0;

              return (
                <div
                  key={item.id}
                  className={`rpo-item-row${!isAvailable ? ' is-unavailable' : ''}`}
                >
                  <div className="rpo-item-thumb">
                    {photo ? (
                      <img src={photo} alt={item.name} />
                    ) : (
                      <span>{String(item.name || '?').slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="rpo-item-info">
                    <h4 className="rpo-item-name">{item.name}</h4>
                    {item.description && <p className="rpo-item-desc">{item.description}</p>}
                    <div className="rpo-item-meta">
                      <span>{formatPeso(price)}</span>
                      {!isAvailable && (
                        <Badge variant="error">
                          {item.availability === 'sold_out' ? 'Sold Out' : 'Unavailable'}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <Button
                      size="sm"
                      variant={isAvailable ? 'primary' : 'secondary'}
                      disabled={!isAvailable}
                      onClick={() => handleQuickAdd(item)}
                    >
                      {hasOptions ? 'Customize' : 'Add'}
                    </Button>
                    {isAvailable && !hasOptions && (
                      <button
                        type="button"
                        onClick={() => setActiveItem(item)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        Details / Notes
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rpo-cart-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
            Dine-In Pre-Order ({totalItemsCount})
          </strong>
          <Badge variant="info">For Dine-In</Badge>
        </div>

        <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
          Optional: selected dishes will be linked to this reservation and prepared for your arrival.
        </p>

        {preOrderItems.length === 0 ? (
          <div style={{ padding: 'var(--space-3)', textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', border: '1px dashed var(--border-primary)', borderRadius: 'var(--radius-sm)' }}>
            No pre-ordered items yet. You can skip this step and reserve your table only.
          </div>
        ) : (
          <div className="rpo-cart-items">
            {preOrderItems.map((entry) => (
              <div key={entry.lineKey} className="rpo-cart-row">
                <div className="rpo-cart-row-top">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)' }}>
                      {entry.name}
                    </div>
                    {entry.addOns?.length > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {entry.addOns.map((ao) => ao.name).join(', ')}
                      </div>
                    )}
                    {entry.specialInstructions && (
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        Note: {entry.specialInstructions}
                      </div>
                    )}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)' }}>
                    {formatPeso(entry.unitPrice * entry.quantity)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="rpo-qty-controls">
                    <button
                      type="button"
                      className="rpo-qty-btn"
                      aria-label={`Decrease quantity of ${entry.name}`}
                      onClick={() => updateLineQty(entry.lineKey, -1)}
                    >
                      −
                    </button>
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, minWidth: 16, textAlign: 'center' }}>
                      {entry.quantity}
                    </span>
                    <button
                      type="button"
                      className="rpo-qty-btn"
                      aria-label={`Increase quantity of ${entry.name}`}
                      onClick={() => updateLineQty(entry.lineKey, 1)}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(entry.lineKey)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-error, #dc2626)',
                      fontSize: 'var(--font-size-xs)',
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <label
            htmlFor="rpo-notes-input"
            style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}
          >
            Kitchen / Pre-Order Notes (Optional)
          </label>
          <textarea
            id="rpo-notes-input"
            rows={2}
            value={preOrderNotes}
            onChange={(e) => onChangeNotes(e.target.value)}
            placeholder="e.g. Serve appetizers first when we arrive..."
            style={{
              width: '100%',
              padding: 'var(--space-2)',
              fontSize: 'var(--font-size-xs)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-primary)',
              background: 'var(--input-bg)',
              color: 'var(--text-primary)',
              resize: 'none',
            }}
          />
        </div>

        <div className="rpo-summary-box">
          <div className="rpo-summary-line">
            <span>Delivery Fee (Dine-in)</span>
            <span>{formatPeso(0)}</span>
          </div>
          <div className="rpo-summary-total">
            <span>Pre-Order Subtotal</span>
            <span>{formatPeso(subtotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

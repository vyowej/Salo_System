import { useState, useMemo, useEffect } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import { useCart } from '../../../hooks/useCart';
import RestaurantImage from './RestaurantImage';
import { getMenuCustomerPrice, normalizeMenuItem } from '../../restaurant/menu/menuData';

export default function ItemModal({ open, onClose, item, restaurant, orderingDisabled = false, orderingDisabledMessage = '' }) {
  const { addItem } = useCart();

  const [quantity, setQuantity] = useState(1);
  const [selectedAddOns, setSelectedAddOns] = useState({});
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [error, setError] = useState(null);
  const menuItem = useMemo(() => item ? normalizeMenuItem(item) : null, [item]);
  const itemId = item?.id;

  useEffect(() => {
    if (!open || !itemId) return;
    setQuantity(1);
    setSelectedAddOns({});
    setSpecialInstructions('');
    setError(null);
  }, [open, itemId]);

  // Flattened list of selected add-ons
  const flattenedAddOns = useMemo(() => {
    return Object.values(selectedAddOns).flat();
  }, [selectedAddOns]);

  const addOnsTotal = useMemo(
    () => flattenedAddOns.reduce((acc, opt) => acc + Number(opt.price || 0), 0),
    [flattenedAddOns],
  );

  if (!menuItem) return null;

  const groupKey = (group) => group.id || group.name;

  const handleOptionToggle = (group, option) => {
    if (!option.isAvailable) return;
    const key = groupKey(group);
    const groupName = group.name;
    const maxSelection = Number(group.maxSelection || 1);
    const current = selectedAddOns[key] || [];
    const exists = current.some((selected) => selected.name === option.name);
    if (!exists && maxSelection > 1 && current.length >= maxSelection) {
      setError(`Choose no more than ${maxSelection} options for "${groupName}".`);
      return;
    }
    const next = exists
      ? current.filter((selected) => selected.name !== option.name)
      : maxSelection === 1 ? [option] : [...current, option];
    setSelectedAddOns((previous) => ({ ...previous, [key]: next }));
    setError('');
  };

  const basePrice = getMenuCustomerPrice(menuItem);
  const unitTotal = basePrice + addOnsTotal;
  const grandItemTotal = unitTotal * quantity;

  const handleAddToCart = () => {
    // Validate required groups
    if (menuItem.addOns) {
      for (const group of menuItem.addOns.filter((entry) => entry.isAvailable)) {
        const availableOptionCount = group.options.filter((option) => option.isAvailable).length;
        if (Number(group.minSelection || 0) > availableOptionCount) {
          setError(`"${group.name}" has no available options right now.`);
          return;
        }
        const selectedCount = selectedAddOns[groupKey(group)]?.length || 0;
        if (selectedCount < Number(group.minSelection || 0)) {
          setError(`Choose at least ${group.minSelection} option${group.minSelection === 1 ? '' : 's'} for "${group.name}".`);
          return;
        }
        if (selectedCount > Number(group.maxSelection || 1)) {
          setError(`Choose no more than ${group.maxSelection} options for "${group.name}".`);
          return;
        }
      }
    }

    addItem({
      id: menuItem.id,
      name: menuItem.name,
      price: basePrice,
      quantity,
      selectedAddOns: flattenedAddOns,
      specialInstructions: specialInstructions.trim(),
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      deliveryFee: restaurant.deliveryFee,
      image: menuItem.photo || menuItem.image,
    });

    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title=""
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 'var(--space-3)' }}>
          {/* Quantity selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
              style={{ width: 32, padding: 0 }}
            >
              −
            </Button>
            <span style={{ fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{quantity}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setQuantity(quantity + 1)}
              style={{ width: 32, padding: 0 }}
            >
              +
            </Button>
          </div>

          <Button
            variant="primary"
            size="md"
            onClick={handleAddToCart}
            disabled={orderingDisabled}
            style={{ flex: 1, maxWidth: 260 }}
          >
            {orderingDisabled ? 'Ordering unavailable' : `Add to Multi-Cart · ₱${grandItemTotal.toLocaleString()}`}
          </Button>
        </div>
      }
    >
      <div>
        {orderingDisabled && (
          <p role="status" style={{ margin: '0 0 var(--space-3)', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {orderingDisabledMessage}
          </p>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', marginBottom: 'var(--space-4)' }}>
          <div style={{
            width: 64,
            height: 64,
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            flexShrink: 0,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {menuItem.photo ? (
              <RestaurantImage image={menuItem.photo} alt={menuItem.photo.alt || menuItem.name} style={{ position: 'absolute', inset: 0, borderRadius: 'var(--radius-lg)' }} />
            ) : (menuItem.image || '🍲')}
          </div>

          <div>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
              {menuItem.name}
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {menuItem.description}
            </p>
            <p style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--accent)', marginTop: 4 }}>
              {menuItem.discountedPrice && <del style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginRight: 6 }}>₱{menuItem.price.toLocaleString()}</del>}
              ₱{basePrice.toLocaleString()}
            </p>
          </div>
        </div>

        {error && (
          <div style={{
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--status-error-bg)',
            color: 'var(--status-error-text)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            marginBottom: 'var(--space-3)',
          }}>
            {error}
          </div>
        )}

        {/* Add-on groups */}
        {menuItem.addOns?.filter((group) => group.isAvailable).map((group) => (
          <div key={groupKey(group)} style={{ marginBottom: 'var(--space-5)', borderTop: '1px solid var(--border-secondary)', paddingTop: 'var(--space-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{group.name}</span>
              <span style={{
                fontSize: 10,
                textTransform: 'uppercase',
                fontWeight: 700,
                color: group.required ? 'var(--accent)' : 'var(--text-muted)'
              }}>
                {Number(group.minSelection) > 0 ? `Choose at least ${group.minSelection}` : 'Optional'} · Max {group.maxSelection}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {group.options.map((opt) => {
                const isSelected = (selectedAddOns[groupKey(group)] || []).some((selected) => selected.name === opt.name);
                const singleChoice = Number(group.maxSelection) === 1;

                return (
                  <label
                    key={opt.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--border-primary)',
                      background: isSelected ? 'var(--accent-subtle)' : 'var(--surface-primary)',
                      cursor: opt.isAvailable ? 'pointer' : 'not-allowed',
                      fontSize: 'var(--font-size-sm)',
                      opacity: opt.isAvailable ? 1 : 0.55,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <input
                        type={singleChoice ? 'radio' : 'checkbox'}
                        name={groupKey(group)}
                        checked={isSelected}
                        disabled={!opt.isAvailable}
                        onChange={() => handleOptionToggle(group, opt)}
                      />
                      <span>{opt.name}{!opt.isAvailable && ' · Unavailable'}</span>
                    </div>
                    <span style={{ fontWeight: 600, color: opt.price > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {opt.price > 0 ? `+₱${opt.price}` : 'Free'}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        {/* Special Instructions */}
        <div style={{ borderTop: '1px solid var(--border-secondary)', paddingTop: 'var(--space-3)' }}>
          <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Special Cooking Instructions (Optional)
          </label>
          <textarea
            placeholder="e.g. Less spicy, gravy separated, allergy notices..."
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            rows={2}
            style={{
              width: '100%',
              padding: 'var(--space-2)',
              fontSize: 'var(--font-size-sm)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-primary)',
              background: 'var(--input-bg)',
              color: 'var(--text-primary)',
              resize: 'none',
              outline: 'none',
            }}
          />
        </div>
      </div>
    </Modal>
  );
}

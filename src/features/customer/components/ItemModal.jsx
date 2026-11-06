import { useState, useMemo } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import { useCart } from '../../../hooks/useCart';

export default function ItemModal({ open, onClose, item, restaurant }) {
  const { addItem } = useCart();

  const [quantity, setQuantity] = useState(1);
  const [selectedAddOns, setSelectedAddOns] = useState({});
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [error, setError] = useState(null);

  // Flattened list of selected add-ons
  const flattenedAddOns = useMemo(() => {
    return Object.values(selectedAddOns).flat();
  }, [selectedAddOns]);

  const addOnsTotal = useMemo(() => {
    return flattenedAddOns.reduce((acc, opt) => acc + (opt.price || 0), 0);
  }, [flattenedAddOns]);

  if (!item) return null;

  // Handle single-select (e.g. required radio group)
  const handleSingleSelect = (groupName, option) => {
    setSelectedAddOns((prev) => ({
      ...prev,
      [groupName]: [option],
    }));
    setError(null);
  };

  // Handle multi-select (e.g. optional checkboxes)
  const handleMultiToggle = (groupName, option) => {
    setSelectedAddOns((prev) => {
      const current = prev[groupName] || [];
      const exists = current.some((o) => o.name === option.name);
      if (exists) {
        return { ...prev, [groupName]: current.filter((o) => o.name !== option.name) };
      }
      return { ...prev, [groupName]: [...current, option] };
    });
    setError(null);
  };

  const unitTotal = item.price + addOnsTotal;
  const grandItemTotal = unitTotal * quantity;

  const handleAddToCart = () => {
    // Validate required groups
    if (item.addOns) {
      for (const group of item.addOns) {
        if (group.required && (!selectedAddOns[group.name] || selectedAddOns[group.name].length === 0)) {
          setError(`Please select a choice for "${group.name}".`);
          return;
        }
      }
    }

    addItem({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity,
      selectedAddOns: flattenedAddOns,
      specialInstructions: specialInstructions.trim(),
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      deliveryFee: restaurant.deliveryFee,
      image: item.image,
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
            style={{ flex: 1, maxWidth: 260 }}
          >
            Add to Multi-Cart · ₱{grandItemTotal.toLocaleString()}
          </Button>
        </div>
      }
    >
      <div>
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
          }}>
            {item.image}
          </div>

          <div>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
              {item.name}
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {item.description}
            </p>
            <p style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--accent)', marginTop: 4 }}>
              ₱{item.price.toLocaleString()}
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
        {item.addOns && item.addOns.map((group) => (
          <div key={group.name} style={{ marginBottom: 'var(--space-5)', borderTop: '1px solid var(--border-secondary)', paddingTop: 'var(--space-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{group.name}</span>
              <span style={{
                fontSize: 10,
                textTransform: 'uppercase',
                fontWeight: 700,
                color: group.required ? 'var(--accent)' : 'var(--text-muted)'
              }}>
                {group.required ? 'Required' : 'Optional'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {group.options.map((opt) => {
                const isSelected = group.required
                  ? selectedAddOns[group.name]?.[0]?.name === opt.name
                  : (selectedAddOns[group.name] || []).some((o) => o.name === opt.name);

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
                      cursor: 'pointer',
                      fontSize: 'var(--font-size-sm)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <input
                        type={group.required ? 'radio' : 'checkbox'}
                        name={group.name}
                        checked={isSelected}
                        onChange={() => {
                          if (group.required) {
                            handleSingleSelect(group.name, opt);
                          } else {
                            handleMultiToggle(group.name, opt);
                          }
                        }}
                      />
                      <span>{opt.name}</span>
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

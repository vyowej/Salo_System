import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useCart } from '../../../hooks/useCart';
import useAddresses from '../../../hooks/useAddresses';
import { INITIAL_RESTAURANTS } from '../../../services/customerService';
import Button from '../../../components/common/Button';
import RestaurantImage from '../components/RestaurantImage';
import { checkAddressCoverage } from '../utils/deliveryCoverage';
import './CartPage.css';

export default function CartPage() {
  const navigate = useNavigate();
  const {
    restaurantGroups,
    itemsSubtotal,
    totalDeliveryFees,
    grandTotal,
    updateQuantity,
    removeItem,
    clearCart,
    setRestaurantFulfillment,
    setRestaurantAddress,
    setRestaurantAddressMode,
    setItemAddress,
    setAllRestaurantsAddress,
  } = useCart();

  const { addresses: savedAddresses } = useAddresses();

  // Highlight state for problem sub-orders
  const [highlightedSuborderId, setHighlightedSuborderId] = useState(null);

  // Modal states for switching back to single address mode
  const [switchModeModal, setSwitchModeModal] = useState({
    isOpen: false,
    restaurantId: null,
    targetAddress: null,
  });

  // Modal state for "Use the same address for all restaurants"
  const [allSameAddressModal, setAllSameAddressModal] = useState({
    isOpen: false,
    selectedAddressId: savedAddresses[0]?.id || '',
  });

  // Calculate validation issues
  const validationIssues = [];
  restaurantGroups.forEach((group, gIdx) => {
    if (group.fulfillment !== 'delivery') return;
    const letter = String.fromCharCode(65 + gIdx);
    const restaurant = INITIAL_RESTAURANTS.find((r) => r.id === group.restaurantId);

    if (group.addressMode === 'multiple') {
      const missingItems = group.items.filter((i) => !i.deliveryAddress);
      if (missingItems.length > 0) {
        validationIssues.push({
          groupIndex: gIdx,
          restaurantId: group.restaurantId,
          elementId: `suborder-card-${group.restaurantId}`,
          message: `Sub-order ${letter}: choose an address for ${missingItems.length} ${missingItems.length === 1 ? 'item' : 'items'}`,
        });
      } else {
        const uncovered = group.items.find(
          (i) => !checkAddressCoverage(restaurant, i.deliveryAddress).isCovered
        );
        if (uncovered) {
          validationIssues.push({
            groupIndex: gIdx,
            restaurantId: group.restaurantId,
            elementId: `suborder-card-${group.restaurantId}`,
            message: `Sub-order ${letter}: "${uncovered.name}" address not covered by restaurant`,
          });
        }
      }
    } else {
      if (!group.deliveryAddress) {
        validationIssues.push({
          groupIndex: gIdx,
          restaurantId: group.restaurantId,
          elementId: `suborder-card-${group.restaurantId}`,
          message: `Sub-order ${letter}: choose a delivery address`,
        });
      } else {
        const coverage = checkAddressCoverage(restaurant, group.deliveryAddress);
        if (!coverage.isCovered) {
          validationIssues.push({
            groupIndex: gIdx,
            restaurantId: group.restaurantId,
            elementId: `suborder-card-${group.restaurantId}`,
            message: `Sub-order ${letter}: address not covered by restaurant`,
          });
        }
      }
    }
  });

  const isCheckoutBlocked = validationIssues.length > 0;
  const firstIssue = validationIssues[0] || null;

  const scrollToProblem = () => {
    if (!firstIssue) return;
    const el = document.getElementById(firstIssue.elementId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedSuborderId(firstIssue.restaurantId);
      setTimeout(() => {
        setHighlightedSuborderId(null);
      }, 2200);
    }
  };

  const handleAddressSelectChange = (value, onSelect) => {
    if (value === '__add_new__') {
      navigate('/customer/addresses');
      return;
    }
    if (!value) {
      onSelect(null);
      return;
    }
    const matched = savedAddresses.find((a) => a.id === value);
    if (matched) {
      onSelect(matched);
    } else {
      onSelect(null);
    }
  };

  const handleSwitchToSingleMode = (group) => {
    const uniqueAddresses = new Set(
      group.items.map((i) => i.deliveryAddress?.id).filter(Boolean)
    );

    if (uniqueAddresses.size > 1) {
      const target = group.deliveryAddress || savedAddresses[0] || null;
      setSwitchModeModal({
        isOpen: true,
        restaurantId: group.restaurantId,
        targetAddress: target,
      });
    } else {
      setRestaurantAddressMode(group.restaurantId, 'single');
    }
  };

  const confirmSwitchToSingleMode = () => {
    if (switchModeModal.restaurantId) {
      setRestaurantAddressMode(switchModeModal.restaurantId, 'single');
    }
    setSwitchModeModal({ isOpen: false, restaurantId: null, targetAddress: null });
  };

  const confirmAllSameAddress = () => {
    const chosen = savedAddresses.find((a) => a.id === allSameAddressModal.selectedAddressId) || savedAddresses[0];
    if (chosen) {
      setAllRestaurantsAddress(chosen);
    }
    setAllSameAddressModal({ isOpen: false, selectedAddressId: '' });
  };

  if (restaurantGroups.length === 0) {
    return (
      <CustomerLayout>
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-16) var(--space-4)',
          maxWidth: 480,
          margin: '0 auto',
        }}>
          <div style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'var(--surface-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            margin: '0 auto var(--space-4)',
            color: 'var(--text-muted)',
          }}>
            🛒
          </div>
          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
            Your Multi-Cart is Empty
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 'var(--space-6)' }}>
            With SALO, you can combine dishes from different restaurants in one consolidated checkout. Explore participating kitchens now!
          </p>
          <Link to="/customer/restaurants" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="lg">
              Browse Restaurants
            </Button>
          </Link>
        </div>
      </CustomerLayout>
    );
  }

  const renderItemRow = (item, group) => (
    <div
      key={item.cartItemId}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: 0 }}>
        <RestaurantImage
          image={item.image}
          alt={`${item.name} photo`}
          fallback={typeof item.image === 'string' ? item.image : '🍽️'}
          style={{
            width: 40,
            height: 40,
            flex: '0 0 40px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-primary)',
            background: 'var(--surface-secondary)',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-secondary)',
          }}
        />
        <div>
          <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {item.name}
          </p>
          {item.selectedAddOns && item.selectedAddOns.length > 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {item.selectedAddOns.map((a) => a.name).join(', ')}
            </p>
          )}
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            ₱{item.unitTotal.toLocaleString()} each
          </p>

          {/* Compact per-item address selector in multiple address mode */}
          {group.fulfillment === 'delivery' && group.addressMode === 'multiple' && (
            <div className="salo-item-address-row">
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Deliver to:</span>
              <select
                value={item.deliveryAddress?.id || ''}
                onChange={(e) =>
                  handleAddressSelectChange(e.target.value, (addr) => setItemAddress(item.cartItemId, addr))
                }
                className="salo-item-address-select"
                aria-label={`Delivery address for ${item.name}`}
              >
                <option value="">-- Choose delivery address --</option>
                {savedAddresses.map((addr) => (
                  <option key={addr.id} value={addr.id}>
                    {addr.label} ({addr.city})
                  </option>
                ))}
                <option value="__add_new__">+ Add a new address...</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Quantity Stepper & Price */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', padding: '2px 4px' }}>
          <button
            type="button"
            onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0 4px', fontWeight: 700 }}
            aria-label={`Decrease quantity of ${item.name}`}
          >
            −
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, minWidth: 16, textAlign: 'center' }}>
            {item.quantity}
          </span>
          <button
            type="button"
            onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0 4px', fontWeight: 700 }}
            aria-label={`Increase quantity of ${item.name}`}
          >
            +
          </button>
        </div>

        <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', minWidth: 64, textAlign: 'right' }}>
          ₱{item.itemTotal.toLocaleString()}
        </span>

        <button
          type="button"
          onClick={() => removeItem(item.cartItemId)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
          title="Remove item"
          aria-label={`Remove ${item.name} from cart`}
        >
          ✕
        </button>
      </div>
    </div>
  );

  return (
    <CustomerLayout>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <Button variant="ghost" size="sm" onClick={clearCart} style={{ color: 'var(--salo-error)' }}>
          Empty Cart
        </Button>
      </div>

      {/* Top link: Use the same address for all restaurants */}
      {restaurantGroups.length > 1 && (
        <div className="salo-global-address-bar">
          <span>Consolidating {restaurantGroups.length} restaurant sub-orders</span>
          <button
            type="button"
            className="salo-global-address-link"
            onClick={() =>
              setAllSameAddressModal({
                isOpen: true,
                selectedAddressId: savedAddresses[0]?.id || '',
              })
            }
          >
            📍 Use the same address for all restaurants
          </button>
        </div>
      )}

      {isCheckoutBlocked && (
        <div style={{
          background: 'var(--status-warning-bg)',
          color: 'var(--status-warning-text)',
          border: '1px solid var(--status-warning-border, rgba(245, 158, 11, 0.4))',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3) var(--space-4)',
          marginBottom: 'var(--space-5)',
          fontSize: 'var(--font-size-sm)',
          fontWeight: 600,
        }}>
          Please choose a saved delivery address for each delivery sub-order before continuing to checkout.
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.25fr 0.75fr',
        gap: 'var(--space-8)',
        alignItems: 'start',
      }}>
        {/* ── Left Column: Restaurant Sub-Groups ──────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {restaurantGroups.map((group, gIdx) => {
            const isHighlighted = highlightedSuborderId === group.restaurantId;

            return (
              <div
                key={group.restaurantId}
                id={`suborder-card-${group.restaurantId}`}
                className={`salo-suborder-card ${isHighlighted ? 'salo-suborder-highlight' : ''}`}
                style={{
                  background: 'var(--surface-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-xl)',
                  padding: 'var(--space-6)',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                {/* Sub-order Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingBottom: 'var(--space-4)',
                  borderBottom: '1px solid var(--border-secondary)',
                  marginBottom: 'var(--space-4)',
                }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      SUB-ORDER {String.fromCharCode(65 + gIdx)}
                    </span>
                    <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {group.restaurantName}
                    </h2>
                  </div>

                  {/* Fulfillment Toggle per restaurant */}
                  <div style={{ display: 'flex', gap: 4, background: 'var(--bg-tertiary)', padding: 3, borderRadius: 'var(--radius-md)' }}>
                    <button
                      type="button"
                      onClick={() => setRestaurantFulfillment(group.restaurantId, 'delivery')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 11,
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        background: group.fulfillment === 'delivery' ? 'var(--surface-primary)' : 'transparent',
                        color: group.fulfillment === 'delivery' ? 'var(--text-primary)' : 'var(--text-muted)',
                        boxShadow: group.fulfillment === 'delivery' ? 'var(--shadow-xs)' : 'none',
                      }}
                    >
                      🛵 Delivery
                    </button>
                    <button
                      type="button"
                      onClick={() => setRestaurantFulfillment(group.restaurantId, 'pickup')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 11,
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        background: group.fulfillment === 'pickup' ? 'var(--surface-primary)' : 'transparent',
                        color: group.fulfillment === 'pickup' ? 'var(--text-primary)' : 'var(--text-muted)',
                        boxShadow: group.fulfillment === 'pickup' ? 'var(--shadow-xs)' : 'none',
                      }}
                    >
                      🛍️ Pickup
                    </button>
                  </div>
                </div>

                {/* Delivery Mode Toggle (Visible only when Delivery is chosen) */}
                {group.fulfillment === 'delivery' && (
                  <div>
                    <div className="salo-address-mode-toggle" role="tablist">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={group.addressMode !== 'multiple'}
                        className={`salo-address-mode-btn ${group.addressMode !== 'multiple' ? 'active' : ''}`}
                        onClick={() => handleSwitchToSingleMode(group)}
                      >
                        One address for all items
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={group.addressMode === 'multiple'}
                        className={`salo-address-mode-btn ${group.addressMode === 'multiple' ? 'active' : ''}`}
                        onClick={() => setRestaurantAddressMode(group.restaurantId, 'multiple')}
                      >
                        Different addresses per item
                      </button>
                    </div>

                    {/* Single Address Selector for whole restaurant */}
                    {group.addressMode !== 'multiple' && (
                      <div style={{
                        background: 'var(--surface-secondary)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-3) var(--space-4)',
                        marginBottom: 'var(--space-4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 'var(--font-size-xs)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span style={{ color: 'var(--accent)', fontSize: 16 }}>📍</span>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Deliver this restaurant to: </span>
                            <strong>
                              {group.deliveryAddress
                                ? `${group.deliveryAddress.label} (${group.deliveryAddress.city})`
                                : 'Select address'}
                            </strong>
                          </div>
                        </div>

                        <select
                          value={group.deliveryAddress?.id || ''}
                          onChange={(e) =>
                            handleAddressSelectChange(e.target.value, (matched) =>
                              setRestaurantAddress(group.restaurantId, matched)
                            )
                          }
                          className="salo-restaurant-address-select"
                          style={{
                            padding: '4px 8px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-primary)',
                            background: 'var(--input-bg)',
                            color: 'var(--text-primary)',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          aria-label={`Address for ${group.restaurantName}`}
                        >
                          <option value="">-- Choose delivery address --</option>
                          {savedAddresses.map((addr) => (
                            <option key={addr.id} value={addr.id}>
                              {addr.label}: {addr.street}, {addr.city}
                            </option>
                          ))}
                          <option value="__add_new__">+ Add a new address...</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-order Items List */}
                {group.fulfillment === 'delivery' && group.addressMode === 'multiple' ? (
                  /* Destination Address Groups */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {group.addressGroups.map((addrGroup) => (
                      <div key={addrGroup.addressId} className="salo-destination-group">
                        <div className="salo-destination-header">
                          <div className="salo-destination-info">
                            <span style={{ color: 'var(--accent)', fontSize: 14 }}>📍</span>
                            <span className="salo-destination-badge">
                              {addrGroup.address?.label || 'Destination'}
                            </span>
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                              {addrGroup.address
                                ? `${addrGroup.address.street}, ${addrGroup.address.city}`
                                : 'No address chosen'}
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                              ({addrGroup.items.length} {addrGroup.items.length === 1 ? 'item' : 'items'} · ₱{addrGroup.subtotal.toLocaleString()})
                            </span>
                          </div>
                          <span className="salo-destination-fee">
                            Delivery: ₱{addrGroup.deliveryFee}
                          </span>
                        </div>
                        <div className="salo-destination-items">
                          {addrGroup.items.map((item) => renderItemRow(item, group))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Single destination list */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {group.items.map((item) => renderItemRow(item, group))}
                  </div>
                )}

                {/* Sub-order Subtotal */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: 'var(--space-3)',
                  marginTop: 'var(--space-3)',
                  borderTop: '1px solid var(--border-secondary)',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--text-secondary)',
                }}>
                  <span>Food Subtotal ({group.items.length} items): ₱{group.subtotal.toLocaleString()}</span>
                  <span>
                    Delivery: {group.fulfillment === 'delivery' ? (
                      <>
                        ₱{group.deliveryFee.toLocaleString()}
                        {group.addressMode === 'multiple' && group.addressGroups.length > 1 && (
                          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                            ({group.addressGroups.length} destinations × ₱{group.baseDeliveryFee})
                          </span>
                        )}
                      </>
                    ) : (
                      <strong style={{ color: 'var(--salo-success)' }}>Free (Pickup)</strong>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Right Column: Order Summary ────────────────── */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          position: 'sticky',
          top: 'calc(var(--topbar-height) + var(--space-4))',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
            Consolidated Summary
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Food Subtotal</span>
              <span style={{ fontWeight: 600 }}>₱{itemsSubtotal.toLocaleString()}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Combined Delivery Fees</span>
              <span style={{ fontWeight: 600 }}>₱{totalDeliveryFees.toLocaleString()}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--salo-success)', fontSize: 'var(--font-size-xs)' }}>
              <span>Multi-vendor consolidated checkout</span>
              <span>Enabled ✓</span>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: 'var(--space-3)',
              borderTop: '1px solid var(--border-primary)',
              fontSize: 'var(--font-size-lg)',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}>
              <span>Total Payable</span>
              <span style={{ color: 'var(--accent)' }}>₱{grandTotal.toLocaleString()}</span>
            </div>
          </div>

          <div
            onClick={isCheckoutBlocked ? scrollToProblem : undefined}
            style={{ cursor: isCheckoutBlocked ? 'pointer' : 'default' }}
          >
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={isCheckoutBlocked}
              onClick={() => {
                if (isCheckoutBlocked) return;
                navigate('/customer/checkout');
              }}
              style={isCheckoutBlocked ? { opacity: 0.6, cursor: 'not-allowed', pointerEvents: 'none' } : undefined}
            >
              {isCheckoutBlocked ? 'Select Delivery Addresses First' : 'Proceed to Consolidated Checkout →'}
            </Button>

            {isCheckoutBlocked && firstIssue && (
              <div
                className="salo-checkout-hint"
                title="Click to scroll to this sub-order"
              >
                ⚠️ {firstIssue.message} (Click to locate)
              </div>
            )}
          </div>

          {isCheckoutBlocked && savedAddresses.length === 0 && (
            <Link to="/customer/addresses" style={{ textDecoration: 'none', display: 'block', marginTop: 'var(--space-3)' }}>
              <Button variant="outline" size="sm" fullWidth>
                Add a Saved Address
              </Button>
            </Link>
          )}

          <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 'var(--space-3)' }}>
            COD, GCash, Maya, and Card payment supported.
          </p>
        </div>
      </div>

      {/* Confirmation Modal: Switch back to Single Address Mode */}
      {switchModeModal.isOpen && (
        <div className="salo-cart-modal-backdrop" onClick={() => setSwitchModeModal({ isOpen: false, restaurantId: null, targetAddress: null })}>
          <div className="salo-cart-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="salo-cart-modal-title">Switch to One Address?</h3>
            <p className="salo-cart-modal-body">
              Items currently have different addresses. Switching to one address will set all items to{' '}
              <strong>
                {switchModeModal.targetAddress
                  ? `${switchModeModal.targetAddress.label} (${switchModeModal.targetAddress.city})`
                  : 'the restaurant address'}
              </strong>
              . Continue?
            </p>
            <div className="salo-cart-modal-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSwitchModeModal({ isOpen: false, restaurantId: null, targetAddress: null })}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={confirmSwitchToSingleMode}
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Apply same address to all restaurants */}
      {allSameAddressModal.isOpen && (
        <div className="salo-cart-modal-backdrop" onClick={() => setAllSameAddressModal({ isOpen: false, selectedAddressId: '' })}>
          <div className="salo-cart-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="salo-cart-modal-title">Use Same Address for All Restaurants?</h3>
            <p className="salo-cart-modal-body">
              Choose the delivery address to apply across all sub-orders and items:
            </p>
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <select
                value={allSameAddressModal.selectedAddressId}
                onChange={(e) => setAllSameAddressModal((prev) => ({ ...prev, selectedAddressId: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-primary)',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                {savedAddresses.map((addr) => (
                  <option key={addr.id} value={addr.id}>
                    {addr.label}: {addr.street}, {addr.city}
                  </option>
                ))}
              </select>
            </div>
            <div className="salo-cart-modal-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAllSameAddressModal({ isOpen: false, selectedAddressId: '' })}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={confirmAllSameAddress}
              >
                Apply to All
              </Button>
            </div>
          </div>
        </div>
      )}
    </CustomerLayout>
  );
}

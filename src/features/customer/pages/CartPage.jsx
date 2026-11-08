import { Link, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useCart } from '../../../hooks/useCart';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import RestaurantImage from '../components/RestaurantImage';

export default function CartPage() {
  const navigate = useNavigate();
  const {
    restaurantGroups,
    totalItemCount,
    itemsSubtotal,
    totalDeliveryFees,
    grandTotal,
    updateQuantity,
    removeItem,
    clearCart,
    setRestaurantFulfillment,
    setRestaurantAddress,
  } = useCart();

  const savedAddresses = customerService.getSavedAddresses();
  const missingDeliveryAddresses = restaurantGroups.filter(
    (group) => group.fulfillment === 'delivery' && !group.deliveryAddress
  );
  const isCheckoutBlocked = missingDeliveryAddresses.length > 0;

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

  return (
    <CustomerLayout>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Consolidated Ordering
            </span>
            <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)' }}>
              Multi-Restaurant Cart ({totalItemCount} items)
            </h1>
          </div>
          <Button variant="ghost" size="sm" onClick={clearCart} style={{ color: 'var(--salo-error)' }}>
            Empty Cart
          </Button>
        </div>
      </div>

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
            const currentAddress = group.deliveryAddress || savedAddresses[0] || null;

            return (
              <div
                key={group.restaurantId}
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

                {/* Multi-Address Selector per restaurant sub-order */}
                {group.fulfillment === 'delivery' && (
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
                        <strong>{currentAddress ? `${currentAddress.label} (${currentAddress.city})` : 'Select address'}</strong>
                      </div>
                    </div>

                    <select
                      value={currentAddress?.id || ''}
                      onChange={(e) => {
                        const matched = savedAddresses.find((a) => a.id === e.target.value);
                        if (matched) setRestaurantAddress(group.restaurantId, matched);
                      }}
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
                    >
                      {savedAddresses.map((addr) => (
                        <option key={addr.id} value={addr.id}>
                          {addr.label}: {addr.street}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Items in this sub-order */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {group.items.map((item) => (
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
                        </div>
                      </div>

                      {/* Quantity Controls */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', padding: '2px 4px' }}>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0 4px', fontWeight: 700 }}
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
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

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
                    Delivery: {group.fulfillment === 'delivery' ? `₱${group.deliveryFee}` : <strong style={{ color: 'var(--salo-success)' }}>Free (Pickup)</strong>}
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

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={isCheckoutBlocked}
            onClick={() => {
              if (isCheckoutBlocked) return;
              navigate('/customer/checkout');
            }}
            style={isCheckoutBlocked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
          >
            {isCheckoutBlocked ? 'Select Delivery Addresses First' : 'Proceed to Consolidated Checkout →'}
          </Button>

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
    </CustomerLayout>
  );
}

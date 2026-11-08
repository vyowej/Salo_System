import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useCart } from '../../../hooks/useCart';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

const PAYMENT_METHODS = [
  { id: 'cod', name: 'Cash on Delivery (COD)', desc: 'Pay with cash upon arrival of each delivery', icon: '💵' },
  { id: 'gcash', name: 'GCash', desc: 'Fast, secure e-wallet payment via mobile number', icon: '📱' },
  { id: 'maya', name: 'Maya', desc: 'Pay via Maya wallet or scan QR Ph', icon: '💳' },
  { id: 'card', name: 'Credit or Debit Card', desc: 'Visa, Mastercard, JCB, or BancNet', icon: '💳' },
];

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { restaurantGroups, itemsSubtotal, totalDeliveryFees, grandTotal, clearCart } = useCart();

  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [orderNotes, setOrderNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const hasMissingDeliveryAddresses = restaurantGroups.some(
    (group) => group.fulfillment === 'delivery' && !group.deliveryAddress
  );

  if (restaurantGroups.length === 0) {
    return (
      <CustomerLayout>
        <div style={{ textAlign: 'center', padding: 'var(--space-16) 0' }}>
          <p style={{ color: 'var(--text-secondary)' }}>You have no active items to checkout.</p>
          <Link to="/customer/restaurants" style={{ textDecoration: 'none', marginTop: 12, display: 'inline-block' }}>
            <Button variant="primary">Browse Restaurants</Button>
          </Link>
        </div>
      </CustomerLayout>
    );
  }

  const handlePlaceOrder = async () => {
    if (hasMissingDeliveryAddresses) {
      setError('Each delivery sub-order must have a saved delivery address before checkout can continue.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      for (const group of restaurantGroups) {
        const restaurant = await customerService.getRestaurantById(group.restaurantId);
        if (!restaurant) throw new Error(`${group.restaurantName} is unavailable for ordering.`);
        if (restaurant.operatingSchedule?.acceptingOrders === false) {
          throw new Error(`${restaurant.name} is not accepting orders right now. Your cart has been kept.`);
        }
        if (!restaurant.isOpen) {
          throw new Error(`${restaurant.name} is currently closed. Your cart has been kept.`);
        }
      }

      // Build sub-orders structure compliant with SALO Business Rules Part II
      const subOrders = restaurantGroups.map((group, idx) => ({
        id: `SUB-${Date.now().toString().slice(-4)}-${String.fromCharCode(65 + idx)}`,
        restaurantId: group.restaurantId,
        restaurantName: group.restaurantName,
        deliveryAddress: group.fulfillment === 'delivery'
          ? (group.deliveryAddress?.street || 'Default Delivery Address')
          : 'Pickup at Restaurant Counter',
        fulfillment: group.fulfillment,
        pickupInformation: group.fulfillment === 'pickup'
          ? 'Pickup at the selected restaurant counter.'
          : null,
        deliveryFee: group.fulfillment === 'delivery' ? group.deliveryFee : 0,
        deliveryInstructions: group.fulfillment === 'delivery' ? group.deliveryAddress?.notes || '' : '',
        subtotal: group.subtotal,
        status: 'Pending Confirmation',
        items: group.items.map((i) => ({
          menuItemId: i.id,
          name: i.name,
          qty: i.quantity,
          price: i.unitTotal,
          basePrice: i.price,
          addOns: (i.selectedAddOns || []).map((a) => ({ name: a.name, price: Number(a.price || 0) })),
          image: i.image,
        })),
        rider: {
          name: 'Assigning rider upon preparation...',
          vehicle: '-',
          phone: '-',
          eta: 'Pending kitchen acceptance',
        },
      }));

      const createdOrder = customerService.createOrder({
        totalAmount: grandTotal,
        paymentMethod: PAYMENT_METHODS.find((p) => p.id === paymentMethod)?.name || 'Cash on Delivery',
        paymentStatus: paymentMethod === 'cod' ? 'Pending COD Collection' : 'Paid Online (Verified)',
        orderNotes: orderNotes.trim(),
        priority: false,
        subOrders,
        overallStatus: 'Confirmed',
      });

      // Clear multi-cart upon successful placement
      clearCart();

      // Navigate to order tracking page
      navigate(`/customer/orders/${createdOrder.id}`);
    } catch (err) {
      setError(err?.message || 'Failed to submit consolidated order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CustomerLayout>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <Link to="/customer/cart" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          ← Return to Multi-Cart
        </Link>
        <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)' }}>
          Consolidated Checkout
        </h1>
        <p className="page-subtitle">
          Review your multi-restaurant allocations, delivery addresses, and payment selection.
        </p>
      </div>

      {error && (
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--status-error-bg)',
          color: 'var(--status-error-text)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--font-size-sm)',
          marginBottom: 'var(--space-5)',
        }}>
          {error}
        </div>
      )}

      {hasMissingDeliveryAddresses && (
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--status-warning-bg)',
          color: 'var(--status-warning-text)',
          border: '1px solid var(--status-warning-border, rgba(245, 158, 11, 0.4))',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--font-size-sm)',
          marginBottom: 'var(--space-5)',
        }}>
          One or more delivery sub-orders still need a selected address before you can place the order.
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 0.8fr',
        gap: 'var(--space-8)',
        alignItems: 'start',
      }}>
        {/* ── Left Column: Sub-Order Fulfillment Confirmations ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
              1. Delivery & Fulfillment Allocations ({restaurantGroups.length} Sub-Orders)
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {restaurantGroups.map((group, idx) => (
                <div
                  key={group.restaurantId}
                  style={{
                    background: 'var(--surface-primary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-4)',
                    boxShadow: 'var(--shadow-xs)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>
                        RESTAURANT {idx + 1}
                      </span>
                      <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700 }}>
                        {group.restaurantName}
                      </h3>
                    </div>
                    <Badge variant={group.fulfillment === 'delivery' ? 'primary' : 'info'} size="sm">
                      {group.fulfillment === 'delivery' ? '🛵 Delivery' : '🛍️ Pickup'}
                    </Badge>
                  </div>

                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    Destination:{' '}
                    <strong>
                      {group.fulfillment === 'delivery'
                        ? (group.deliveryAddress?.street || 'Customer Default Address')
                        : 'Self-pickup at kitchen counter'}
                    </strong>
                  </p>

                  <div style={{ marginTop: 'var(--space-2)', fontSize: 11, color: 'var(--text-muted)' }}>
                    {group.items.map((i) => `${i.quantity}x ${i.name}`).join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Payment Method Selector ──────────────────────── */}
          <div>
            <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
              2. Select Payment Method
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {PAYMENT_METHODS.map((method) => {
                const isSelected = paymentMethod === method.id;
                return (
                  <label
                    key={method.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--border-primary)',
                      background: isSelected ? 'var(--accent-subtle)' : 'var(--surface-primary)',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={method.id}
                      checked={isSelected}
                      onChange={() => setPaymentMethod(method.id)}
                    />
                    <span style={{ fontSize: 20 }}>{method.icon}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {method.name}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {method.desc}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Special Instructions */}
          <div>
            <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              3. Delivery & Order Notes
            </h2>
            <textarea
              placeholder="e.g. Please call upon arrival at the gate, avoid ringing doorbell..."
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              rows={2}
              className="textarea"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* ── Right Column: Final Financial Review ─────────── */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-sm)',
          position: 'sticky',
          top: 'calc(var(--topbar-height) + var(--space-4))',
        }}>
          <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>
            Payment Summary
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total Food Subtotal</span>
              <span style={{ fontWeight: 600 }}>₱{itemsSubtotal.toLocaleString()}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Combined Delivery Fees</span>
              <span style={{ fontWeight: 600 }}>₱{totalDeliveryFees.toLocaleString()}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
              <span>Multi-Vendor Settlement Fee</span>
              <span>₱0 (Free)</span>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: 'var(--space-3)',
              borderTop: '1px solid var(--border-primary)',
              fontSize: 'var(--font-size-xl)',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}>
              <span>Total Amount</span>
              <span style={{ color: 'var(--accent)' }}>₱{grandTotal.toLocaleString()}</span>
            </div>
          </div>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={isSubmitting}
            disabled={hasMissingDeliveryAddresses || isSubmitting}
            onClick={handlePlaceOrder}
            style={hasMissingDeliveryAddresses ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
          >
            {hasMissingDeliveryAddresses ? 'Complete Delivery Details' : `Confirm & Place Order · ₱${grandTotal.toLocaleString()}`}
          </Button>

          <div style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-secondary)',
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.4,
            textAlign: 'center',
          }}>
            🛡️ Encrypted & trace-logged under authoritative SALO Business Rules.
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}

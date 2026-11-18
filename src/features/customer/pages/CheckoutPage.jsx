import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useCart } from '../../../hooks/useCart';
import useAddresses from '../../../hooks/useAddresses';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import AddressFormModal from '../components/AddressFormModal';
import {
  buildCheckoutPayload,
  findAddressBySelectionId,
  validateGroupDeliveryAddress,
} from '../utils/checkoutAddressValidation';

const PAYMENT_METHODS = [
  { id: 'cod', name: 'Cash on Delivery (COD)', desc: 'Pay with cash upon arrival of each delivery', icon: '💵', enabled: true },
  { id: 'gcash', name: 'GCash (Coming soon)', desc: 'Online e-wallet payments are not enabled yet', icon: '📱', enabled: false },
  { id: 'maya', name: 'Maya (Coming soon)', desc: 'Online e-wallet payments are not enabled yet', icon: '💳', enabled: false },
  { id: 'card', name: 'Credit or Debit Card (Coming soon)', desc: 'Card payments are not enabled yet', icon: '💳', enabled: false },
];

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `salo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function CheckoutPage() {
  const { restaurantGroups, itemsSubtotal, totalDeliveryFees, grandTotal, setRestaurantAddress, clearCart } = useCart();
  const { addresses, loading: addressesLoading, addAddress } = useAddresses();

  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [orderNotes, setOrderNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [priceReviewNotice, setPriceReviewNotice] = useState('');
  const [serverGroupTotals, setServerGroupTotals] = useState({});
  const [groupErrors, setGroupErrors] = useState({});
  const [confirmedCheckout, setConfirmedCheckout] = useState(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [targetRestaurantIdForNewAddress, setTargetRestaurantIdForNewAddress] = useState(null);
  const idempotencyKeyRef = useRef(createIdempotencyKey());

  const handleModalSaveAddress = async (newAddrPayload) => {
    const saved = await addAddress(newAddrPayload);
    if (targetRestaurantIdForNewAddress && saved) {
      setRestaurantAddress(targetRestaurantIdForNewAddress, saved);
      setGroupErrors({});
      setError(null);
    }
  };

  const groupValidations = useMemo(
    () => restaurantGroups.map((group) => validateGroupDeliveryAddress(group, addresses, addressesLoading)),
    [restaurantGroups, addresses, addressesLoading]
  );

  const hasInvalidDeliveryAddresses = groupValidations.some((v) => !v.isValid);

  if (confirmedCheckout) {
    return (
      <CustomerLayout>
        <section style={{ maxWidth: 720, margin: '24px auto', padding: 'var(--space-6)', background: 'var(--surface-primary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-xl)' }}>
          <Badge variant="success" size="md">Order Confirmed (COD)</Badge>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, margin: '12px 0 6px' }}>
            Maraming salamat! Your order has been placed.
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-5)' }}>
            Total Confirmed Amount: <strong>₱{Number(confirmedCheckout.total_amount || 0).toFixed(2)}</strong> · Payment: Cash on Delivery (Pending collection)
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
            {(confirmedCheckout.orders || []).map((ord) => (
              <div key={ord.order_id} style={{ padding: 'var(--space-4)', border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong>{ord.restaurant_name}</strong>
                  <Badge variant="warning" size="sm">{ord.order_status}</Badge>
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Ref: <strong>{ord.order_reference}</strong> · {ord.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal: ₱{Number(ord.subtotal_amount).toFixed(2)} · Fee: ₱{Number(ord.delivery_fee).toFixed(2)}</span>
                  <strong>Total: ₱{Number(ord.total_amount).toFixed(2)}</strong>
                </div>
                <div style={{ marginTop: 10 }}>
                  <Link to={`/customer/orders/${ord.order_id}`} style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--accent)' }}>
                    View Order Details →
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <Link to="/customer/orders" style={{ textDecoration: 'none' }}>
              <Button variant="primary">View My Orders</Button>
            </Link>
            <Link to="/customer/restaurants" style={{ textDecoration: 'none' }}>
              <Button variant="outline">Browse More Restaurants</Button>
            </Link>
          </div>
        </section>
      </CustomerLayout>
    );
  }

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

  const hasServerTotals = Object.keys(serverGroupTotals).length > 0;
  const displayedItemsSubtotal = hasServerTotals
    ? restaurantGroups.reduce(
        (sum, group) =>
          sum + (serverGroupTotals[String(group.restaurantId)]?.subtotalAmount ?? Number(group.subtotal || 0)),
        0
      )
    : itemsSubtotal;
  const displayedDeliveryFees = hasServerTotals
    ? restaurantGroups.reduce(
        (sum, group) =>
          sum + (serverGroupTotals[String(group.restaurantId)]?.deliveryFee ?? Number(group.deliveryFee || 0)),
        0
      )
    : totalDeliveryFees;
  const displayedGrandTotal = hasServerTotals
    ? displayedItemsSubtotal + displayedDeliveryFees
    : grandTotal;

  const handlePlaceOrder = async () => {
    if (isSubmitting || addressesLoading) return;
    if (hasInvalidDeliveryAddresses) {
      setError(
        addresses.length === 0
          ? 'Please add a saved delivery address before placing your order.'
          : 'Each delivery sub-order must have a valid saved delivery address before checkout can continue.'
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setPriceReviewNotice('');
    setGroupErrors({});

    try {
      const expectedTotalsByRestaurant = Object.fromEntries(
        Object.entries(serverGroupTotals).map(([rid, info]) => [rid, info.totalAmount])
      );
      const payload = buildCheckoutPayload({
        restaurantGroups,
        orderNotes,
        idempotencyKey: idempotencyKeyRef.current,
        expectedTotalsByRestaurant,
      });

      const checkout = await customerService.placeCheckoutOrder(payload);
      clearCart();
      setServerGroupTotals({});
      idempotencyKeyRef.current = createIdempotencyKey();
      setConfirmedCheckout(checkout);
    } catch (err) {
      if (err?.status === 409 && Array.isArray(err?.data?.data?.groups)) {
        const nextTotals = {};
        err.data.data.groups.forEach((g) => {
          nextTotals[String(g.restaurant_id)] = {
            subtotalAmount: Number(g.subtotal_amount),
            deliveryFee: Number(g.delivery_fee),
            totalAmount: Number(g.total_amount),
          };
        });
        setServerGroupTotals(nextTotals);
        setPriceReviewNotice('Prices changed, please review');
        setError(null);
        return;
      }

      const nextGroupErrors = {};
      if (err?.errors && typeof err.errors === 'object') {
        Object.entries(err.errors).forEach(([key, msgs]) => {
          const match = key.match(/^groups\.(\d+)\./);
          const list = Array.isArray(msgs) ? msgs : [String(msgs)];
          if (match) {
            const idx = Number(match[1]);
            nextGroupErrors[idx] = [...(nextGroupErrors[idx] || []), ...list];
          }
        });
      }
      setGroupErrors(nextGroupErrors);
      const firstGroupMsg = Object.values(nextGroupErrors).flat()[0];
      setError(firstGroupMsg || err?.message || 'Failed to submit order. Please review your cart and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CustomerLayout>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Link to="/customer/cart" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          ← Return to Multi-Cart
        </Link>
      </div>

      {priceReviewNotice && (
        <div
          role="alert"
          style={{
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--status-warning-bg)',
            color: 'var(--status-warning-text)',
            border: '1px solid var(--status-warning-border, rgba(245, 158, 11, 0.4))',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
            marginBottom: 'var(--space-5)',
          }}
        >
          {priceReviewNotice}
        </div>
      )}

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

      {hasInvalidDeliveryAddresses && (
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--status-warning-bg)',
          color: 'var(--status-warning-text)',
          border: '1px solid var(--status-warning-border, rgba(245, 158, 11, 0.4))',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--font-size-sm)',
          marginBottom: 'var(--space-5)',
        }}>
          {addresses.length === 0
            ? 'No saved delivery addresses found. Please add a delivery address to place your order.'
            : 'One or more delivery sub-orders need a valid selected address before you can place the order.'}
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
              {restaurantGroups.map((group, idx) => {
                const validation = groupValidations[idx] || { isValid: true, error: null };
                const selectedValue =
                  group.deliveryAddress?.id != null && findAddressBySelectionId(addresses, group.deliveryAddress.id)
                    ? String(group.deliveryAddress.id)
                    : '';
                const combinedGroupErrors = [
                  ...(validation.error ? [validation.error] : []),
                  ...((groupErrors[idx] || []).filter((msg) => msg !== validation.error)),
                ];

                return (
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

                  {group.fulfillment === 'delivery' ? (
                    <div style={{
                      marginTop: 'var(--space-3)',
                      padding: 'var(--space-3)',
                      background: 'var(--surface-secondary)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-secondary)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Delivery Destination
                        </span>
                        <select
                          value={selectedValue}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__add_new__') {
                              setTargetRestaurantIdForNewAddress(group.restaurantId);
                              setFormModalOpen(true);
                              return;
                            }
                            if (!val) {
                              setRestaurantAddress(group.restaurantId, null);
                              return;
                            }
                            const matched = findAddressBySelectionId(addresses, val);
                            if (matched) {
                              setRestaurantAddress(group.restaurantId, matched);
                              setGroupErrors((prev) => {
                                if (!prev[idx]) return prev;
                                const next = { ...prev };
                                delete next[idx];
                                return next;
                              });
                              setError(null);
                            }
                          }}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-primary)',
                            background: 'var(--surface-primary)',
                            color: 'var(--text-primary)',
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            minHeight: 36,
                          }}
                          aria-label={`Change delivery address for ${group.restaurantName}`}
                        >
                          <option value="">-- Select delivery address --</option>
                          {addresses.map((addr) => (
                            <option key={addr.id} value={String(addr.id)}>
                              {addr.label}: {addr.street}, {addr.city}
                            </option>
                          ))}
                          <option value="__add_new__">+ Add new address...</option>
                        </select>
                      </div>

                      {group.deliveryAddress ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 3, flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                              {group.deliveryAddress.label === 'Home' && '🏠 '}
                              {group.deliveryAddress.label === 'Work' && '💼 '}
                              {group.deliveryAddress.label === 'School' && '🎓 '}
                              {!['Home', 'Work', 'School'].includes(group.deliveryAddress.label) && '📍 '}
                              {group.deliveryAddress.label}
                            </strong>
                            {group.deliveryAddress.isDefault && <Badge variant="success" size="sm">Default</Badge>}
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                              · {group.deliveryAddress.recipientName} ({group.deliveryAddress.mobileNumber || group.deliveryAddress.phone})
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {[
                              group.deliveryAddress.street,
                              group.deliveryAddress.barangay && `Brgy. ${group.deliveryAddress.barangay}`,
                              group.deliveryAddress.city,
                              group.deliveryAddress.province,
                              group.deliveryAddress.postalCode,
                            ].filter(Boolean).join(', ')}
                          </p>
                          {group.deliveryAddress.notes && (
                            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              Rider Note: {group.deliveryAddress.notes}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                          <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                            {addresses.length === 0
                              ? 'You have no saved delivery addresses yet.'
                              : 'Choose a saved delivery address from the dropdown above.'}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setTargetRestaurantIdForNewAddress(group.restaurantId);
                              setFormModalOpen(true);
                            }}
                          >
                            + Add Address
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', margin: 'var(--space-2) 0 0' }}>
                      Fulfillment: <strong>Self-pickup at kitchen counter</strong>
                    </p>
                  )}

                  <div style={{ marginTop: 'var(--space-2)', fontSize: 11, color: 'var(--text-muted)' }}>
                    {group.items.map((i) => `${i.quantity}x ${i.name}`).join(' · ')}
                  </div>
                  {serverGroupTotals[String(group.restaurantId)] && (
                    <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)', fontWeight: 600 }}>
                      Updated Sub-Order Total: ₱{serverGroupTotals[String(group.restaurantId)].totalAmount.toLocaleString()}
                      {' '}(Subtotal ₱{serverGroupTotals[String(group.restaurantId)].subtotalAmount.toLocaleString()}
                      {group.fulfillment === 'delivery'
                        ? ` + Delivery ₱${serverGroupTotals[String(group.restaurantId)].deliveryFee.toLocaleString()}`
                        : ''})
                    </div>
                  )}
                  {combinedGroupErrors.length > 0 && (
                    <div role="alert" style={{ marginTop: 'var(--space-2)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontSize: 'var(--font-size-xs)' }}>
                      {combinedGroupErrors.map((msg, mIdx) => (
                        <div key={mIdx}>{msg}</div>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
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
                      cursor: method.enabled ? 'pointer' : 'not-allowed',
                      opacity: method.enabled ? 1 : 0.6,
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={method.id}
                      checked={isSelected}
                      disabled={!method.enabled}
                      onChange={() => method.enabled && setPaymentMethod(method.id)}
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
              <span style={{ fontWeight: 600 }}>₱{displayedItemsSubtotal.toLocaleString()}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Combined Delivery Fees</span>
              <span style={{ fontWeight: 600 }}>₱{displayedDeliveryFees.toLocaleString()}</span>
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
              <span>Estimated Total</span>
              <span style={{ color: 'var(--accent)' }}>₱{displayedGrandTotal.toLocaleString()}</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
              Estimated total — final prices and delivery fees are confirmed by the server on checkout.
            </p>
          </div>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={isSubmitting}
            disabled={hasInvalidDeliveryAddresses || addressesLoading || isSubmitting}
            onClick={handlePlaceOrder}
            style={hasInvalidDeliveryAddresses || addressesLoading ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
          >
            {addressesLoading
              ? 'Loading Delivery Addresses...'
              : hasInvalidDeliveryAddresses
                ? 'Complete Delivery Details'
                : `Confirm & Place Order · ₱${displayedGrandTotal.toLocaleString()}`}
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

      <AddressFormModal
        isOpen={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setTargetRestaurantIdForNewAddress(null);
        }}
        onSave={handleModalSaveAddress}
        existingAddresses={addresses}
      />
    </CustomerLayout>
  );
}

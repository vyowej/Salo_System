import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useAuth } from '../../../hooks/useAuth';
import { useCart } from '../../../hooks/useCart';
import useAddresses from '../../../hooks/useAddresses';
import accountService from '../../../services/accountService';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import AddressFormModal from '../components/AddressFormModal';
import {
  buildCheckoutPayload,
  DELIVERY_NOTES_MAX_LENGTH,
  expandRestaurantGroupsToSubOrders,
  findAddressBySelectionId,
  isValidPhilippineMobile,
  normalizePhilippineMobile,
  parseCheckoutValidationErrors,
  validateDeliveryContactPhone,
  validateDeliveryNotes,
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
  const { user, updateUser } = useAuth();
  const {
    restaurantGroups,
    itemsSubtotal,
    totalDeliveryFees,
    grandTotal,
    setRestaurantAddress,
    setItemAddress,
    clearCart,
  } = useCart();
  const { addresses, loading: addressesLoading, addAddress } = useAddresses();

  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderNotesBySubOrder, setOrderNotesBySubOrder] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [priceReviewNotice, setPriceReviewNotice] = useState('');
  const [serverGroupTotals, setServerGroupTotals] = useState({});
  const [groupErrors, setGroupErrors] = useState({});
  const [itemErrorsByGroup, setItemErrorsByGroup] = useState({});
  const [hasItemCheckoutError, setHasItemCheckoutError] = useState(false);
  const [confirmedCheckout, setConfirmedCheckout] = useState(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [targetForNewAddress, setTargetForNewAddress] = useState(null);
  const [phoneInput, setPhoneInput] = useState(() => user?.phone_number || user?.phone || '');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneSaveError, setPhoneSaveError] = useState('');
  const [phoneSavedMessage, setPhoneSavedMessage] = useState('');
  const idempotencyKeyRef = useRef(createIdempotencyKey());

  const subOrders = useMemo(
    () => expandRestaurantGroupsToSubOrders(restaurantGroups),
    [restaurantGroups]
  );

  const applySubOrderAddress = (subOrder, nextAddress) => {
    if (subOrder.addressMode === 'multiple') {
      (subOrder.items || []).forEach((item) => {
        if (item.cartItemId) {
          setItemAddress(item.cartItemId, nextAddress);
        }
      });
      return;
    }
    setRestaurantAddress(subOrder.restaurantId, nextAddress);
  };

  const handleModalSaveAddress = async (newAddrPayload) => {
    const saved = await addAddress(newAddrPayload);
    if (targetForNewAddress && saved) {
      if (Array.isArray(targetForNewAddress.itemIds) && targetForNewAddress.itemIds.length > 0) {
        targetForNewAddress.itemIds.forEach((cartItemId) => setItemAddress(cartItemId, saved));
      } else if (targetForNewAddress.restaurantId) {
        setRestaurantAddress(targetForNewAddress.restaurantId, saved);
      }
      setGroupErrors({});
      setError(null);
    }
  };

  const groupValidations = useMemo(
    () => subOrders.map((subOrder) => validateGroupDeliveryAddress(subOrder, addresses, addressesLoading)),
    [subOrders, addresses, addressesLoading]
  );

  const hasInvalidDeliveryAddresses = groupValidations.some((v) => !v.isValid);
  const hasDeliverySubOrders = subOrders.some((subOrder) => subOrder.fulfillment === 'delivery');
  const phoneValidation = useMemo(
    () => validateDeliveryContactPhone(user, subOrders),
    [user, subOrders]
  );
  const hasInvalidPhoneForDelivery = !phoneValidation.isValid;
  const notesValidation = useMemo(
    () => validateDeliveryNotes({ orderNotes, orderNotesBySubOrder, subOrders }),
    [orderNotes, orderNotesBySubOrder, subOrders]
  );
  const hasInvalidDeliveryNotes = !notesValidation.isValid;

  const handleSavePhone = async (e) => {
    e.preventDefault();
    setPhoneSaveError('');
    setPhoneSavedMessage('');

    const normalized = normalizePhilippineMobile(phoneInput);
    if (!isValidPhilippineMobile(normalized)) {
      setPhoneSaveError('Enter a valid Philippine mobile number (e.g. 09171234567 or +639171234567).');
      return;
    }

    setPhoneSaving(true);
    try {
      const updatedUser = await accountService.updateProfile({ phone_number: normalized });
      updateUser(updatedUser);
      setPhoneInput(updatedUser?.phone_number || updatedUser?.phone || normalized);
      setIsEditingPhone(false);
      setPhoneSavedMessage('Contact phone number saved.');
      setError(null);
    } catch (err) {
      const fieldMsg = err?.errors?.phone_number?.[0] || err?.errors?.phone_number;
      setPhoneSaveError(fieldMsg || err?.message || 'Unable to save contact phone number.');
    } finally {
      setPhoneSaving(false);
    }
  };

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
    ? subOrders.reduce(
        (sum, subOrder) =>
          sum + (serverGroupTotals[subOrder.subOrderKey]?.subtotalAmount ?? Number(subOrder.subtotal || 0)),
        0
      )
    : itemsSubtotal;
  const displayedDeliveryFees = hasServerTotals
    ? subOrders.reduce(
        (sum, subOrder) =>
          sum + (serverGroupTotals[subOrder.subOrderKey]?.deliveryFee ?? Number(subOrder.deliveryFee || 0)),
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
    if (hasInvalidPhoneForDelivery) {
      setError(phoneValidation.error || 'A valid contact phone number is required for delivery orders.');
      return;
    }
    if (hasInvalidDeliveryNotes) {
      setError(notesValidation.error || `Delivery notes cannot exceed ${DELIVERY_NOTES_MAX_LENGTH} characters.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setPriceReviewNotice('');
    setGroupErrors({});
    setItemErrorsByGroup({});
    setHasItemCheckoutError(false);

    let submittedPayload = null;
    try {
      const expectedTotalsByRestaurant = Object.fromEntries(
        Object.entries(serverGroupTotals).map(([rid, info]) => [rid, info.totalAmount])
      );
      submittedPayload = buildCheckoutPayload({
        restaurantGroups,
        orderNotes,
        orderNotesBySubOrder,
        idempotencyKey: idempotencyKeyRef.current,
        expectedTotalsByRestaurant,
      });

      const checkout = await customerService.placeCheckoutOrder(submittedPayload);
      clearCart();
      setServerGroupTotals({});
      idempotencyKeyRef.current = createIdempotencyKey();
      setConfirmedCheckout(checkout);
    } catch (err) {
      if (err?.status === 409 && Array.isArray(err?.data?.data?.groups)) {
        const nextTotals = {};
        err.data.data.groups.forEach((g, gIdx) => {
          const key = subOrders[gIdx]?.subOrderKey || String(g.restaurant_id);
          nextTotals[key] = {
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

      const parsed = parseCheckoutValidationErrors(
        err?.errors,
        subOrders,
        submittedPayload?.groups || []
      );
      setGroupErrors(parsed.groupErrors);
      setItemErrorsByGroup(parsed.itemErrorsByGroup);
      setHasItemCheckoutError(parsed.hasItemErrors);
      setError(
        parsed.summaryMessage ||
          err?.message ||
          'Failed to submit order. Please review your cart and try again.'
      );
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
        <div role="alert" style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--status-error-bg)',
          color: 'var(--status-error-text)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--font-size-sm)',
          marginBottom: 'var(--space-5)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
        }}>
          <span>{error}</span>
          {hasItemCheckoutError && (
            <Link
              to="/customer/cart"
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 700,
                color: 'var(--status-error-text)',
                textDecoration: 'underline',
                whiteSpace: 'nowrap',
              }}
            >
              Review &amp; Update Items in Cart →
            </Link>
          )}
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
              1. Delivery & Fulfillment Allocations ({subOrders.length} Sub-Orders)
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {subOrders.map((group, idx) => {
                const validation = groupValidations[idx] || { isValid: true, error: null };
                const selectedValue =
                  group.deliveryAddress?.id != null && findAddressBySelectionId(addresses, group.deliveryAddress.id)
                    ? String(group.deliveryAddress.id)
                    : '';
                const combinedGroupErrors = [
                  ...(validation.error ? [validation.error] : []),
                  ...((groupErrors[idx] || []).filter((msg) => msg !== validation.error)),
                ];
                const serverTotal = serverGroupTotals[group.subOrderKey];

                return (
                <div
                  key={group.subOrderKey}
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
                        SUB-ORDER {idx + 1}
                        {group.addressMode === 'multiple' && group.addressGroupCount > 1
                          ? ` · SPLIT DELIVERY ${group.addressGroupIndex + 1} OF ${group.addressGroupCount}`
                          : ''}
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
                              setTargetForNewAddress({
                                restaurantId: group.restaurantId,
                                itemIds: group.addressMode === 'multiple' ? group.items.map((i) => i.cartItemId) : null,
                              });
                              setFormModalOpen(true);
                              return;
                            }
                            if (!val) {
                              applySubOrderAddress(group, null);
                              return;
                            }
                            const matched = findAddressBySelectionId(addresses, val);
                            if (matched) {
                              applySubOrderAddress(group, matched);
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
                              setTargetForNewAddress({
                                restaurantId: group.restaurantId,
                                itemIds: group.addressMode === 'multiple' ? group.items.map((i) => i.cartItemId) : null,
                              });
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

                  <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                    {group.items.map((i, itemIdx) => {
                      const itemMsgs = itemErrorsByGroup[idx]?.[Number(i.id)];
                      const hasItemErr = Array.isArray(itemMsgs) && itemMsgs.length > 0;
                      const addOns = Array.isArray(i.selectedAddOns) ? i.selectedAddOns : [];
                      const addOnText = addOns
                        .map((a) => `${a.name}${Number(a.price || 0) > 0 ? ` (+₱${Number(a.price).toLocaleString()})` : ''}`)
                        .join(', ');
                      const lineTotal = Number.isFinite(Number(i.itemTotal))
                        ? Number(i.itemTotal)
                        : (Number(i.price || 0) + addOns.reduce((s, a) => s + Number(a.price || 0), 0)) * Number(i.quantity || 1);
                      return (
                        <div
                          key={i.cartItemId || `${i.id}-${itemIdx}`}
                          style={hasItemErr ? {
                            color: 'var(--status-error-text)',
                            background: 'var(--status-error-bg)',
                            padding: '4px 6px',
                            borderRadius: 'var(--radius-sm)',
                            fontWeight: 600,
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 8,
                          } : {
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <span>
                            {i.quantity}x {i.name}
                            {addOnText ? ` (${addOnText})` : ''}
                            {hasItemErr ? ' (Unavailable)' : ''}
                          </span>
                          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                            ₱{lineTotal.toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label
                        htmlFor={`suborder-notes-${group.subOrderKey}`}
                        style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}
                      >
                        Sub-Order Delivery Notes (optional)
                      </label>
                      <span
                        style={{
                          fontSize: 11,
                          color: (orderNotesBySubOrder[group.subOrderKey] || '').length > DELIVERY_NOTES_MAX_LENGTH
                            ? 'var(--status-error-text)'
                            : 'var(--text-muted)',
                        }}
                      >
                        {(orderNotesBySubOrder[group.subOrderKey] || '').length}/{DELIVERY_NOTES_MAX_LENGTH}
                      </span>
                    </div>
                    <textarea
                      id={`suborder-notes-${group.subOrderKey}`}
                      placeholder={group.deliveryAddress?.notes ? `Default address note: ${group.deliveryAddress.notes}` : 'Optional notes for this sub-order...'}
                      value={orderNotesBySubOrder[group.subOrderKey] || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setOrderNotesBySubOrder((prev) => ({
                          ...prev,
                          [group.subOrderKey]: val,
                        }));
                      }}
                      maxLength={DELIVERY_NOTES_MAX_LENGTH}
                      rows={2}
                      className="textarea"
                      style={{ width: '100%', fontSize: 'var(--font-size-xs)' }}
                    />
                    {notesValidation.errors[group.subOrderKey] && (
                      <div role="alert" style={{ marginTop: 4, fontSize: 'var(--font-size-xs)', color: 'var(--status-error-text)' }}>
                        {notesValidation.errors[group.subOrderKey]}
                      </div>
                    )}
                  </div>
                  {serverTotal && (
                    <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)', fontWeight: 600 }}>
                      Updated Sub-Order Total: ₱{serverTotal.totalAmount.toLocaleString()}
                      {' '}(Subtotal ₱{serverTotal.subtotalAmount.toLocaleString()}
                      {group.fulfillment === 'delivery'
                        ? ` + Delivery ₱${serverTotal.deliveryFee.toLocaleString()}`
                        : ''})
                    </div>
                  )}
                  {combinedGroupErrors.length > 0 && (
                    <div role="alert" style={{ marginTop: 'var(--space-2)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontSize: 'var(--font-size-xs)' }}>
                      {combinedGroupErrors.map((msg, mIdx) => (
                        <div key={mIdx}>{msg}</div>
                      ))}
                      {itemErrorsByGroup[idx] && Object.keys(itemErrorsByGroup[idx]).length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <Link
                            to="/customer/cart"
                            style={{ fontWeight: 700, color: 'var(--status-error-text)', textDecoration: 'underline' }}
                          >
                            Return to Cart to review affected items →
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>

          {/* ── Contact Phone Number (Delivery Orders) ────────── */}
          {hasDeliverySubOrders && (
            <div style={{
              background: 'var(--surface-primary)',
              border: hasInvalidPhoneForDelivery ? '1px solid var(--status-error-text)' : '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
              boxShadow: 'var(--shadow-xs)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
                <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>
                  Contact Phone Number
                </h2>
                {phoneValidation.isValid && !isEditingPhone && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPhoneInput(phoneValidation.phone || '');
                      setPhoneSaveError('');
                      setPhoneSavedMessage('');
                      setIsEditingPhone(true);
                    }}
                  >
                    Change
                  </Button>
                )}
              </div>

              {phoneValidation.isValid && !isEditingPhone ? (
                <div>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                    📱 {phoneValidation.phone}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    Riders will use this number to contact you upon delivery.
                  </p>
                  {phoneSavedMessage && (
                    <p style={{ margin: '6px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--status-success-text, #15803d)', fontWeight: 600 }}>
                      {phoneSavedMessage}
                    </p>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSavePhone} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    {phoneValidation.error || 'Enter a Philippine mobile number (e.g. 09171234567) for delivery updates.'}
                  </p>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => {
                        setPhoneInput(e.target.value);
                        setPhoneSaveError('');
                      }}
                      placeholder="09171234567"
                      aria-label="Contact phone number"
                      style={{
                        flex: 1,
                        minWidth: 180,
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-primary)',
                        background: 'var(--surface-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: 'var(--font-size-sm)',
                      }}
                    />
                    <Button type="submit" variant="primary" size="sm" loading={phoneSaving} disabled={phoneSaving}>
                      Save Phone Number
                    </Button>
                    {phoneValidation.isValid && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsEditingPhone(false);
                          setPhoneSaveError('');
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                  {(phoneSaveError || (!phoneValidation.isValid && phoneValidation.error)) && (
                    <div role="alert" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--status-error-text)' }}>
                      {phoneSaveError || phoneValidation.error}
                    </div>
                  )}
                </form>
              )}
            </div>
          )}

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>
                3. Delivery & Order Notes
              </h2>
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: orderNotes.length > DELIVERY_NOTES_MAX_LENGTH ? 'var(--status-error-text)' : 'var(--text-muted)',
                }}
              >
                {orderNotes.length}/{DELIVERY_NOTES_MAX_LENGTH}
              </span>
            </div>
            <textarea
              placeholder="e.g. Please call upon arrival at the gate, avoid ringing doorbell..."
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              maxLength={DELIVERY_NOTES_MAX_LENGTH}
              rows={2}
              className="textarea"
              style={{ width: '100%' }}
            />
            {notesValidation.errors.general && (
              <div role="alert" style={{ marginTop: 4, fontSize: 'var(--font-size-xs)', color: 'var(--status-error-text)' }}>
                {notesValidation.errors.general}
              </div>
            )}
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
            disabled={hasInvalidDeliveryAddresses || hasInvalidPhoneForDelivery || hasInvalidDeliveryNotes || addressesLoading || isSubmitting}
            onClick={handlePlaceOrder}
            style={hasInvalidDeliveryAddresses || hasInvalidPhoneForDelivery || hasInvalidDeliveryNotes || addressesLoading ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
          >
            {addressesLoading
              ? 'Loading Delivery Addresses...'
              : hasInvalidDeliveryAddresses
                ? 'Complete Delivery Details'
                : hasInvalidPhoneForDelivery
                  ? 'Add Contact Phone Number'
                  : hasInvalidDeliveryNotes
                    ? 'Shorten Delivery Notes'
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
          setTargetForNewAddress(null);
        }}
        onSave={handleModalSaveAddress}
        existingAddresses={addresses}
      />
    </CustomerLayout>
  );
}

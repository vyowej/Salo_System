import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useAuth } from '../../../hooks/useAuth';
import { useCart } from '../../../hooks/useCart';
import useAddresses from '../../../hooks/useAddresses';
import useContactNumbers, { MAX_SAVED_CONTACT_NUMBERS } from '../../../hooks/useContactNumbers';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import AddressFormModal from '../components/AddressFormModal';
import ContactNumberFormModal from '../components/ContactNumberFormModal';
import {
  buildCheckoutPayload,
  DELIVERY_NOTES_MAX_LENGTH,
  expandRestaurantGroupsToSubOrders,
  findAddressBySelectionId,
  isValidPhilippineMobile,
  parseCheckoutValidationErrors,
  validateDeliveryContactPhone,
  validateDeliveryNotes,
  validateGroupDeliveryAddress,
} from '../utils/checkoutAddressValidation';

const PAYMENT_METHODS = [
  { id: 'cod', name: 'Cash on Delivery (COD)', desc: 'Pay with cash upon arrival of each delivery', icon: '💵', enabled: true },
  { id: 'gcash', name: 'GCash', desc: 'Pay instantly via GCash e-wallet', icon: '📱', enabled: true },
  { id: 'maya', name: 'Maya', desc: 'Pay instantly via Maya e-wallet', icon: '💳', enabled: true },
  { id: 'card', name: 'Credit or Debit Card', desc: 'Visa / Mastercard online card payment', icon: '💳', enabled: true },
];

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `salo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function CheckoutPage() {
  const { user } = useAuth();
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
  const {
    contactNumbers,
    defaultContactNumber,
    loading: contactsLoading,
    error: contactsError,
    addContactNumber,
  } = useContactNumbers();

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
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [paymentActionLoading, setPaymentActionLoading] = useState(false);
  const [paymentActionError, setPaymentActionError] = useState('');
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
  const selectedContact = useMemo(
    () =>
      contactNumbers.find((item) => item.id === selectedContactId) ||
      defaultContactNumber ||
      null,
    [contactNumbers, selectedContactId, defaultContactNumber]
  );
  const phoneValidation = useMemo(
    () => validateDeliveryContactPhone(user, subOrders),
    [user, subOrders]
  );
  const hasValidSelectedContact = Boolean(
    selectedContact && isValidPhilippineMobile(selectedContact.phoneNumber)
  );
  const hasInvalidPhoneForDelivery =
    hasDeliverySubOrders && !hasValidSelectedContact && !phoneValidation.isValid;
  const notesValidation = useMemo(
    () => validateDeliveryNotes({ orderNotes, orderNotesBySubOrder, subOrders }),
    [orderNotes, orderNotesBySubOrder, subOrders]
  );
  const hasInvalidDeliveryNotes = !notesValidation.isValid;

  const handleSaveNewContact = async (payload) => {
    const created = await addContactNumber(payload);
    if (created?.id) {
      setSelectedContactId(created.id);
    }
    setError(null);
  };

  const handleApplyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) {
      setPromoError('Enter a promo code first.');
      return;
    }
    setPromoLoading(true);
    setPromoError('');
    try {
      const uniqueRestIds = [...new Set(subOrders.map((s) => s.restaurantId))];
      const singleRestId = uniqueRestIds.length === 1 ? uniqueRestIds[0] : null;
      const result = await customerService.validatePromoCode({
        promoCode: code,
        subtotal: displayedItemsSubtotal,
        restaurantId: singleRestId,
      });
      setAppliedPromo(result);
    } catch (err) {
      setAppliedPromo(null);
      setPromoError(err?.message || 'Promo code is invalid or cannot be applied.');
    } finally {
      setPromoLoading(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoInput('');
    setPromoError('');
  };

  const handleConfirmOnlinePayment = async () => {
    if (!confirmedCheckout?.payment?.payment_id) return;
    setPaymentActionLoading(true);
    setPaymentActionError('');
    try {
      const updated = await customerService.confirmPayment(confirmedCheckout.payment.payment_id);
      setConfirmedCheckout((prev) => (prev ? { ...prev, checkout_status: 'paid', payment: updated } : prev));
    } catch (err) {
      setPaymentActionError(err?.message || 'Unable to confirm payment.');
    } finally {
      setPaymentActionLoading(false);
    }
  };

  if (confirmedCheckout) {
    const paymentObj = confirmedCheckout.payment;
    const needsOnlineAction = paymentObj && paymentObj.payment_status === 'requires_customer_action';
    const isOnlinePaid = paymentObj && paymentObj.payment_status === 'paid';

    return (
      <CustomerLayout>
        <section style={{ maxWidth: 720, margin: '24px auto', padding: 'var(--space-6)', background: 'var(--surface-primary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-xl)' }}>
          <Badge variant={needsOnlineAction ? 'warning' : 'success'} size="md">
            {needsOnlineAction
              ? `Payment Pending (${String(confirmedCheckout.payment_method || '').toUpperCase()})`
              : isOnlinePaid
                ? `Order & Payment Confirmed (${String(confirmedCheckout.payment_method || '').toUpperCase()})`
                : 'Order Confirmed (COD)'}
          </Badge>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, margin: '12px 0 6px' }}>
            {needsOnlineAction
              ? 'Complete your online payment to finalize your order.'
              : 'Maraming salamat! Your order has been placed.'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-5)' }}>
            Total Confirmed Amount: <strong>₱{Number(confirmedCheckout.total_amount || 0).toFixed(2)}</strong> · Payment:{' '}
            {paymentObj
              ? `${String(paymentObj.payment_channel || confirmedCheckout.payment_method).toUpperCase()} (${paymentObj.payment_status})`
              : 'Cash on Delivery (Pending collection)'}
          </p>

          {needsOnlineAction && (
            <div style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-5)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-secondary)' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 6 }}>
                Payment Reference: {paymentObj.payment_reference}
              </div>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
                Authorize your {String(paymentObj.payment_channel || '').toUpperCase()} payment of ₱{Number(paymentObj.amount || 0).toFixed(2)}.
              </p>
              {paymentActionError && (
                <p role="alert" style={{ color: 'var(--status-error-text)', fontSize: 'var(--font-size-xs)', marginBottom: 8 }}>
                  {paymentActionError}
                </p>
              )}
              <Button variant="primary" onClick={handleConfirmOnlinePayment} disabled={paymentActionLoading}>
                {paymentActionLoading ? 'Confirming Payment...' : `Pay ₱${Number(paymentObj.amount || 0).toFixed(2)} Now`}
              </Button>
            </div>
          )}

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
        contactNumberId: hasDeliverySubOrders && selectedContact?.id ? selectedContact.id : null,
        paymentMethod,
        promoCode: appliedPromo?.promo_code || '',
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>
                    Contact Phone Number
                  </h2>
                  <p style={{ margin: '2px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    Select which saved number riders should call upon delivery.
                  </p>
                </div>
                {contactNumbers.length < MAX_SAVED_CONTACT_NUMBERS && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setContactModalOpen(true)}
                  >
                    + Add New Number
                  </Button>
                )}
              </div>

              {contactsError && (
                <div role="alert" style={{
                  marginBottom: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--status-error-bg)',
                  color: 'var(--status-error-text)',
                  fontSize: 'var(--font-size-xs)',
                }}>
                  {contactsError}
                </div>
              )}

              {contactsLoading && contactNumbers.length === 0 ? (
                <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                  Loading saved contact numbers...
                </p>
              ) : contactNumbers.length === 0 ? (
                <div style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--border-primary)',
                  background: 'var(--surface-secondary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  flexWrap: 'wrap',
                }}>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    {phoneValidation.isValid
                      ? `Using account phone number: ${phoneValidation.phone}`
                      : 'No saved contact numbers yet. Add a Philippine mobile number for delivery updates.'}
                  </p>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => setContactModalOpen(true)}
                  >
                    + Add Contact Number
                  </Button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {contactNumbers.map((contact) => {
                    const isSelected = selectedContact?.id === contact.id;
                    return (
                      <label
                        key={contact.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-3)',
                          padding: 'var(--space-3) var(--space-4)',
                          borderRadius: 'var(--radius-md)',
                          border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--border-primary)',
                          background: isSelected ? 'var(--accent-subtle)' : 'var(--surface-secondary)',
                          cursor: 'pointer',
                          transition: 'all var(--transition-fast)',
                        }}
                      >
                        <input
                          type="radio"
                          name="checkoutContactNumber"
                          value={contact.id}
                          checked={isSelected}
                          onChange={() => {
                            setSelectedContactId(contact.id);
                            setError(null);
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                              {contact.label}
                            </strong>
                            {contact.isDefault && (
                              <Badge variant="success" size="sm">Default</Badge>
                            )}
                          </div>
                          <p style={{ margin: '2px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            📱 {contact.phoneNumber}
                          </p>
                        </div>
                      </label>
                    );
                  })}

                  {selectedContact && (
                    <div style={{
                      marginTop: 'var(--space-1)',
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-secondary)',
                      border: '1px solid var(--border-secondary)',
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--text-secondary)',
                    }}>
                      Selected for this order:{' '}
                      <strong style={{ color: 'var(--text-primary)' }}>
                        {selectedContact.label} · {selectedContact.phoneNumber}
                      </strong>
                    </div>
                  )}
                </div>
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

            <div style={{ paddingTop: 'var(--space-2)', borderTop: '1px dashed var(--border-secondary)' }}>
              <label htmlFor="checkout-promo-code" style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 6 }}>
                Promo Code
              </label>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <input
                  id="checkout-promo-code"
                  type="text"
                  className="input"
                  placeholder="Enter promo code"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                  disabled={Boolean(appliedPromo) || promoLoading}
                  style={{ flex: 1 }}
                />
                {appliedPromo ? (
                  <Button type="button" variant="outline" size="sm" onClick={handleRemovePromo}>
                    Remove
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" size="sm" onClick={handleApplyPromo} disabled={promoLoading}>
                    {promoLoading ? 'Checking...' : 'Apply'}
                  </Button>
                )}
              </div>
              {promoError && (
                <div role="alert" style={{ marginTop: 4, fontSize: 'var(--font-size-xs)', color: 'var(--status-error-text)' }}>
                  {promoError}
                </div>
              )}
              {appliedPromo && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: 'var(--status-success-text)', fontWeight: 600 }}>
                  <span>Promo ({appliedPromo.promo_code})</span>
                  <span>-₱{Number(appliedPromo.discount_amount || 0).toFixed(2)}</span>
                </div>
              )}
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
              <span style={{ color: 'var(--accent)' }}>
                ₱{Math.max(0, displayedGrandTotal - Number(appliedPromo?.discount_amount || 0)).toLocaleString()}
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
              Estimated total — final prices and delivery fees are confirmed by the server on checkout.
            </p>
            {hasDeliverySubOrders && selectedContact && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 'var(--space-2)',
                paddingTop: 'var(--space-2)',
                borderTop: '1px solid var(--border-secondary)',
                fontSize: 'var(--font-size-xs)',
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>Delivery Contact</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selectedContact.label} · {selectedContact.phoneNumber}
                </span>
              </div>
            )}
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

      <ContactNumberFormModal
        isOpen={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        onSave={handleSaveNewContact}
        existingContacts={contactNumbers}
      />
    </CustomerLayout>
  );
}

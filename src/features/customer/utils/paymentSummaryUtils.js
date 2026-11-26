import { formatFormalAddress } from '../../../utils/addressFormatter';
import { getItemAddOnCost } from './checkoutAddressValidation';

function toCents(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

function fromCents(cents) {
  return Math.round(cents) / 100;
}

export function formatPesoAmount(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '₱0.00';
  return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Normalize either checkout/cart subOrders OR confirmed backend order objects
 * into a single itemized Payment Summary model whose grandTotal matches
 * sum(expected_total) - promoDiscount.
 */
export function computePaymentSummaryModel(
  groupsInput = [],
  { serverGroupTotals = {}, appliedPromo = null } = {},
) {
  const groups = (groupsInput || []).map((raw, idx) => {
    const key = raw.subOrderKey || (raw.order_id ? `order:${raw.order_id}` : `group:${idx}`);
    const fulfillment = raw.fulfillment || raw.order_type || 'delivery';
    const isDelivery = fulfillment === 'delivery';
    const restaurantName = raw.restaurantName || raw.restaurant_name || 'Restaurant';

    let deliveryAddressText = '';
    if (isDelivery) {
      if (raw.deliveryAddress && typeof raw.deliveryAddress === 'object') {
        deliveryAddressText = formatFormalAddress(raw.deliveryAddress);
      }
      if (!deliveryAddressText) {
        deliveryAddressText = String(raw.deliveryAddressText || raw.delivery_address_text || '').trim();
      }
    }

    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items = rawItems.map((item, itemIdx) => {
      const quantity = Math.max(0, Number(item.quantity || 0));
      const unitBase = item.unit_price !== undefined ? Number(item.unit_price) : Number(item.price || 0);
      const addOnPerUnit = getItemAddOnCost(item);
      const lineCents = item.line_total !== undefined
        ? toCents(item.line_total)
        : toCents(unitBase + addOnPerUnit) * quantity;

      const addOnsList = Array.isArray(item.add_ons)
        ? item.add_ons
        : Array.isArray(item.selectedAddOns)
          ? item.selectedAddOns
          : [];
      const addOnsLabel = addOnsList
        .map((ao) => ao?.option_name || ao?.name || '')
        .filter(Boolean)
        .join(', ');

      return {
        key: item.order_item_id || item.cartItemKey || `${key}:item:${itemIdx}`,
        name: item.item_name || item.name || 'Item',
        quantity,
        lineTotal: fromCents(lineCents),
        lineCents,
        addOnsLabel,
      };
    });

    const serverOverride = serverGroupTotals?.[key];
    const subtotalCents = serverOverride?.subtotalAmount !== undefined
      ? toCents(serverOverride.subtotalAmount)
      : raw.subtotal_amount !== undefined
        ? toCents(raw.subtotal_amount)
        : raw.subtotal !== undefined && Number.isFinite(Number(raw.subtotal))
          ? toCents(raw.subtotal)
          : items.reduce((sum, it) => sum + it.lineCents, 0);

    const deliveryFeeCents = isDelivery
      ? (
        serverOverride?.deliveryFee !== undefined
          ? toCents(serverOverride.deliveryFee)
          : raw.delivery_fee !== undefined
            ? toCents(raw.delivery_fee)
            : toCents(raw.deliveryFee || 0)
      )
      : 0;

    return {
      key,
      restaurantName,
      fulfillment,
      isDelivery,
      deliveryAddressText,
      items,
      subtotalCents,
      subtotal: fromCents(subtotalCents),
      deliveryFeeCents,
      deliveryFee: fromCents(deliveryFeeCents),
      groupTotalCents: subtotalCents + deliveryFeeCents,
      groupTotal: fromCents(subtotalCents + deliveryFeeCents),
    };
  });

  const foodTotalCents = groups.reduce((sum, g) => sum + g.subtotalCents, 0);
  const deliveryGroups = groups.filter((g) => g.isDelivery);
  const combinedDeliveryFeeCents = groups.reduce((sum, g) => sum + g.deliveryFeeCents, 0);
  const promoDiscountCents = toCents(appliedPromo?.discount_amount || 0);
  const grandTotalCents = Math.max(0, foodTotalCents + combinedDeliveryFeeCents - promoDiscountCents);

  return {
    groups,
    deliveryGroupCount: deliveryGroups.length,
    foodTotal: fromCents(foodTotalCents),
    combinedDeliveryFees: fromCents(combinedDeliveryFeeCents),
    promoDiscount: fromCents(promoDiscountCents),
    grandTotal: fromCents(grandTotalCents),
  };
}

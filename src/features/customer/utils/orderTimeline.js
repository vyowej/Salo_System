/**
 * Shared order timeline & payment status helpers for Customer OrdersPage and OrderDetailPage.
 * Keeps pickup vs delivery wording accurate for Step 9a (no rider dispatch / fake ETA).
 */

const PICKUP_PROGRESSION = ['pending', 'accepted', 'preparing', 'ready', 'completed'];
const DELIVERY_PROGRESSION = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'arrived', 'customer_reached', 'delivered'];

export function normalizeOrderStatusKey(status) {
  const raw = String(status || 'pending').trim().toLowerCase();
  if (raw === 'pending confirmation') return 'pending';
  if (raw === 'ready for pickup' || raw === 'ready for dispatch') return 'ready';
  if (raw === 'out for delivery') return 'out_for_delivery';
  if (raw === 'rider arrived') return 'arrived';
  if (raw === 'customer reached') return 'customer_reached';
  return raw;
}

export function formatOrderStatusText(status, fulfillment = 'delivery') {
  const key = normalizeOrderStatusKey(status);
  if (key === 'pending') return 'Pending';
  if (key === 'accepted') return 'Accepted';
  if (key === 'preparing') return 'Preparing';
  if (key === 'ready') return fulfillment === 'pickup' ? 'Ready for pickup' : 'Ready';
  if (key === 'out_for_delivery') return 'Out for delivery';
  if (key === 'arrived') return 'Rider arrived';
  if (key === 'customer_reached') return 'Customer reached';
  if (key === 'delivered') return 'Delivered';
  if (key === 'completed') return 'Completed';
  if (key === 'rejected') return 'Rejected';
  if (key === 'cancelled') return 'Cancelled';
  return status || 'Pending';
}

const PAYMENT_STATUS_LABELS = {
  paid: 'Paid',
  pending: 'Pending',
  requires_customer_action: 'Awaiting Payment',
  processing: 'Processing',
  authorized: 'Authorized',
  partially_captured: 'Partially Captured',
  declined: 'Declined',
  failed: 'Failed',
  expired: 'Expired',
  voided: 'Voided',
  cancelled: 'Cancelled',
  partially_refunded: 'Partially Refunded',
  refunded: 'Refunded',
  disputed: 'Disputed',
  reversed: 'Reversed',
};

const REFUND_STATUS_LABELS = {
  requested: 'Refund Requested',
  approved: 'Refund Approved',
  submitted: 'Refund Submitted',
  processing: 'Refund Processing',
  successful: 'Refunded',
  failed: 'Refund Failed',
  manual: 'Manual Refund',
};

export function formatPaymentStatusLabel(paymentStatus) {
  const key = String(paymentStatus || 'pending').trim().toLowerCase();
  if (PAYMENT_STATUS_LABELS[key]) return PAYMENT_STATUS_LABELS[key];
  return key ? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ') : 'Pending';
}

export function formatRefundStatusLabel(refundStatus) {
  const key = String(refundStatus || '').trim().toLowerCase();
  if (!key) return '';
  if (REFUND_STATUS_LABELS[key]) return REFUND_STATUS_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

export function canCustomerCancelOrder(order) {
  const status = normalizeOrderStatusKey(order?.overallStatus ?? order?.order_status ?? order?.status);
  return status === 'pending';
}

/**
 * Build the Step 9a timeline steps for an order using only real backend timestamps.
 * Preparing and Ready are shown as reached / not reached without timestamps.
 *
 * @param {object} order
 * @returns {Array<{ key: string, label: string, reached: boolean, current: boolean, timestamp: string|null, variant?: string }>}
 */
export function buildOrderTimelineSteps(order) {
  const fulfillment = String(order?.fulfillment || order?.subOrders?.[0]?.fulfillment || 'delivery').toLowerCase();
  const statusKey = normalizeOrderStatusKey(order?.overallStatus ?? order?.order_status ?? order?.status);
  const placedAt = order?.createdAt ?? order?.placedAt ?? order?.placed_at ?? null;
  const acceptedAt = order?.acceptedAt ?? order?.accepted_at ?? null;
  const arrivedAt = order?.arrivedAt ?? order?.arrived_at ?? null;
  const deliveredAt = order?.deliveredAt ?? order?.delivered_at ?? null;
  const completedAt = order?.completedAt ?? order?.completed_at ?? null;
  const rejectedAt = order?.rejectedAt ?? order?.rejected_at ?? null;
  const cancelledAt = order?.cancelledAt ?? order?.cancelled_at ?? null;

  if (statusKey === 'rejected') {
    return [
      { key: 'pending', label: 'Pending', reached: true, current: false, timestamp: placedAt },
      { key: 'rejected', label: 'Rejected', reached: true, current: true, timestamp: rejectedAt, variant: 'error' },
    ];
  }

  if (statusKey === 'cancelled') {
    return [
      { key: 'pending', label: 'Pending', reached: true, current: false, timestamp: placedAt },
      { key: 'cancelled', label: 'Cancelled', reached: true, current: true, timestamp: cancelledAt, variant: 'error' },
    ];
  }

  const progression = fulfillment === 'pickup' ? PICKUP_PROGRESSION : DELIVERY_PROGRESSION;
  const currentIdx = Math.max(progression.indexOf(statusKey), 0);

  const steps = [
    {
      key: 'pending',
      label: 'Pending',
      reached: currentIdx >= 0,
      current: currentIdx === 0,
      timestamp: placedAt,
    },
    {
      key: 'accepted',
      label: 'Accepted',
      reached: currentIdx >= 1,
      current: currentIdx === 1,
      timestamp: acceptedAt,
    },
    {
      key: 'preparing',
      label: 'Preparing',
      reached: currentIdx >= 2,
      current: currentIdx === 2,
      timestamp: null,
    },
    {
      key: 'ready',
      label: fulfillment === 'pickup' ? 'Ready for pickup' : 'Ready',
      reached: currentIdx >= 3,
      current: currentIdx === 3,
      timestamp: null,
    },
  ];

  if (fulfillment === 'pickup') {
    steps.push({
      key: 'completed',
      label: 'Completed',
      reached: currentIdx >= 4,
      current: currentIdx === 4,
      timestamp: completedAt,
    });
  } else {
    steps.push(
      {
        key: 'out_for_delivery',
        label: 'Out for delivery',
        reached: currentIdx >= 4,
        current: currentIdx === 4,
        timestamp: null,
      },
      {
        key: 'arrived',
        label: 'Rider arrived',
        reached: currentIdx >= 5,
        current: currentIdx === 5,
        timestamp: arrivedAt,
      },
      {
        key: 'customer_reached',
        label: 'Customer reached',
        reached: currentIdx >= 6,
        current: currentIdx === 6,
        timestamp: null,
      },
      {
        key: 'delivered',
        label: 'Delivered',
        reached: currentIdx >= 7,
        current: currentIdx === 7,
        timestamp: deliveredAt,
      },
    );
  }

  return steps;
}

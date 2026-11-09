import { ADMIN_MOCK_DATA } from './data';

const FEE_STORAGE_KEY = 'salo_admin_fee_configurations';
const COD_STORAGE_KEY = 'salo_admin_cod_remittances';
const REFUND_STORAGE_KEY = 'salo_admin_refunds';
const PAYOUT_STORAGE_KEY = 'salo_admin_payout_adjustments';

const INITIAL_FEE_CONFIGURATIONS = [
  { id: 'fee-delivery-fixed', category: 'Delivery Fees', name: 'Metro Manila standard delivery', model: 'Fixed', baseFee: 49, includedDistance: 3, additionalDistanceRate: 12, zones: {}, minimum: 39, maximum: 149, effectiveAt: '2026-10-01T00:00:00+08:00', orderTypes: ['Delivery'], serviceAreaIds: ['area-qc', 'area-makati', 'area-manda', 'area-manila'], specialConditions: 'Standard daytime deliveries', status: 'Active', versions: [{ who: 'System Administrator', when: '2026-10-01T00:00:00+08:00', oldValue: null, newValue: 'Fixed ₱49 base delivery fee', reason: 'Initial demo configuration' }] },
  { id: 'fee-delivery-zone', category: 'Delivery Fees', name: 'QC North zone rate', model: 'Zone-based', baseFee: 55, includedDistance: 0, additionalDistanceRate: 0, zones: { 'QC North': 55, 'QC Central': 65 }, minimum: 45, maximum: 160, effectiveAt: '2026-11-15T00:00:00+08:00', orderTypes: ['Delivery'], serviceAreaIds: ['area-qc'], specialConditions: 'Applies only to selected QC zones', status: 'Scheduled', versions: [{ who: 'Mika Santos', when: '2026-11-08T10:00:00+08:00', oldValue: null, newValue: 'Zone-based QC rates', reason: 'Scheduled rate review' }] },
  { id: 'fee-commission-default', category: 'Commission', name: 'Standard restaurant commission', model: 'Percentage', rate: 10, fixedAmount: 0, restaurantId: '', effectiveAt: '2026-08-01T00:00:00+08:00', orderTypes: ['Delivery', 'Pickup'], serviceAreaIds: [], specialConditions: 'Standard approved restaurant arrangement', status: 'Active', versions: [{ who: 'System Administrator', when: '2026-08-01T00:00:00+08:00', oldValue: null, newValue: '10% percentage commission', reason: 'Initial demo configuration' }] },
  ...ADMIN_MOCK_DATA.restaurants.slice(0, 3).map((restaurant) => ({
    id: `fee-commission-${restaurant.id}`,
    category: 'Commission',
    name: `${restaurant.name} arrangement`,
    model: 'Per-restaurant arrangement',
    rate: restaurant.commissionRate,
    fixedAmount: 0,
    restaurantId: restaurant.id,
    effectiveAt: restaurant.joinedDate,
    orderTypes: ['Delivery', 'Pickup'],
    serviceAreaIds: [],
    specialConditions: 'Approved restaurant-specific rate',
    status: 'Active',
    versions: [{ who: 'System Administrator', when: `${restaurant.joinedDate}T09:00:00+08:00`, oldValue: null, newValue: `${restaurant.commissionRate}% commission`, reason: 'Demo restaurant agreement' }],
  })),
  { id: 'fee-commission-promo', category: 'Commission', name: 'Seasonal promotional commission', model: 'Promotional commission', rate: 7, fixedAmount: 0, restaurantId: 'rest-2', effectiveAt: '2026-12-01T00:00:00+08:00', endAt: '2027-01-01T00:00:00+08:00', orderTypes: ['Delivery'], serviceAreaIds: ['area-qc'], specialConditions: 'Time-limited restaurant campaign', status: 'Draft', versions: [] },
  { id: 'fee-service', category: 'Other Fees', name: 'Customer service fee', description: 'Platform customer service charge', calculation: 'Fixed', amount: 20, applicability: 'Delivery and pickup orders', effectiveAt: '2026-08-01T00:00:00+08:00', status: 'Active', versions: [{ who: 'System Administrator', when: '2026-08-01T00:00:00+08:00', oldValue: null, newValue: '₱20 fixed customer service fee', reason: 'Initial demo configuration' }] },
  { id: 'fee-small-order', category: 'Other Fees', name: 'Small-order fee', description: 'Charge for orders below the threshold', calculation: 'Fixed', amount: 25, applicability: 'Delivery orders below ₱500', effectiveAt: '2026-08-01T00:00:00+08:00', status: 'Deactivated', versions: [{ who: 'System Administrator', when: '2026-08-01T00:00:00+08:00', oldValue: null, newValue: '₱25 for delivery orders below ₱500', reason: 'Demo configuration' }] },
  { id: 'fee-reservation-service', category: 'Other Fees', name: 'Reservation service fee', description: 'Reservation platform service charge', calculation: 'Fixed', amount: 10, applicability: 'Reservation bookings', effectiveAt: '2026-09-01T00:00:00+08:00', status: 'Active', versions: [{ who: 'System Administrator', when: '2026-09-01T00:00:00+08:00', oldValue: null, newValue: '₱10 per reservation', reason: 'Initial demo configuration' }] },
  { id: 'fee-reservation-booking', category: 'Other Fees', name: 'Reservation booking fee', description: 'Booking charge where enabled', calculation: 'Fixed', amount: 50, applicability: 'Paid reservation bookings', effectiveAt: '2026-09-01T00:00:00+08:00', status: 'Scheduled', versions: [{ who: 'System Administrator', when: '2026-09-01T00:00:00+08:00', oldValue: null, newValue: '₱50 per paid booking', reason: 'Scheduled demo configuration' }] },
];

function readStorage(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : fallback;
}

function writeStorage(key, value) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
}

function describeFeeConfiguration(configuration) {
  const status = configuration.status || 'Draft';
  if (configuration.category === 'Commission') {
    const value = configuration.model === 'Fixed'
      ? `fixed amount ${configuration.fixedAmount}`
      : `rate ${configuration.rate}%`;
    return `${configuration.name} · ${status} · ${configuration.model} · ${value}`;
  }
  if (configuration.category === 'Delivery Fees') {
    return `${configuration.name} · ${status} · ${configuration.model} · base ${configuration.baseFee} · min ${configuration.minimum} · max ${configuration.maximum}`;
  }
  return `${configuration.name} · ${status} · ${configuration.calculation} · amount ${configuration.amount}`;
}

const ordersById = new Map(ADMIN_MOCK_DATA.orders.map((order) => [order.id, order]));

export function getOrderBreakdown(orderId) {
  const order = ordersById.get(orderId);
  if (!order) throw new Error(`Unknown mock order: ${orderId}`);
  return order.feeBreakdown;
}

export function getOrdersWithFinancials() {
  return ADMIN_MOCK_DATA.orders.map((order) => ({
    ...order,
    feeBreakdown: getOrderBreakdown(order.id),
  }));
}

export function getReservationBreakdown(reservationId) {
  const reservation = ADMIN_MOCK_DATA.reservations.find((item) => item.id === reservationId);
  if (!reservation) throw new Error(`Unknown mock reservation: ${reservationId}`);
  return reservation.feeBreakdown;
}

export function getPlatformTotals() {
  const orders = getOrdersWithFinancials();
  const total = (selector) => orders.reduce((sum, order) => sum + selector(order.feeBreakdown), 0);
  const reservationFees = ADMIN_MOCK_DATA.reservations.reduce(
    (sum, reservation) => sum + getReservationBreakdown(reservation.id).reservationFee,
    0,
  );
  const reservationRefunds = ADMIN_MOCK_DATA.reservations.reduce(
    (sum, reservation) => sum + (reservation.cancellationInfo?.refundStatus === 'Refund confirmed'
      ? getReservationBreakdown(reservation.id).reservationFee
      : 0),
    0,
  );
  const payouts = getPayoutRecords();
  const codRemittances = getCodRemittances();
  const platformCommission = total((breakdown) => breakdown.platformCommission.amount);
  const serviceFees = total((breakdown) => breakdown.customerServiceFee);
  const platformDiscounts = total((breakdown) => (
    breakdown.discount.fundingSource === 'Platform' ? breakdown.discount.amount : 0
  ));

  return {
    gmv: total((breakdown) => breakdown.orderTotal),
    platformRevenue: platformCommission + serviceFees - platformDiscounts + reservationFees - reservationRefunds,
    restaurantSales: total((breakdown) => breakdown.restaurantSales),
    platformCommission,
    deliveryFees: total((breakdown) => breakdown.deliveryFee),
    serviceFees,
    discounts: total((breakdown) => breakdown.discount.amount),
    refunds: total((breakdown) => breakdown.refundAdjustment.amount) + reservationRefunds,
    restaurantPayable: total((breakdown) => breakdown.restaurantPayable),
    reservationFees,
    pendingPayouts: payouts.filter((payout) => payout.status !== 'Paid').reduce((sum, payout) => sum + payout.netPayable, 0),
    outstandingCodRemittances: codRemittances.reduce((sum, remittance) => sum + remittance.outstandingAmount, 0),
  };
}

export function getFinancialTransactions() {
  const orders = getOrdersWithFinancials().map((order) => ({
    id: order.id,
    type: order.paymentMethod.includes('(COD)') ? 'COD' : 'Customer payment',
    customerName: order.customerName,
    restaurant: order.restaurants.join(', '),
    relatedRecordType: 'Order',
    relatedRecordId: order.id,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.paymentStatus.toLowerCase().includes('failed') ? 'Failed'
      : order.paymentStatus.toLowerCase().includes('pending') || order.paymentStatus.toLowerCase().includes('due') ? 'Pending'
        : 'Completed',
    providerVerificationState: order.paymentMethod.includes('(COD)')
      ? 'Not applicable · cash collection'
      : order.paymentStatus.toLowerCase().includes('verified') || order.paymentStatus.toLowerCase().includes('paid') ? 'Provider verified'
        : 'Unverified',
    amount: order.feeBreakdown.orderTotal,
    createdAt: order.createdAt,
  }));
  const reservations = ADMIN_MOCK_DATA.reservations.map((reservation) => ({
    id: reservation.id,
    type: 'Reservation payment',
    customerName: reservation.customerName,
    restaurant: reservation.restaurantName,
    relatedRecordType: 'Reservation',
    relatedRecordId: reservation.id,
    paymentMethod: reservation.paymentMethod,
    paymentStatus: reservation.paymentStatus,
    status: reservation.paymentStatus.toLowerCase().includes('pending') ? 'Pending'
      : reservation.paymentStatus.toLowerCase().includes('refund') ? 'Completed'
        : 'Completed',
    providerVerificationState: reservation.paymentStatus.toLowerCase().includes('paid') ? 'Provider verified' : 'Unverified',
    amount: getReservationBreakdown(reservation.id).reservationFee,
    createdAt: reservation.reservedAt,
  }));
  const refunds = getRefundRecords().map((refund) => ({
    id: refund.id,
    type: 'Refund',
    customerName: refund.customerName,
    restaurant: refund.restaurant,
    relatedRecordType: refund.relatedRecordType,
    relatedRecordId: refund.relatedRecordId,
    paymentMethod: refund.paymentMethod,
    paymentStatus: refund.completionStatus,
    status: refund.completionStatus,
    providerVerificationState: refund.providerReference ? 'Provider reference recorded' : 'Not submitted to provider',
    amount: refund.amount,
    createdAt: refund.createdAt,
  }));
  const failedAttempts = [{
    id: 'PAY-ATTEMPT-2039-02',
    type: 'Customer payment',
    customerName: 'Katrina Sy',
    restaurant: 'Dalisay Heritage Grill & Bistro, Manila Artisan Pizza, Calle Crisologo Silog',
    relatedRecordType: 'Order',
    relatedRecordId: 'SALO-MNL-2039',
    paymentMethod: 'Maya',
    paymentStatus: 'Provider declined',
    status: 'Failed',
    providerVerificationState: 'Provider rejected authorization',
    amount: getOrderBreakdown('SALO-MNL-2039').orderTotal,
    createdAt: '2026-11-05T22:29:00+08:00',
  }];
  return [...orders, ...reservations, ...refunds, ...failedAttempts];
}

export function getFeeConfigurations() {
  return readStorage(FEE_STORAGE_KEY, INITIAL_FEE_CONFIGURATIONS);
}

export function saveFeeConfiguration(configuration, actor, reason) {
  const configurations = getFeeConfigurations();
  const existing = configurations.find((item) => item.id === configuration.id);
  const now = new Date().toISOString();
  const version = {
    who: actor,
    when: now,
    oldValue: existing ? describeFeeConfiguration(existing) : null,
    newValue: describeFeeConfiguration(configuration),
    reason,
  };
  const next = {
    ...configuration,
    versions: [...(existing?.versions || []), version],
  };
  writeStorage(FEE_STORAGE_KEY, existing
    ? configurations.map((item) => item.id === next.id ? next : item)
    : [next, ...configurations]);
  return next;
}

export function changeFeeStatus(configurationId, status, actor, reason) {
  const current = getFeeConfigurations().find((item) => item.id === configurationId);
  if (!current) throw new Error(`Unknown fee configuration: ${configurationId}`);
  return saveFeeConfiguration({ ...current, status }, actor, reason);
}

export function getFeePreview(input = {}, deliveryOverride = null, commissionOverride = null, otherFeeOverride = null) {
  const configs = getFeeConfigurations();
  const delivery = deliveryOverride || configs.find((item) => item.category === 'Delivery Fees' && item.status === 'Active');
  const commissionConfig = commissionOverride || configs.find((item) => item.category === 'Commission' && item.status === 'Active' && !item.restaurantId);
  const otherFees = otherFeeOverride
    ? [...configs.filter((item) => item.category !== 'Other Fees' || item.name !== otherFeeOverride.name), otherFeeOverride]
    : configs.filter((item) => item.category === 'Other Fees');
  const subtotal = Number(input.subtotal) || 0;
  const distance = Number(input.distance) || 0;
  const model = delivery?.model || 'Fixed';
  let deliveryFee = 0;
  if ((input.orderType || 'Delivery') === 'Delivery') {
    deliveryFee = Number(delivery?.baseFee) || 0;
    if (['Zone-based', 'Special area'].includes(model)) deliveryFee = Number(delivery?.zones?.[input.zone]) || deliveryFee;
    if (['Distance-based', 'Base + distance', 'Base plus distance'].includes(model)) {
      deliveryFee += Math.max(0, distance - (Number(delivery?.includedDistance) || 0)) * (Number(delivery?.additionalDistanceRate) || 0);
    }
    if (model === 'Scheduled surcharge' && input.scheduled) deliveryFee += Number(delivery?.surcharge) || 0;
    deliveryFee = Math.max(Number(delivery?.minimum) || 0, deliveryFee);
    if (delivery?.maximum) deliveryFee = Math.min(Number(delivery.maximum), deliveryFee);
  }

  const selectedRestaurant = ADMIN_MOCK_DATA.restaurants.find((restaurant) => restaurant.id === input.restaurantId);
  const restaurantRate = commissionOverride?.restaurantId === input.restaurantId
    ? commissionOverride
    : configs.find((item) => item.category === 'Commission' && item.status === 'Active' && item.restaurantId === input.restaurantId);
  const commissionRate = restaurantRate ? Number(restaurantRate.rate) : Number(commissionConfig?.rate) || Number(selectedRestaurant?.commissionRate) || 0;
  const commission = commissionConfig?.model === 'Fixed' ? Number(commissionConfig.fixedAmount) || 0 : subtotal * commissionRate / 100;
  const serviceFees = otherFees.filter((item) => {
    if (item.status !== 'Active') return false;
    if (input.orderType === 'Reservation') return item.name.startsWith('Reservation ');
    if (item.name === 'Customer service fee') return true;
    if (item.name === 'Small-order fee') return subtotal < 500;
    return false;
  }).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const discount = input.promo ? Math.min(subtotal, Number(input.discountAmount) || 30) : 0;
  const discountFunding = input.promoFunding || 'Platform';
  const platformDiscount = discountFunding === 'Platform' ? discount : discountFunding === 'Shared' ? discount / 2 : 0;
  const restaurantDiscount = discountFunding === 'Restaurant' ? discount : discountFunding === 'Shared' ? discount / 2 : 0;

  return {
    restaurantSales: subtotal,
    deliveryFee,
    serviceFees,
    commissionRate,
    commission,
    discount,
    discountFunding,
    platformEarnings: commission + serviceFees - platformDiscount,
    restaurantPayable: Math.max(0, subtotal - commission - restaurantDiscount),
    customerTotal: subtotal + deliveryFee + serviceFees - discount,
  };
}

export function getCodRemittances() {
  const overrides = readStorage(COD_STORAGE_KEY, {});
  return getOrdersWithFinancials()
    .filter((order) => order.paymentMethod.includes('(COD)'))
    .map((order) => {
      const state = overrides[order.id] || {};
      const collected = order.status === 'Completed' ? order.feeBreakdown.orderTotal : 0;
      const discrepancy = order.id === 'SALO-MNL-2042' ? 50 : 0;
      const submitted = collected ? collected - discrepancy : 0;
      return {
        id: `COD-${order.id}`,
        orderId: order.id,
        riderId: order.riderId,
        riderName: order.riderName,
        expectedAmount: collected,
        collectedAmount: collected,
        submittedAmount: collected ? (state.submittedAmount ?? submitted) : 0,
        outstandingAmount: collected && state.status === 'remittance_confirmed' ? 0 : Math.max(0, collected - (state.submittedAmount ?? submitted)),
        status: state.status || (collected ? (discrepancy ? 'discrepancy' : 'submitted') : 'collection_pending'),
        history: state.history || [],
        createdAt: order.createdAt,
      };
    });
}

export function updateCodRemittance(orderId, status, actor, reason) {
  const all = readStorage(COD_STORAGE_KEY, {});
  const previous = getCodRemittances().find((item) => item.orderId === orderId);
  if (!previous) throw new Error(`Unknown COD remittance for order: ${orderId}`);
  const now = new Date().toISOString();
  const confirmedAmount = status === 'remittance_confirmed' ? previous.expectedAmount : previous.submittedAmount;
  const nextOutstanding = status === 'remittance_confirmed' ? 0 : previous.outstandingAmount;
  all[orderId] = {
    ...all[orderId],
    status,
    submittedAmount: confirmedAmount,
    history: [...(previous.history || []), {
      who: actor,
      when: now,
      oldValue: { status: previous.status, submittedAmount: previous.submittedAmount, outstandingAmount: previous.outstandingAmount },
      newValue: { status, submittedAmount: confirmedAmount, outstandingAmount: nextOutstanding },
      reason,
    }],
  };
  writeStorage(COD_STORAGE_KEY, all);
  return getCodRemittances().find((item) => item.orderId === orderId);
}

export function getRefundRecords() {
  const overrides = readStorage(REFUND_STORAGE_KEY, {});
  const orderRefunds = getOrdersWithFinancials()
    .filter((order) => order.feeBreakdown.refundAdjustment.amount > 0)
    .map((order) => {
      const state = overrides[order.id] || {};
      return {
        id: `REF-${order.id}`,
        relatedRecordType: 'Order',
        relatedRecordId: order.id,
        originalTransactionId: order.id,
        amount: order.feeBreakdown.refundAdjustment.amount,
        reason: order.feeBreakdown.refundAdjustment.reason,
        customerName: order.customerName,
        restaurant: order.restaurants.join(', '),
        paymentMethod: order.paymentMethod,
        reviewingAdmin: state.reviewingAdmin || null,
        reviewingAdminId: state.reviewingAdminId || null,
        approvalStatus: state.approvalStatus === 'Pending · second approver required'
          ? 'Pending review'
          : state.approvalStatus || 'Pending review',
        secondApprover: state.secondApprover || null,
        providerReference: state.providerReference || null,
        completionStatus: state.completionStatus || 'Not submitted · pending review',
        createdAt: order.createdAt,
        history: state.history || [],
      };
    });
  const reservationRefunds = ADMIN_MOCK_DATA.reservations
    .filter((reservation) => reservation.cancellationInfo?.refundStatus)
    .map((reservation) => {
      const state = overrides[reservation.id] || {};
      return {
        id: `REF-${reservation.id}`,
        relatedRecordType: 'Reservation',
        relatedRecordId: reservation.id,
        originalTransactionId: reservation.id,
        amount: getReservationBreakdown(reservation.id).reservationFee,
        reason: reservation.cancellationInfo.reason,
        customerName: reservation.customerName,
        restaurant: reservation.restaurantName,
        paymentMethod: reservation.paymentMethod,
        reviewingAdmin: state.reviewingAdmin || 'System Administrator',
        reviewingAdminId: state.reviewingAdminId || null,
        approvalStatus: state.approvalStatus || 'Approved',
        secondApprover: state.secondApprover || null,
        providerReference: state.providerReference || `DEMO-REF-${reservation.id}`,
        completionStatus: state.completionStatus || reservation.cancellationInfo.refundStatus,
        createdAt: reservation.cancellationInfo.cancelledAt,
        history: state.history || [],
      };
    });
  return [...orderRefunds, ...reservationRefunds];
}

export function updateRefundRecord(orderId, patch, actor, reason) {
  const all = readStorage(REFUND_STORAGE_KEY, {});
  const previous = getRefundRecords().find((item) => item.relatedRecordId === orderId);
  if (!previous) throw new Error(`Unknown refund record for order: ${orderId}`);
  const now = new Date().toISOString();
  all[orderId] = {
    ...all[orderId],
    ...patch,
    history: [...(previous.history || []), { who: actor, when: now, oldValue: previous.approvalStatus, newValue: patch.approvalStatus || patch.completionStatus, reason }],
  };
  writeStorage(REFUND_STORAGE_KEY, all);
  return getRefundRecords().find((item) => item.relatedRecordId === orderId);
}

export function getPayoutRecords() {
  const adjustments = readStorage(PAYOUT_STORAGE_KEY, {});
  return getOrdersWithFinancials().flatMap((order) => {
    const breakdown = order.feeBreakdown;
    const restaurantAdjustment = Number(adjustments[`${order.id}:restaurant`]?.amount) || 0;
    const riderAdjustment = Number(adjustments[`${order.id}:rider`]?.amount) || 0;
    const restaurantGross = breakdown.restaurantSales;
    const restaurantDeductions = breakdown.platformCommission.amount
      + (breakdown.discount.fundingSource === 'Restaurant' ? breakdown.discount.amount : 0);
    const restaurantNet = breakdown.restaurantPayable + restaurantAdjustment;
    const payoutStatus = order.status === 'Completed' ? 'Pending reconciliation' : 'Queued';
    const records = [{
      id: `PAY-REST-${order.id}`,
      kind: 'Restaurant',
      recipient: order.restaurants.join(', '),
      orderId: order.id,
      relatedTransactions: [order.id],
      gross: restaurantGross,
      deductions: restaurantDeductions,
      adjustments: breakdown.refundAdjustment.amount + restaurantAdjustment,
      netPayable: restaurantNet,
      method: 'Bank transfer',
      status: payoutStatus,
      date: order.createdAt,
      reference: `SALOP-${order.id}`,
      adjustmentHistory: adjustments[`${order.id}:restaurant`]?.history || (breakdown.refundAdjustment.amount ? [{ reason: breakdown.refundAdjustment.reason, amount: -breakdown.refundAdjustment.amount, time: order.createdAt }] : []),
    }];
    if (order.riderId) records.push({
      id: `PAY-RIDER-${order.id}`,
      kind: 'Rider',
      recipient: order.riderName,
      orderId: order.id,
      relatedTransactions: [order.id],
      gross: breakdown.deliveryFee,
      deductions: 0,
      adjustments: riderAdjustment,
      netPayable: breakdown.deliveryFee + riderAdjustment,
      method: 'SALO wallet',
      status: payoutStatus,
      date: order.createdAt,
      reference: `SALOR-${order.id}`,
      adjustmentHistory: adjustments[`${order.id}:rider`]?.history || [],
    });
    return records;
  });
}

export function reconcilePayout(payoutId) {
  const payout = getPayoutRecords().find((item) => item.id === payoutId);
  if (!payout) throw new Error(`Unknown payout: ${payoutId}`);
  return { ...payout, expectedAmount: payout.netPayable, paidAmount: payout.status === 'Paid' ? payout.netPayable : 0, difference: payout.status === 'Paid' ? 0 : payout.netPayable };
}

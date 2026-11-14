import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { ConfirmDialog, PageHeader, StatusBadge, Tabs, Timeline } from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { hasAdminPermission } from '../constants';
import { ADMIN_MOCK_DATA, createAdminDispute, getOrderBreakdown, getOrdersWithFinancials } from '../mocks';
import { formatDateTime, formatPeso } from '../utils/format';
import { appendAdminAuditLog } from '../utils/auditLog';

const DISPUTE_TYPES = [
  'Missing order', 'Payment dispute', 'Restaurant disputes an order', 'Unsafe delivery',
  'Restaurant refuses order', 'Reservation fee dispute', 'COD mismatch', 'Delivered-but-not-received',
];

export default function AdminOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  useAdminPageSearch({ disabled: true });
  const { currentAdmin } = useAdminSession();
  const order = useMemo(() => getOrdersWithFinancials().find((item) => item.id === id), [id]);
  const [activeTab, setActiveTab] = useState('Overview');
  const [riderId, setRiderId] = useState(order?.riderId || '');
  const [assignedRiderId, setAssignedRiderId] = useState(order?.riderId || '');
  const [riderName, setRiderName] = useState(order?.riderName || 'Unassigned');
  const [disputeType, setDisputeType] = useState('Missing order');
  const [internalNote, setInternalNote] = useState('');
  const [notes, setNotes] = useState([]);
  const [timeline, setTimeline] = useState(order?.timeline || []);
  const [localStatus, setLocalStatus] = useState(order?.status || '');
  const [pendingAction, setPendingAction] = useState(null);
  const canIntervene = hasAdminPermission(currentAdmin.role, 'orders', 'edit');
  const canCreateCase = hasAdminPermission(currentAdmin.role, 'support', 'create')
    || hasAdminPermission(currentAdmin.role, 'orders', 'create');

  if (!order) {
    return <AdminLayout><section className="admin-shell-page"><PageHeader title="Order not found" description={`No order matches reference ${id}.`} /><Link to="/admin/orders">Back to orders</Link></section></AdminLayout>;
  }

  const breakdown = getOrderBreakdown(order.id);
  const selectedRider = ADMIN_MOCK_DATA.riders.find((rider) => rider.id === riderId);

  function recordAudit(action, previousValue, newValue, reason) {
    appendAdminAuditLog({
      who: currentAdmin.name,
      role: currentAdmin.role,
      action,
      record: { type: 'Order', id: order.id },
      previousValue,
      newValue,
      reason,
    });
  }

  function confirmAction({ reason }) {
    if (pendingAction.type === 'reassign') {
      const previous = riderName;
      const next = selectedRider?.name || 'Unassigned';
      setRiderName(next);
      setAssignedRiderId(selectedRider?.id || '');
      setTimeline((items) => [{ title: 'Rider reassigned', description: `${previous} → ${next}`, time: new Date().toISOString() }, ...items]);
      recordAudit('Reassigned order rider', previous, next, reason);
    } else if (pendingAction.type === 'cancel') {
      const previous = localStatus;
      setLocalStatus('Cancelled');
      setTimeline((items) => [{ title: 'Order cancelled', description: reason, time: new Date().toISOString() }, ...items]);
      recordAudit('Cancelled order', previous, 'Cancelled', reason);
    } else if (pendingAction.type === 'flag') {
      const created = createAdminDispute({
        type: disputeType,
        relatedRecordType: 'Order',
        relatedRecordId: order.id,
        assignedAdminId: currentAdmin.id,
        priority: 'High',
        evidence: [],
        notes: [],
        timeline: [{ title: 'Case opened', description: reason, time: new Date().toISOString() }],
      });
      recordAudit('Flagged order for dispute', 'No active case', created.id, reason);
      setPendingAction(null);
      navigate(`/admin/orders/disputes/${created.id}`);
      return;
    } else if (pendingAction.type === 'note') {
      const entry = { title: 'Internal note added', description: internalNote.trim(), time: new Date().toISOString() };
      setNotes((previous) => [entry, ...previous]);
      recordAudit('Added internal order note', null, entry.description, reason);
      setInternalNote('');
    }
    setPendingAction(null);
  }

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title={order.id} description={`${order.customerName} · ${order.restaurants.join(', ')}`} actions={<Link className="admin-action-button" to="/admin/orders">Back to orders</Link>} />
        <Tabs items={['Overview', 'Payment', 'Fee breakdown', 'Timeline']} value={activeTab} onChange={setActiveTab} label="Order detail sections" />

        {activeTab === 'Overview' && (
          <div className="admin-record-panel">
            <h2>Order overview</h2>
            <ul className="admin-detail-list">
              <li><strong>Customer</strong>{order.customerName} · {order.customerEmail}</li>
              <li><strong>Delivery address</strong>{order.deliveryAddress} · {order.city}</li>
              <li><strong>Restaurants</strong>{order.restaurants.map((name) => <span key={name}>{name} · {ADMIN_MOCK_DATA.restaurants.find((restaurant) => restaurant.name.startsWith(name))?.ownerName || 'Restaurant partner'}<br /></span>)}</li>
              <li><strong>Assigned rider</strong>{riderName}</li>
              <li><strong>Status</strong><StatusBadge status={localStatus} /></li>
              <li><strong>Placed</strong>{formatDateTime(order.createdAt)}</li>
            </ul>
            <h3>Items</h3>
            <ul className="admin-detail-list">{order.items.map((item) => <li key={item.name}><strong>{item.name} × {item.quantity}</strong>{formatPeso(item.lineTotal)}</li>)}</ul>
          </div>
        )}

        {activeTab === 'Payment' && (
          <div className="admin-record-panel">
            <h2>Payment record</h2>
            <ul className="admin-detail-list">
              <li><strong>Method</strong>{order.paymentMethod}</li>
              <li><strong>Payment status</strong><StatusBadge status={order.paymentStatus} /></li>
              <li><strong>Order total snapshot</strong>{formatPeso(breakdown.orderTotal)}</li>
              <li><strong>Refund / adjustment</strong>{formatPeso(breakdown.refundAdjustment.amount)} · {breakdown.refundAdjustment.reason || 'None'}</li>
            </ul>
          </div>
        )}

        {activeTab === 'Fee breakdown' && (
          <div className="admin-record-panel">
            <h2>Stored fee breakdown</h2>
            <p className="admin-shell-note">This snapshot was recorded for this order. Later fee or commission changes never recalculate historical transactions.</p>
            <ul className="admin-detail-list">
              <li><strong>Restaurant sales</strong>{formatPeso(breakdown.restaurantSales)}</li>
              <li><strong>Platform commission ({breakdown.platformCommission.rate}%)</strong>{formatPeso(breakdown.platformCommission.amount)}</li>
              <li><strong>Delivery fee</strong>{formatPeso(breakdown.deliveryFee)}</li>
              <li><strong>Customer service fee</strong>{formatPeso(breakdown.customerServiceFee)}</li>
              <li><strong>Discount</strong>{formatPeso(breakdown.discount.amount)} · {breakdown.discount.fundingSource}{breakdown.discount.code ? ` · ${breakdown.discount.code}` : ''}</li>
              <li><strong>Refund / adjustment</strong>{formatPeso(breakdown.refundAdjustment.amount)} · {breakdown.refundAdjustment.reason || 'None'}</li>
              <li><strong>Customer order total</strong>{formatPeso(breakdown.orderTotal)}</li>
              <li><strong>Restaurant payable snapshot</strong>{formatPeso(breakdown.restaurantPayable)}</li>
            </ul>
          </div>
        )}

        {activeTab === 'Timeline' && (
          <div className="admin-record-panel">
            <h2>Status history</h2>
            <Timeline items={[...notes, ...timeline].sort((a, b) => new Date(b.time) - new Date(a.time))} />
          </div>
        )}

        <section className="admin-record-panel" aria-labelledby="order-interventions">
          <h2 id="order-interventions">Authorized interventions</h2>
          {!canIntervene && <p className="admin-shell-note">Your role cannot reassign riders, cancel orders, or add order notes.{canCreateCase ? ' You can still flag the order for dispute review.' : ' Backend authorization is required in production.'}</p>}
          {(canIntervene || canCreateCase) && (
            <div className="admin-filter-bar">
              {canIntervene && <>
              <label className="admin-filter-control">Reassign rider<select value={riderId} onChange={(event) => setRiderId(event.target.value)}><option value="">Unassigned</option>{ADMIN_MOCK_DATA.riders.filter((rider) => rider.status === 'Active').map((rider) => <option key={rider.id} value={rider.id}>{rider.name}</option>)}</select></label>
              <button className="admin-action-button" type="button" disabled={riderId === assignedRiderId} onClick={() => setPendingAction({ type: 'reassign', title: 'Confirm rider reassignment', label: 'Save assignment' })}>Reassign rider</button>
              <button className="admin-action-button" type="button" disabled={localStatus === 'Cancelled' || localStatus === 'Completed'} onClick={() => setPendingAction({ type: 'cancel', title: 'Confirm order cancellation', label: 'Cancel order' })}>Cancel order</button>
              </>}
              {canCreateCase && <><label className="admin-filter-control">Dispute type<select value={disputeType} onChange={(event) => setDisputeType(event.target.value)}>{DISPUTE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><button className="admin-action-button" type="button" onClick={() => setPendingAction({ type: 'flag', title: 'Flag order for dispute', label: 'Create case' })}>Flag for dispute</button></>}
              {canIntervene && <>
              <label className="admin-filter-control">Internal note<input value={internalNote} onChange={(event) => setInternalNote(event.target.value)} /></label>
              <button className="admin-action-button" type="button" disabled={!internalNote.trim()} onClick={() => setPendingAction({ type: 'note', title: 'Add internal note', label: 'Add note' })}>Add internal note</button>
              </>}
            </div>
          )}
          {(canIntervene || canCreateCase) && <p className="admin-shell-note">Interventions update operational state only. Stored financial amounts are read-only.</p>}
        </section>

        <ConfirmDialog
          open={Boolean(pendingAction)}
          title={pendingAction?.title}
          description="This operation is recorded in the audit log. Provide a reason to continue."
          confirmLabel={pendingAction?.label}
          requireReauthentication
          requireReason
          onClose={() => setPendingAction(null)}
          onConfirm={confirmAction}
        />
      </section>
    </AdminLayout>
  );
}

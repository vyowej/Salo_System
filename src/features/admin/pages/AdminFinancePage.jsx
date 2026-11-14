import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import {
  ConfirmDialog,
  DataTable,
  FilterBar,
  Modal,
  showAdminToast,
  PageHeader,
  StatCard,
  StatusBadge,
  Tabs,
} from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { hasAdminPermission, ADMIN_HIGH_VALUE_REFUND_THRESHOLD } from '../constants';
import {
  getCodRemittances,
  getFinancialTransactions,
  getPayoutRecords,
  getPlatformTotals,
  getRefundRecords,
  reconcilePayout,
  updateCodRemittance,
  updateRefundRecord,
} from '../mocks';
import { appendAdminAuditLog } from '../utils/auditLog';
import { formatDateTime, formatPeso } from '../utils/format';
import './AdminFinancePages.css';

const TABS = ['Transactions', 'COD', 'Refunds', 'Payouts'];
const INITIAL_FILTERS = { type: '', status: '', method: '', from: '', to: '' };

function relatedLink(transaction) {
  if (transaction.relatedRecordType === 'Reservation') return `/admin/reservations/${transaction.relatedRecordId}`;
  if (transaction.type === 'Refund') return '/admin/orders/disputes';
  return `/admin/orders/${transaction.relatedRecordId}`;
}

function describeRemittanceState(value) {
  if (!value || typeof value !== 'object') return value || '—';
  return `${value.status} · submitted ${formatPeso(value.submittedAmount)} · outstanding ${formatPeso(value.outstandingAmount)}`;
}

export default function AdminFinancePage() {
  const { currentAdmin } = useAdminSession();
  const { query: globalQuery } = useAdminPageSearch({ scopeLabel: 'Finance', placeholder: 'Search transactions by ID, customer, restaurant, or order', searchableFields: ['id', 'customerName', 'restaurant', 'relatedRecordId'] });
  const canApprove = hasAdminPermission(currentAdmin.role, 'finance', 'approve');
  const [activeTab, setActiveTab] = useState('Transactions');
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [search, setSearch] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [selectedPayout, setSelectedPayout] = useState(null);
  const [payoutModal, setPayoutModal] = useState(null);
  const [refundModal, setRefundModal] = useState(null);
  const [extraPayouts, setExtraPayouts] = useState([]);
  const [extraRefunds, setExtraRefunds] = useState([]);

  const totals = getPlatformTotals();
  const transactions = getFinancialTransactions();
  const remittances = getCodRemittances();
  const refunds = [...extraRefunds, ...getRefundRecords()];
  const payouts = [...extraPayouts, ...getPayoutRecords()];
  const filteredTransactions = useMemo(() => transactions.filter((item) => {
    const date = item.createdAt.slice(0, 10);
    const query = (globalQuery || search).trim().toLowerCase();
    return (!query || `${item.id} ${item.customerName} ${item.restaurant} ${item.relatedRecordId}`.toLowerCase().includes(query))
      && (!filters.type || item.type === filters.type)
      && (!filters.status || item.status === filters.status)
      && (!filters.method || item.paymentMethod === filters.method)
      && (!filters.from || date >= filters.from)
      && (!filters.to || date <= filters.to);
  }), [transactions, filters, globalQuery, search]);

  function writeAudit(action, record, previousValue, newValue, reason) {
    appendAdminAuditLog({
      who: currentAdmin.name,
      role: currentAdmin.role,
      action,
      record,
      time: new Date().toISOString(),
      previousValue,
      newValue,
      reason,
    });
  }

  function confirmAction({ reason }) {
    const action = pendingAction;
    if (action.type === 'cod') {
      const updated = updateCodRemittance(action.item.orderId, 'remittance_confirmed', currentAdmin.name, reason);
      writeAudit(
        'Confirmed COD remittance',
        { type: 'COD remittance', id: updated.id },
        { status: action.item.status, submittedAmount: action.item.submittedAmount, outstandingAmount: action.item.outstandingAmount },
        { status: updated.status, submittedAmount: updated.submittedAmount, outstandingAmount: updated.outstandingAmount },
        reason,
      );
    } else if (action.type === 'refund-approve') {
      const highValue = action.item.amount > ADMIN_HIGH_VALUE_REFUND_THRESHOLD;
      const updated = updateRefundRecord(action.item.relatedRecordId, {
        reviewingAdmin: currentAdmin.name,
        reviewingAdminId: currentAdmin.id,
        approvalStatus: highValue ? 'Pending second approver' : 'Approved',
        completionStatus: highValue ? 'Awaiting second approval' : 'Approved · provider submission pending',
      }, currentAdmin.name, reason);
      writeAudit('Approved refund', { type: 'Refund', id: updated.id }, action.item.approvalStatus, updated.approvalStatus, reason);
    } else if (action.type === 'refund-reject') {
      const updated = updateRefundRecord(action.item.relatedRecordId, {
        reviewingAdmin: currentAdmin.name,
        reviewingAdminId: currentAdmin.id,
        approvalStatus: 'Rejected',
        completionStatus: 'Not submitted · rejected',
      }, currentAdmin.name, reason);
      writeAudit('Rejected refund', { type: 'Refund', id: updated.id }, action.item.approvalStatus, updated.approvalStatus, reason);
    } else if (action.type === 'refund-second-approve') {
      if (currentAdmin.id === action.item.reviewingAdminId) return;
      const updated = updateRefundRecord(action.item.relatedRecordId, {
        secondApprover: currentAdmin.name,
        secondApproverId: currentAdmin.id,
        approvalStatus: 'Approved',
        completionStatus: 'Approved · provider submission pending',
      }, currentAdmin.name, reason);
      writeAudit('Second-approved high-value refund', { type: 'Refund', id: updated.id }, action.item.approvalStatus, updated.approvalStatus, reason);
    } else if (action.type === 'record-payout') {
      const paid = Number(action.payload.paidAmount || 0);
      const expected = Number(action.payload.expectedAmount || paid);
      const newPayout = {
        id: `PAY-${Date.now().toString().slice(-4)}`,
        reference: action.payload.reference.trim(),
        payee: action.payload.payee.trim(),
        payeeType: action.payload.payeeType || 'Restaurant',
        period: 'Manual settlement',
        grossAmount: expected,
        expectedAmount: expected,
        paidAmount: paid,
        difference: paid - expected,
        status: paid === expected ? 'Reconciled' : 'Discrepancy',
        paidAt: new Date().toISOString(),
        adjustmentHistory: [{ reason, amount: paid - expected, time: new Date().toISOString() }],
      };
      setExtraPayouts((prev) => [newPayout, ...prev]);
      writeAudit('Recorded payout', { type: 'Payout', id: newPayout.id }, null, `${newPayout.payee} · ${formatPeso(paid)}`, reason);
      showAdminToast(`Recorded payout ${newPayout.reference}.`, 'success');
      setPayoutModal(null);
    } else if (action.type === 'process-refund') {
      const amount = Number(action.payload.amount || 0);
      const highValue = amount > ADMIN_HIGH_VALUE_REFUND_THRESHOLD;
      const newRefund = {
        id: `REF-${Date.now().toString().slice(-4)}`,
        relatedRecordId: action.payload.relatedRecordId.trim(),
        customerName: action.payload.customerName.trim() || 'Customer',
        amount,
        providerReference: action.payload.providerRef.trim() || `PRV-${Date.now().toString().slice(-5)}`,
        reviewingAdmin: currentAdmin.name,
        reviewingAdminId: currentAdmin.id,
        approvalStatus: highValue ? 'Pending second approver' : 'Approved',
        completionStatus: highValue ? 'Awaiting second approval' : 'Approved · provider submission pending',
        createdAt: new Date().toISOString(),
        history: [{ when: new Date().toISOString(), who: currentAdmin.name, newValue: highValue ? 'Pending second approver' : 'Approved', reason }],
      };
      setExtraRefunds((prev) => [newRefund, ...prev]);
      writeAudit('Processed refund', { type: 'Refund', id: newRefund.id }, null, `${newRefund.relatedRecordId} · ${formatPeso(amount)}`, reason);
      showAdminToast(highValue ? `Refund ${newRefund.id} requires a second approver.` : `Refund ${newRefund.id} approved.`, 'success');
      setRefundModal(null);
    }
    setPendingAction(null);
  }

  const transactionColumns = [
    { key: 'id', label: 'Reference', render: (item) => <Link to={relatedLink(item)}>{item.id}</Link> },
    { key: 'type', label: 'Type', render: (item) => <>{item.type}<br /><Link to={`/admin/orders/disputes?record=${item.relatedRecordId}`}>Disputes</Link></> },
    { key: 'customerName', label: 'Customer' },
    { key: 'restaurant', label: 'Restaurant' },
    { key: 'paymentMethod', label: 'Method' },
    { key: 'amount', label: 'Amount', align: 'right', sortValue: (item) => Number(item.amount || 0), render: (item) => formatPeso(item.amount) },
    { key: 'providerVerificationState', label: 'Provider verification', render: (item) => <><StatusBadge status={item.providerVerificationState} /><p>{item.paymentStatus}</p></> },
    { key: 'status', label: 'Status', render: (item) => <StatusBadge status={item.status} /> },
    { key: 'createdAt', label: 'Date', sortValue: (item) => new Date(item.createdAt).getTime(), render: (item) => formatDateTime(item.createdAt) },
  ];

  const codCollectionColumns = [
    { key: 'orderId', label: 'Order', render: (item) => <Link to={`/admin/orders/${item.orderId}`}>{item.orderId}</Link> },
    { key: 'riderName', label: 'Rider' },
    { key: 'collectedAmount', label: 'Collected amount', align: 'right', sortValue: (item) => Number(item.collectedAmount || 0), render: (item) => formatPeso(item.collectedAmount) },
    { key: 'collectionStatus', label: 'Collection status', render: (item) => <StatusBadge status={item.collectedAmount ? 'Collected' : 'Collection pending'} /> },
  ];
  const codRemittanceColumns = [
    { key: 'orderId', label: 'Order', render: (item) => <Link to={`/admin/orders/${item.orderId}`}>{item.orderId}</Link> },
    { key: 'riderName', label: 'Rider' },

    { key: 'submittedAmount', label: 'Remittance submitted', align: 'right', sortValue: (item) => Number(item.submittedAmount || 0), render: (item) => formatPeso(item.submittedAmount) },
    { key: 'outstandingAmount', label: 'Outstanding', align: 'right', sortValue: (item) => Number(item.outstandingAmount || 0), render: (item) => formatPeso(item.outstandingAmount) },
    { key: 'status', label: 'Remittance status', render: (item) => <StatusBadge status={item.status === 'remittance_confirmed' ? 'Verified' : item.status === 'discrepancy' ? 'Discrepancy' : item.status === 'submitted' ? 'Submitted' : 'Not collected'} /> },
    { key: 'action', label: 'Action', render: (item) => item.status === 'remittance_confirmed' ? <StatusBadge status="Verified" /> : item.status === 'submitted' || item.status === 'discrepancy' ? <button className="admin-action-button" type="button" disabled={!canApprove} title={!canApprove ? 'Finance approval permission is required' : undefined} onClick={() => setPendingAction({ type: 'cod', item, title: item.status === 'discrepancy' ? 'Confirm reconciled COD remittance' : 'Confirm COD remittance', confirmLabel: 'Confirm remittance' })}>Confirm remittance</button> : <span>Awaiting cash collection</span> },
  ];

  const refundColumns = [
    { key: 'id', label: 'Refund', render: (item) => <Link to={item.relatedRecordType === 'Reservation' ? `/admin/reservations/${item.relatedRecordId}` : `/admin/orders/${item.relatedRecordId}`}>{item.id}</Link> },
    { key: 'relatedRecordId', label: 'Related record', render: (item) => <Link to={item.relatedRecordType === 'Reservation' ? `/admin/reservations/${item.relatedRecordId}` : `/admin/orders/${item.relatedRecordId}`}>{item.relatedRecordId}</Link> },
    { key: 'originalTransactionId', label: 'Original transaction' },
    { key: 'amount', label: 'Amount', align: 'right', sortValue: (item) => Number(item.amount || 0), render: (item) => formatPeso(item.amount) },
    { key: 'reason', label: 'Reason' },
    { key: 'reviewingAdmin', label: 'Reviewing admin', render: (item) => item.reviewingAdmin || '—' },
    { key: 'approvalStatus', label: 'Approval', render: (item) => <>{item.approvalStatus}{item.amount > ADMIN_HIGH_VALUE_REFUND_THRESHOLD && <small> · second approver required above {formatPeso(ADMIN_HIGH_VALUE_REFUND_THRESHOLD)}</small>}</> },
    { key: 'providerReference', label: 'Provider reference', render: (item) => item.providerReference || 'Not submitted' },
    { key: 'completionStatus', label: 'Completion' },
    { key: 'actions', label: 'Review', render: (item) => <div className="admin-action-row">{item.approvalStatus === 'Pending review' && <><button className="admin-action-button" type="button" disabled={!canApprove} onClick={() => setPendingAction({ type: 'refund-approve', item, title: 'Approve refund', confirmLabel: 'Approve refund' })}>Approve</button><button className="admin-action-button" type="button" disabled={!canApprove} onClick={() => setPendingAction({ type: 'refund-reject', item, title: 'Reject refund', confirmLabel: 'Reject refund' })}>Reject</button></>}{item.approvalStatus === 'Pending second approver' && <><button className="admin-action-button" type="button" disabled={!canApprove || currentAdmin.id === item.reviewingAdminId} title={currentAdmin.id === item.reviewingAdminId ? 'A different administrator must sign in for the second approval' : undefined} onClick={() => setPendingAction({ type: 'refund-second-approve', item, title: 'Second approval for high-value refund', confirmLabel: 'Approve refund' })}>Second approval</button>{currentAdmin.id === item.reviewingAdminId && <span>Requires a different approver</span>}</>}{!['Pending review', 'Pending second approver'].includes(item.approvalStatus) && <StatusBadge status={item.approvalStatus} />}</div> },
  ];

  const payoutColumns = [
    { key: 'id', label: 'Payout', render: (item) => <button className="admin-text-button" type="button" onClick={() => setSelectedPayout(reconcilePayout(item.id))}>{item.reference}</button> },
    { key: 'kind', label: 'Recipient type' },
    { key: 'recipient', label: 'Recipient' },
    { key: 'orderId', label: 'Order', render: (item) => <Link to={`/admin/orders/${item.orderId}`}>{item.orderId}</Link> },
    { key: 'gross', label: 'Gross', render: (item) => formatPeso(item.gross) },
    { key: 'deductions', label: 'Deductions', render: (item) => formatPeso(item.deductions) },
    { key: 'adjustments', label: 'Adjustments', render: (item) => formatPeso(item.adjustments) },
    { key: 'netPayable', label: 'Net payable', render: (item) => formatPeso(item.netPayable) },
    { key: 'method', label: 'Method' },
    { key: 'status', label: 'Status', render: (item) => <StatusBadge status={item.status} /> },
    { key: 'date', label: 'Date', render: (item) => formatDateTime(item.date) },
  ];

  function updateFilter(key, value) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  const payoutDetail = selectedPayout && payouts.find((item) => item.id === selectedPayout.id);

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Finance" description="Review verified payments, separate COD collection from remittance, and reconcile payout snapshots." />
        <div className="admin-stat-grid">
          <StatCard label="Order value (GMV)" value={formatPeso(totals.gmv)} hint="Customer totals from immutable order snapshots" tone="gold" />
          <StatCard label="Platform revenue" value={formatPeso(totals.platformRevenue)} hint="Commission, service fees, discount funding, reservation fees" tone="gold" />
          <StatCard label="Refunds / adjustments" value={formatPeso(totals.refunds)} hint="Recorded order refund adjustments" tone="brown" />
          <StatCard label="Restaurant sales" value={formatPeso(totals.restaurantSales)} hint="Before commission and adjustments" tone="gold" />
          <StatCard label="Outstanding COD" value={formatPeso(totals.outstandingCodRemittances)} hint="Row-level remittances below" tone="brown" />
        </div>
        <p className="admin-shell-note">GMV is not platform revenue. Finance reads the same fee snapshots as Orders; later fee changes never recalculate previous orders. Online payments cannot be manually marked as paid by an administrator.</p>
        <Tabs items={TABS} value={activeTab} onChange={(tab) => { setActiveTab(tab); setSelectedPayout(null); }} label="Finance workspaces" />
        {activeTab === 'Transactions' && <>
          <FilterBar search={search} onSearchChange={setSearch} searchLabel="Search references, customers, or restaurants">
            <label className="admin-filter-control">Type<select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}><option value="">All types</option>{[...new Set(transactions.map((item) => item.type))].map((type) => <option key={type}>{type}</option>)}</select></label>
            <label className="admin-filter-control">Status<select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All statuses</option>{[...new Set(transactions.map((item) => item.status))].map((status) => <option key={status}>{status}</option>)}</select></label>
            <label className="admin-filter-control">Method<select value={filters.method} onChange={(event) => updateFilter('method', event.target.value)}><option value="">All methods</option>{[...new Set(transactions.map((item) => item.paymentMethod))].map((method) => <option key={method}>{method}</option>)}</select></label>
            <label className="admin-filter-control">From<input type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} /></label>
            <label className="admin-filter-control">To<input type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} /></label>
          </FilterBar>
          <DataTable columns={transactionColumns} rows={filteredTransactions} tableSearch={globalQuery} defaultOrder={[[8, 'desc']]} exportFileName="salo-finance-transactions" canExport={canApprove} emptyTitle="No matching transactions" emptyDescription="Adjust the search or filters to see other financial records." />
          <p className="admin-shell-note">Provider verification is read-only in this frontend. Unverified online payments have no “mark as paid” action; failed and disputed transactions link to their order and the Disputes workspace.</p>
        </>}
        {activeTab === 'COD' && <>
          <p className="admin-shell-note">Cash collection and rider remittance are separate events. The “Verified” state appears only after a remittance is explicitly confirmed; a discrepancy must be reconciled before confirmation.</p>
          <section className="admin-record-panel">
            <div className="admin-section-heading"><h2>COD collection</h2></div>
            <DataTable columns={codCollectionColumns} rows={remittances} tableSearch={globalQuery} showLocalSearch emptyTitle="No COD collections" emptyDescription="COD collection events will appear here." />
          </section>
          <section className="admin-record-panel">
            <div className="admin-section-heading"><h2>COD remittance</h2></div>
            <DataTable columns={codRemittanceColumns} rows={remittances} tableSearch={globalQuery} showLocalSearch exportFileName="salo-cod-remittances" canExport={canApprove} emptyTitle="No COD remittances" emptyDescription="COD remittance records will appear here." />
          </section>
          {remittances.some((item) => item.history.length) && <section className="admin-record-panel"><h2>Remittance history</h2>{remittances.filter((item) => item.history.length).map((item) => <div key={item.id}><strong>{item.orderId}</strong>{item.history.map((entry, index) => <p key={`${item.id}-${index}`}>{formatDateTime(entry.when)} · {entry.who}: {describeRemittanceState(entry.oldValue)} → {describeRemittanceState(entry.newValue)} · {entry.reason}</p>)}</div>)}</section>}
        </>}
        {activeTab === 'Refunds' && <>
          <p className="admin-shell-note">Refund records include the source transaction, reviewing administrator, provider reference, approval and completion status. Refunds above {formatPeso(ADMIN_HIGH_VALUE_REFUND_THRESHOLD)} require a different active Finance approver or Super Admin for the second approval.</p>
          {canApprove && <div className="admin-action-row" style={{ marginBottom: '12px' }}><button className="admin-action-button" type="button" onClick={() => setRefundModal({ relatedRecordId: 'SALO-1042', customerName: '', amount: '', providerRef: '' })}>Process refund</button></div>}
          <DataTable columns={refundColumns} rows={refunds} tableSearch={globalQuery} exportFileName="salo-refunds" canExport={canApprove} emptyTitle="No refund records" emptyDescription="Refunds linked to order snapshots will be shown here." />
          {refunds.some((item) => item.history.length) && <section className="admin-record-panel"><h2>Refund approval history</h2>{refunds.filter((item) => item.history.length).map((item) => <div key={item.id}><strong>{item.id}</strong>{item.history.map((entry, index) => <p key={`${item.id}-${index}`}>{formatDateTime(entry.when)} · {entry.who}: {entry.newValue} · {entry.reason}</p>)}</div>)}</section>}
        </>}
        {activeTab === 'Payouts' && <>
          <p className="admin-shell-note">Payout amounts are based on the stored per-order financial snapshot. Reconciliation compares expected net payable with the recorded paid amount.</p>
          {canApprove && <div className="admin-action-row" style={{ marginBottom: '12px' }}><button className="admin-action-button" type="button" onClick={() => setPayoutModal({ payee: payouts[0]?.payee || 'Casa Reyes', payeeType: 'Restaurant', expectedAmount: String(payouts[0]?.expectedAmount || 0), paidAmount: '', reference: '' })}>Record payout</button></div>}
          <DataTable columns={payoutColumns} rows={payouts} tableSearch={globalQuery} defaultOrder={[[10, 'desc']]} exportFileName="salo-payouts" canExport={canApprove} emptyTitle="No payout records" emptyDescription="Restaurant and rider payout records will appear here." />
          {payoutDetail && <section className="admin-record-panel" aria-live="polite">
            <h2>Reconciliation · {payoutDetail.reference}</h2>
            <div className="admin-finance-reconciliation">
              <p><strong>Expected net payable</strong>{formatPeso(selectedPayout.expectedAmount)}</p>
              <p><strong>Paid</strong>{formatPeso(selectedPayout.paidAmount)}</p>
              <p className={selectedPayout.difference ? 'admin-finance-difference' : ''}><strong>Difference</strong>{formatPeso(selectedPayout.difference)}</p>
            </div>
            <h3>Adjustment history</h3>
            {payoutDetail.adjustmentHistory.length ? <ul>{payoutDetail.adjustmentHistory.map((entry, index) => <li key={`${payoutDetail.id}-${index}`}>{entry.reason} · {formatPeso(entry.amount)} · {entry.time ? formatDateTime(entry.time) : 'Recorded in snapshot'}</li>)}</ul> : <p>No payout adjustments recorded.</p>}
            <button className="admin-action-button" type="button" onClick={() => setSelectedPayout(null)}>Close reconciliation</button>
          </section>}
        </>}
        {!canApprove && <p className="admin-shell-note">This role is view-only for finance approvals. Approval actions remain unavailable.</p>}
        <Modal
          open={Boolean(payoutModal)}
          onClose={() => setPayoutModal(null)}
          size="md"
          title="Record payout"
          footer={payoutModal ? (
            <>
              <button className="admin-action-button" type="button" onClick={() => setPayoutModal(null)}>Cancel</button>
              <button className="admin-action-button" type="submit" form="finance-payout-form">Review and record</button>
            </>
          ) : null}
        >
          {payoutModal && (
            <form
              id="finance-payout-form"
              className="admin-modal-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!payoutModal.payee.trim() || !payoutModal.reference.trim() || Number(payoutModal.paidAmount) <= 0) return;
                setPendingAction({ type: 'record-payout', payload: payoutModal, title: 'Confirm payout record', confirmLabel: 'Record payout' });
              }}
            >
              <label className="admin-filter-control">Payee<input required value={payoutModal.payee} onChange={(event) => setPayoutModal((prev) => ({ ...prev, payee: event.target.value }))} /></label>
              <label className="admin-filter-control">Payee type<select value={payoutModal.payeeType} onChange={(event) => setPayoutModal((prev) => ({ ...prev, payeeType: event.target.value }))}><option>Restaurant</option><option>Rider</option></select></label>
              <label className="admin-filter-control">Reference<input required placeholder="e.g. PAY-2026-091" value={payoutModal.reference} onChange={(event) => setPayoutModal((prev) => ({ ...prev, reference: event.target.value }))} /></label>
              <label className="admin-filter-control">Expected payable<input type="number" min="0" step="0.01" required value={payoutModal.expectedAmount} onChange={(event) => setPayoutModal((prev) => ({ ...prev, expectedAmount: event.target.value }))} /></label>
              <label className="admin-filter-control">Paid amount<input type="number" min="0.01" step="0.01" required value={payoutModal.paidAmount} onChange={(event) => setPayoutModal((prev) => ({ ...prev, paidAmount: event.target.value }))} /></label>
            </form>
          )}
        </Modal>

        <Modal
          open={Boolean(refundModal)}
          onClose={() => setRefundModal(null)}
          size="md"
          title="Process refund"
          footer={refundModal ? (
            <>
              <button className="admin-action-button" type="button" onClick={() => setRefundModal(null)}>Cancel</button>
              <button className="admin-action-button" type="submit" form="finance-refund-form">Review refund</button>
            </>
          ) : null}
        >
          {refundModal && (
            <form
              id="finance-refund-form"
              className="admin-modal-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!refundModal.relatedRecordId.trim() || Number(refundModal.amount) <= 0) return;
                setPendingAction({ type: 'process-refund', payload: refundModal, title: 'Confirm refund processing', confirmLabel: 'Process refund' });
              }}
            >
              <label className="admin-filter-control">Order / reference ID<input required value={refundModal.relatedRecordId} onChange={(event) => setRefundModal((prev) => ({ ...prev, relatedRecordId: event.target.value }))} /></label>
              <label className="admin-filter-control">Customer name<input required value={refundModal.customerName} onChange={(event) => setRefundModal((prev) => ({ ...prev, customerName: event.target.value }))} /></label>
              <label className="admin-filter-control">Refund amount<input type="number" min="0.01" step="0.01" required value={refundModal.amount} onChange={(event) => setRefundModal((prev) => ({ ...prev, amount: event.target.value }))} /></label>
              <label className="admin-filter-control">Provider reference<input placeholder="Optional provider ref" value={refundModal.providerRef} onChange={(event) => setRefundModal((prev) => ({ ...prev, providerRef: event.target.value }))} /></label>
              {Number(refundModal.amount) > ADMIN_HIGH_VALUE_REFUND_THRESHOLD && <p className="admin-shell-note">Amount exceeds {formatPeso(ADMIN_HIGH_VALUE_REFUND_THRESHOLD)}. A second Finance approver or Super Admin will be required.</p>}
            </form>
          )}
        </Modal>

        <ConfirmDialog
          open={Boolean(pendingAction)}
          title={pendingAction?.title}
          description={pendingAction?.type === 'cod' ? 'Confirm that the rider remittance was received and reconciled. This changes remittance status only; it does not change the original order total.' : 'Record the approval decision with an audit reason.'}
          confirmLabel={pendingAction?.confirmLabel}
          requireReauthentication
          requireReason
          onClose={() => setPendingAction(null)}
          onConfirm={confirmAction}
        >
          {pendingAction?.type === 'refund-second-approve' && <p className="admin-finance-second-approver">Second approver: {currentAdmin.name} · {currentAdmin.role}. This administrator must differ from the first approver ({pendingAction.item.reviewingAdmin}).</p>}
        </ConfirmDialog>
      </section>
    </AdminLayout>
  );
}

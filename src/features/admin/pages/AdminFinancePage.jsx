import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import adminApiService from '../../../services/adminApiService';
import {
  ConfirmDialog,
  DataTable,
  DetailDrawer,
  PageHeader,
  StatusBadge,
  Tabs,
  showAdminToast,
} from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { formatDateTime, formatPeso } from '../utils/format';
import './AdminPages.css';

const FINANCE_TABS = [
  { value: 'cod', label: 'COD Remittances' },
  { value: 'refunds', label: 'Online Refunds' },
  { value: 'ledger', label: 'Ledger Journals' },
  { value: 'events', label: 'Payment Events' },
];

export default function AdminFinancePage() {
  const { query: globalQuery } = useAdminPageSearch({
    scopeLabel: 'Finance & Refunds',
    placeholder: 'Search finance records by reference, order, or restaurant',
    searchableFields: ['order_reference', 'refund_reference', 'rider_name', 'restaurant_name', 'journal_reference', 'event_key'],
  });

  const [activeTab, setActiveTab] = useState('cod');
  const [summary, setSummary] = useState({});
  const [ledgerSummary, setLedgerSummary] = useState({});
  const [reconciliation, setReconciliation] = useState({});
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [notice, setNotice] = useState('');

  // Refunds state
  const [refunds, setRefunds] = useState([]);
  const [refundsLoading, setRefundsLoading] = useState(false);
  const [refundStatusFilter, setRefundStatusFilter] = useState('all');
  const [refundProviderFilter, setRefundProviderFilter] = useState('all');
  const [refundSearch, setRefundSearch] = useState('');
  const [refundDateFrom, setRefundDateFrom] = useState('');
  const [refundDateTo, setRefundDateTo] = useState('');
  const [selectedRefund, setSelectedRefund] = useState(null);
  const [refundDetailLoading, setRefundDetailLoading] = useState(false);
  const [submitConfirmRefund, setSubmitConfirmRefund] = useState(null);
  const [submittingRefund, setSubmittingRefund] = useState(false);

  // Ledger state
  const [journals, setJournals] = useState([]);
  const [journalTypeFilter, setJournalTypeFilter] = useState('all');
  const [journalSearch, setJournalSearch] = useState('');

  // Events state
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventStatusFilter, setEventStatusFilter] = useState('all');

  const loadFinanceOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [res, ledgerRes] = await Promise.all([
        adminApiService.getCodRemittances({
          remittance_status: statusFilter,
          search: search.trim() || undefined,
          per_page: 50,
        }),
        adminApiService.getFinanceLedger({
          journal_type: journalTypeFilter,
          search: journalSearch.trim() || undefined,
          per_page: 30,
        }).catch(() => ({ summary: {}, reconciliation: {}, recent_journals: [] })),
      ]);
      setSummary(res.summary || {});
      setItems(res.items || []);
      setLedgerSummary(ledgerRes?.summary || {});
      setReconciliation(ledgerRes?.reconciliation || {});
      setJournals(ledgerRes?.recent_journals || []);
    } catch (err) {
      setNotice(err?.message || 'Unable to load finance records.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, journalTypeFilter, journalSearch]);

  const loadRefunds = useCallback(async () => {
    setRefundsLoading(true);
    try {
      const res = await adminApiService.getFinanceRefunds({
        refund_status: refundStatusFilter,
        provider: refundProviderFilter,
        search: refundSearch.trim() || undefined,
        date_from: refundDateFrom || undefined,
        date_to: refundDateTo || undefined,
        per_page: 30,
      });
      setRefunds(res.items || []);
    } catch (err) {
      showAdminToast(err?.message || 'Unable to load refunds.', 'danger');
    } finally {
      setRefundsLoading(false);
    }
  }, [refundStatusFilter, refundProviderFilter, refundSearch, refundDateFrom, refundDateTo]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const res = await adminApiService.getFinanceEvents({
        processing_status: eventStatusFilter,
        per_page: 30,
      });
      setEvents(res.items || []);
    } catch (err) {
      showAdminToast(err?.message || 'Unable to load payment events.', 'danger');
    } finally {
      setEventsLoading(false);
    }
  }, [eventStatusFilter]);

  useEffect(() => {
    loadFinanceOverview();
  }, [loadFinanceOverview]);

  useEffect(() => {
    if (activeTab === 'refunds') {
      loadRefunds();
    } else if (activeTab === 'events') {
      loadEvents();
    }
  }, [activeTab, loadRefunds, loadEvents]);

  async function handleVerify({ reason }) {
    if (!confirmAction) return;
    const { item, action } = confirmAction;
    try {
      await adminApiService.verifyCodRemittance(item.delivery_id, {
        action,
        notes: reason,
      });
      showAdminToast(
        action === 'confirm'
          ? `Confirmed COD remittance for ${item.order_reference}.`
          : `Flagged COD discrepancy for ${item.order_reference}.`,
        action === 'confirm' ? 'success' : 'warning',
      );
      setConfirmAction(null);
      await loadFinanceOverview();
    } catch (err) {
      showAdminToast(err?.message || 'Unable to update COD remittance.', 'danger');
      setConfirmAction(null);
    }
  }

  async function openRefundDetail(refundId) {
    setRefundDetailLoading(true);
    try {
      const detail = await adminApiService.getFinanceRefundDetail(refundId);
      setSelectedRefund(detail);
    } catch (err) {
      showAdminToast(err?.message || 'Unable to load refund details.', 'danger');
    } finally {
      setRefundDetailLoading(false);
    }
  }

  async function handleConfirmSubmitRefund() {
    if (!submitConfirmRefund || submittingRefund) return;
    setSubmittingRefund(true);
    try {
      const updated = await adminApiService.submitFinanceRefund(submitConfirmRefund.refund_id);
      showAdminToast(`Refund ${submitConfirmRefund.refund_reference} submitted to provider.`, 'success');
      setSubmitConfirmRefund(null);
      if (selectedRefund?.refund_id === submitConfirmRefund.refund_id && updated) {
        setSelectedRefund(updated);
      }
      await Promise.all([loadRefunds(), loadFinanceOverview()]);
    } catch (err) {
      showAdminToast(err?.message || 'Unable to submit refund to provider.', 'danger');
      setSubmitConfirmRefund(null);
    } finally {
      setSubmittingRefund(false);
    }
  }

  const codColumns = [
    { key: 'order_reference', label: 'Order Ref', render: (row) => <strong>{row.order_reference}</strong> },
    { key: 'rider_name', label: 'Rider' },
    { key: 'restaurant_name', label: 'Restaurant' },
    { key: 'cod_amount_collected', label: 'COD Collected', align: 'right', render: (row) => formatPeso(row.cod_amount_collected) },
    { key: 'cod_collected_at', label: 'Collected At', render: (row) => (row.cod_collected_at ? formatDateTime(row.cod_collected_at) : '—') },
    { key: 'cod_remitted_at', label: 'Submitted At', render: (row) => (row.cod_remitted_at ? formatDateTime(row.cod_remitted_at) : '—') },
    { key: 'cod_remittance_status', label: 'Remittance Status', render: (row) => <StatusBadge status={row.cod_remittance_status} /> },
  ];

  const refundColumns = [
    { key: 'refund_reference', label: 'Refund Ref', render: (row) => <strong>{row.refund_reference}</strong> },
    { key: 'order_reference', label: 'Order Ref', render: (row) => row.order_reference || `#${row.order_id}` },
    { key: 'restaurant_name', label: 'Restaurant', render: (row) => row.restaurant_name || '—' },
    { key: 'customer_name', label: 'Customer', render: (row) => row.customer_name || '—' },
    { key: 'provider_name', label: 'Provider', render: (row) => (row.provider_name ? String(row.provider_name).toUpperCase() : '—') },
    { key: 'amount', label: 'Amount', align: 'right', render: (row) => formatPeso(row.amount) },
    {
      key: 'refund_status',
      label: 'Refund Status',
      render: (row) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <StatusBadge status={row.refund_status} />
          {row.submission_state === 'uncertain' && <StatusBadge status="warning" label="Uncertain" />}
        </span>
      ),
    },
    { key: 'created_at', label: 'Requested At', render: (row) => (row.created_at ? formatDateTime(row.created_at) : '—') },
  ];

  const journalColumns = [
    { key: 'journal_reference', label: 'Journal Ref', render: (row) => <strong>{row.journal_reference}</strong> },
    { key: 'journal_type', label: 'Type', render: (row) => <StatusBadge status={row.journal_type} /> },
    { key: 'description', label: 'Description' },
    { key: 'debit_total', label: 'Debit', align: 'right', render: (row) => formatPeso(row.debit_total || 0) },
    { key: 'credit_total', label: 'Credit', align: 'right', render: (row) => formatPeso(row.credit_total || 0) },
    { key: 'payment_id', label: 'Payment ID', render: (row) => row.payment_id || '—' },
    { key: 'posted_at', label: 'Posted At', render: (row) => (row.posted_at ? formatDateTime(row.posted_at) : '—') },
  ];

  const eventColumns = [
    { key: 'event_key', label: 'Event Key', render: (row) => <strong>{row.event_key}</strong> },
    { key: 'provider_name', label: 'Provider', render: (row) => String(row.provider_name || '—').toUpperCase() },
    { key: 'payment_reference', label: 'Payment Ref', render: (row) => row.payment_reference || `#${row.payment_id || '—'}` },
    { key: 'processing_status', label: 'Status', render: (row) => <StatusBadge status={row.processing_status} /> },
    { key: 'error_message', label: 'Error', render: (row) => row.error_message || '—' },
    { key: 'processed_at', label: 'Processed At', render: (row) => (row.processed_at ? formatDateTime(row.processed_at) : '—') },
  ];

  const awaitingRefundsTotal = (reconciliation.requested_refunds_total || 0) + (reconciliation.submitted_refunds_total || 0);
  const awaitingRefundsCount = (reconciliation.requested_refunds_count || 0) + (reconciliation.submitted_refunds_count || 0);

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Finance, Refunds & Reconciliation"
          description="Reconcile online payments, manage provider-backed refunds, inspect double-entry ledger journals, and verify COD remittances."
        />
        {notice && <p className="admin-inline-notice" role="status">{notice}</p>}

        <div className="admin-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <div className="admin-record-panel">
            <div className="admin-muted">Gross Online Payments</div>
            <strong>{formatPeso(reconciliation.gross_online_payments ?? ledgerSummary.online_payments_total ?? 0)}</strong>
            <div className="admin-muted">Pending: {formatPeso(reconciliation.pending_online_payments || 0)}</div>
          </div>
          <div className="admin-record-panel">
            <div className="admin-muted">Confirmed Refunds</div>
            <strong>{formatPeso(reconciliation.confirmed_refunds_total ?? ledgerSummary.refunds_total ?? 0)}</strong>
            <div className="admin-muted">{reconciliation.confirmed_refunds_count || 0} successful</div>
          </div>
          <div className="admin-record-panel">
            <div className="admin-muted">Refunds Awaiting Confirmation</div>
            <strong>{formatPeso(awaitingRefundsTotal)}</strong>
            <div className="admin-muted">{awaitingRefundsCount} requested/submitted</div>
          </div>
          <div className="admin-record-panel">
            <div className="admin-muted">Failed / Manual / Uncertain</div>
            <strong>{formatPeso((reconciliation.failed_refunds_total || 0) + (reconciliation.manual_refunds_total || 0))}</strong>
            <div className="admin-muted">
              {(reconciliation.failed_refunds_count || 0)} failed · {(reconciliation.manual_refunds_count || 0)} manual · {(reconciliation.uncertain_refunds_count || 0)} uncertain
            </div>
          </div>
          <div className="admin-record-panel">
            <div className="admin-muted">Net Online Payments</div>
            <strong>{formatPeso(reconciliation.net_online_payments || 0)}</strong>
            <div className="admin-muted">
              {(ledgerSummary.unbalanced_count || 0) === 0 ? 'Ledger balanced' : `${ledgerSummary.unbalanced_count} unbalanced`}
            </div>
          </div>
          <div className="admin-record-panel">
            <div className="admin-muted">COD Pending / Submitted</div>
            <strong>{formatPeso((summary.pending_amount || 0) + (summary.submitted_amount || 0))}</strong>
            <div className="admin-muted">Confirmed: {formatPeso(summary.confirmed_amount || 0)}</div>
          </div>
        </div>

        <Tabs items={FINANCE_TABS} value={activeTab} onChange={setActiveTab} label="Finance sections" />

        {activeTab === 'cod' && (
          <>
            <div className="admin-filter-bar" style={{ marginTop: 12 }}>
              <label className="admin-filter-control">
                Search
                <input
                  aria-label="Search COD remittances"
                  placeholder="Order ref, rider, or restaurant"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label className="admin-filter-control">
                Remittance status
                <select
                  aria-label="Filter by COD remittance status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="submitted">Submitted</option>
                  <option value="pending">Pending with Rider</option>
                  <option value="discrepancy">Discrepancy</option>
                  <option value="confirmed">Confirmed</option>
                </select>
              </label>
            </div>

            <DataTable
              columns={codColumns}
              rows={items}
              loading={loading}
              tableSearch={globalQuery}
              rowActions={(row) => {
                if (row.cod_remittance_status === 'confirmed') return [];
                return [
                  { label: 'Confirm Remittance', onClick: () => setConfirmAction({ item: row, action: 'confirm' }) },
                  { label: 'Flag Discrepancy', onClick: () => setConfirmAction({ item: row, action: 'flag_discrepancy' }) },
                ];
              }}
              emptyTitle="No COD remittance records"
              emptyDescription="COD collections from delivered orders will appear here."
            />
          </>
        )}

        {activeTab === 'refunds' && (
          <>
            <div className="admin-filter-bar" style={{ marginTop: 12 }}>
              <label className="admin-filter-control">
                Search
                <input
                  aria-label="Search refunds"
                  placeholder="Refund ref, order ref, provider ID, customer"
                  value={refundSearch}
                  onChange={(e) => setRefundSearch(e.target.value)}
                />
              </label>
              <label className="admin-filter-control">
                Status
                <select aria-label="Filter by refund status" value={refundStatusFilter} onChange={(e) => setRefundStatusFilter(e.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="requested">Requested</option>
                  <option value="submitted">Submitted</option>
                  <option value="processing">Processing</option>
                  <option value="successful">Successful</option>
                  <option value="failed">Failed</option>
                  <option value="manual">Manual Review</option>
                </select>
              </label>
              <label className="admin-filter-control">
                Provider
                <select aria-label="Filter by provider" value={refundProviderFilter} onChange={(e) => setRefundProviderFilter(e.target.value)}>
                  <option value="all">All providers</option>
                  <option value="xendit">Xendit</option>
                  <option value="sandbox">Sandbox</option>
                </select>
              </label>
              <label className="admin-filter-control">
                From
                <input type="date" aria-label="Refund date from" value={refundDateFrom} onChange={(e) => setRefundDateFrom(e.target.value)} />
              </label>
              <label className="admin-filter-control">
                To
                <input type="date" aria-label="Refund date to" value={refundDateTo} onChange={(e) => setRefundDateTo(e.target.value)} />
              </label>
            </div>

            <DataTable
              columns={refundColumns}
              rows={refunds}
              loading={refundsLoading}
              tableSearch={globalQuery}
              rowActions={(row) => {
                const actions = [
                  { label: 'View Details', onClick: () => openRefundDetail(row.refund_id) },
                ];
                if (row.can_submit) {
                  actions.push({ label: 'Submit to Provider', onClick: () => setSubmitConfirmRefund(row) });
                }
                return actions;
              }}
              emptyTitle="No refund records"
              emptyDescription="Online order refunds will appear here when requested."
            />
          </>
        )}

        {activeTab === 'ledger' && (
          <>
            <div className="admin-filter-bar" style={{ marginTop: 12 }}>
              <label className="admin-filter-control">
                Search
                <input
                  aria-label="Search ledger journals"
                  placeholder="Journal ref, description, payment ID"
                  value={journalSearch}
                  onChange={(e) => setJournalSearch(e.target.value)}
                />
              </label>
              <label className="admin-filter-control">
                Journal Type
                <select aria-label="Filter by journal type" value={journalTypeFilter} onChange={(e) => setJournalTypeFilter(e.target.value)}>
                  <option value="all">All types</option>
                  <option value="payment">Payment</option>
                  <option value="refund">Refund</option>
                  <option value="cod_remittance">COD Remittance</option>
                  <option value="reversal">Reversal</option>
                </select>
              </label>
            </div>

            <DataTable
              columns={journalColumns}
              rows={journals}
              loading={loading}
              tableSearch={globalQuery}
              emptyTitle="No ledger journals"
              emptyDescription="Double-entry accounting journals will appear here."
            />
          </>
        )}

        {activeTab === 'events' && (
          <>
            <div className="admin-filter-bar" style={{ marginTop: 12 }}>
              <label className="admin-filter-control">
                Processing Status
                <select aria-label="Filter by event status" value={eventStatusFilter} onChange={(e) => setEventStatusFilter(e.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="processed">Processed</option>
                  <option value="ignored">Ignored</option>
                  <option value="failed">Failed</option>
                  <option value="received">Received</option>
                </select>
              </label>
            </div>

            <DataTable
              columns={eventColumns}
              rows={events}
              loading={eventsLoading}
              tableSearch={globalQuery}
              emptyTitle="No payment events"
              emptyDescription="Sanitized provider webhook and initiation events will appear here."
            />
          </>
        )}
      </section>

      <DetailDrawer
        open={Boolean(selectedRefund) || refundDetailLoading}
        title={selectedRefund ? `Refund ${selectedRefund.refund_reference}` : 'Loading refund...'}
        onClose={() => setSelectedRefund(null)}
      >
        {selectedRefund && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 'var(--font-size-sm)' }}>
            <div><strong>Status:</strong> <StatusBadge status={selectedRefund.refund_status} /></div>
            <div><strong>Amount:</strong> {formatPeso(selectedRefund.amount)} ({selectedRefund.currency})</div>
            <div><strong>Provider:</strong> {selectedRefund.provider_name || '—'} | <strong>Provider Refund ID:</strong> {selectedRefund.provider_refund_id || '—'}</div>
            <div><strong>Original Payment:</strong> #{selectedRefund.original_payment_id} ({selectedRefund.original_payment_reference}) · Provider Payment ID: {selectedRefund.original_provider_payment_id || '—'}</div>
            <div><strong>Order / Restaurant:</strong> {selectedRefund.order_reference || `#${selectedRefund.order_id}`} · {selectedRefund.restaurant_name || '—'}</div>
            <div><strong>Customer:</strong> {selectedRefund.customer_name} ({selectedRefund.customer_email || '—'})</div>
            <div><strong>Reason:</strong> {selectedRefund.reason || '—'}</div>
            {selectedRefund.failure_reason && <div><strong>Failure Reason:</strong> {selectedRefund.failure_reason}</div>}
            {selectedRefund.submission_state && <div><strong>Submission State:</strong> {selectedRefund.submission_state}</div>}
            <div><strong>Requested:</strong> {selectedRefund.created_at ? formatDateTime(selectedRefund.created_at) : '—'} | <strong>Confirmed:</strong> {selectedRefund.paid_at ? formatDateTime(selectedRefund.paid_at) : '—'}</div>

            {selectedRefund.can_submit && (
              <div>
                <button className="admin-btn admin-btn--primary" type="button" onClick={() => setSubmitConfirmRefund(selectedRefund)}>
                  Submit Refund to Provider
                </button>
              </div>
            )}

            <div>
              <strong>Ledger Journals ({(selectedRefund.ledger_journals || []).length})</strong>
              {(selectedRefund.ledger_journals || []).map((j) => (
                <div key={j.journal_id} style={{ marginTop: 6, padding: 8, border: '1px solid var(--border-secondary)', borderRadius: 6 }}>
                  <div>{j.journal_reference} ({j.journal_type})</div>
                  {(j.entries || []).map((e, idx) => (
                    <div key={idx} className="admin-muted">
                      {e.direction.toUpperCase()} {e.account_code} {e.account_name}: {formatPeso(e.amount)}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div>
              <strong>Audit Logs ({(selectedRefund.audit_logs || []).length})</strong>
              {(selectedRefund.audit_logs || []).map((l) => (
                <div key={l.log_id} className="admin-muted" style={{ marginTop: 4 }}>
                  {l.action} by {l.actor_name} ({l.created_at ? formatDateTime(l.created_at) : '—'})
                </div>
              ))}
            </div>
          </div>
        )}
      </DetailDrawer>

      <ConfirmDialog
        open={Boolean(submitConfirmRefund)}
        title="Submit refund to payment provider?"
        description={submitConfirmRefund
          ? `Submit refund ${submitConfirmRefund.refund_reference} (${formatPeso(submitConfirmRefund.amount)}) for order ${submitConfirmRefund.order_reference || submitConfirmRefund.order_id} to ${String(submitConfirmRefund.provider_name || 'provider').toUpperCase()}?`
          : ''}
        confirmLabel={submittingRefund ? 'Submitting...' : 'Submit Refund'}
        variant="primary"
        onConfirm={handleConfirmSubmitRefund}
        onCancel={() => setSubmitConfirmRefund(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.action === 'confirm' ? 'Confirm COD remittance?' : 'Flag COD discrepancy?'}
        description={confirmAction?.action === 'confirm'
          ? `Mark ${formatPeso(confirmAction?.item?.cod_amount_collected || 0)} for ${confirmAction?.item?.order_reference} as confirmed.`
          : `Flag a cash discrepancy for ${confirmAction?.item?.order_reference} and notify the rider.`}
        confirmLabel={confirmAction?.action === 'confirm' ? 'Confirm Remittance' : 'Flag Discrepancy'}
        variant={confirmAction?.action === 'confirm' ? 'primary' : 'danger'}
        requireReason={confirmAction?.action === 'flag_discrepancy'}
        reasonLabel="Discrepancy notes"
        reasonPlaceholder="Describe the cash discrepancy..."
        onConfirm={handleVerify}
        onCancel={() => setConfirmAction(null)}
      />
    </AdminLayout>
  );
}

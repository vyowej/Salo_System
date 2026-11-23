import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import adminApiService from '../../../services/adminApiService';
import {
  ConfirmDialog,
  DataTable,
  PageHeader,
  StatusBadge,
  showAdminToast,
} from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { formatDateTime, formatPeso } from '../utils/format';
import './AdminPages.css';

export default function AdminFinancePage() {
  const { query: globalQuery } = useAdminPageSearch({
    scopeLabel: 'COD Finance',
    placeholder: 'Search COD remittances by order ref, rider, or restaurant',
    searchableFields: ['order_reference', 'rider_name', 'restaurant_name'],
  });

  const [summary, setSummary] = useState({});
  const [ledgerSummary, setLedgerSummary] = useState({});
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [notice, setNotice] = useState('');

  const loadRemittances = useCallback(async () => {
    setLoading(true);
    try {
      const [res, ledgerRes] = await Promise.all([
        adminApiService.getCodRemittances({
          remittance_status: statusFilter,
          search: search.trim() || undefined,
          per_page: 50,
        }),
        adminApiService.getFinanceLedger().catch(() => ({ summary: {} })),
      ]);
      setSummary(res.summary || {});
      setLedgerSummary(ledgerRes?.summary || {});
      setItems(res.items || []);
    } catch (err) {
      setNotice(err?.message || 'Unable to load COD remittance records.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    loadRemittances();
  }, [loadRemittances]);

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
      await loadRemittances();
    } catch (err) {
      showAdminToast(err?.message || 'Unable to update COD remittance.', 'danger');
      setConfirmAction(null);
    }
  }

  const columns = [
    { key: 'order_reference', label: 'Order Ref', render: (row) => <strong>{row.order_reference}</strong> },
    { key: 'rider_name', label: 'Rider' },
    { key: 'restaurant_name', label: 'Restaurant' },
    { key: 'cod_amount_collected', label: 'COD Collected', align: 'right', render: (row) => formatPeso(row.cod_amount_collected) },
    { key: 'cod_collected_at', label: 'Collected At', render: (row) => (row.cod_collected_at ? formatDateTime(row.cod_collected_at) : '—') },
    { key: 'cod_remitted_at', label: 'Submitted At', render: (row) => (row.cod_remitted_at ? formatDateTime(row.cod_remitted_at) : '—') },
    { key: 'cod_remittance_status', label: 'Remittance Status', render: (row) => <StatusBadge status={row.cod_remittance_status} /> },
  ];

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Finance & COD Remittances"
          description="Verify rider Cash-on-Delivery collections, confirm remittances, and flag discrepancies."
        />
        {notice && <p className="admin-inline-notice" role="status">{notice}</p>}

        <div className="admin-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <div className="admin-record-panel">
            <div className="admin-muted">Pending with Riders</div>
            <strong>{formatPeso(summary.pending_amount || 0)}</strong>
            <div className="admin-muted">{summary.pending_count || 0} delivery(ies)</div>
          </div>
          <div className="admin-record-panel">
            <div className="admin-muted">Submitted (Awaiting Verify)</div>
            <strong>{formatPeso(summary.submitted_amount || 0)}</strong>
            <div className="admin-muted">{summary.submitted_count || 0} delivery(ies)</div>
          </div>
          <div className="admin-record-panel">
            <div className="admin-muted">Confirmed Remitted</div>
            <strong>{formatPeso(summary.confirmed_amount || 0)}</strong>
            <div className="admin-muted">{summary.confirmed_count || 0} delivery(ies)</div>
          </div>
          <div className="admin-record-panel">
            <div className="admin-muted">Discrepancies</div>
            <strong>{formatPeso(summary.discrepancy_amount || 0)}</strong>
            <div className="admin-muted">{summary.discrepancy_count || 0} delivery(ies)</div>
          </div>
          <div className="admin-record-panel">
            <div className="admin-muted">Online Payments</div>
            <strong>{formatPeso(ledgerSummary.online_payments_total || 0)}</strong>
            <div className="admin-muted">{ledgerSummary.total_journals || 0} ledger journal(s)</div>
          </div>
          <div className="admin-record-panel">
            <div className="admin-muted">Refunds Processed</div>
            <strong>{formatPeso(ledgerSummary.refunds_total || 0)}</strong>
            <div className="admin-muted">
              {(ledgerSummary.unbalanced_count || 0) === 0 ? 'Ledger balanced' : `${ledgerSummary.unbalanced_count} unbalanced`}
            </div>
          </div>
        </div>

        <div className="admin-filter-bar">
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
          columns={columns}
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
      </section>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.action === 'confirm' ? 'Confirm COD remittance?' : 'Flag COD discrepancy?'}
        description={confirmAction?.action === 'confirm'
          ? `Mark ${formatPeso(confirmAction?.item?.cod_amount_collected || 0)} for ${confirmAction?.item?.order_reference} as confirmed.`
          : `Flag a cash discrepancy for ${confirmAction?.item?.order_reference} and notify the rider.`}
        confirmLabel={confirmAction?.action === 'confirm' ? 'Confirm Remittance' : 'Flag Discrepancy'}
        requireReason={confirmAction?.action === 'flag_discrepancy'}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleVerify}
      />
    </AdminLayout>
  );
}

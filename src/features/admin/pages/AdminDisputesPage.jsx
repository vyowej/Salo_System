import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import adminApiService from '../../../services/adminApiService';
import {
  ConfirmDialog,
  DataTable,
  Modal,
  PageHeader,
  StatusBadge,
  showAdminToast,
} from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { formatDateTime, formatPeso } from '../utils/format';
import './AdminPages.css';

export default function AdminDisputesPage() {
  const { query: globalQuery } = useAdminPageSearch({
    scopeLabel: 'Disputes',
    placeholder: 'Search failed deliveries by order ref, customer, restaurant, or reason',
    searchableFields: ['order_reference', 'customer_name', 'restaurant_name', 'failure_reason'],
  });

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [notice, setNotice] = useState('');

  const loadDisputes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApiService.getDisputes({ search: search.trim() || undefined, per_page: 50 });
      setItems(res.items || []);
    } catch (err) {
      setNotice(err?.message || 'Unable to load failed delivery disputes.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadDisputes();
  }, [loadDisputes]);

  async function handleConfirmResolution({ reason }) {
    if (!confirmAction) return;
    const { item, action } = confirmAction;
    try {
      await adminApiService.resolveDispute(item.order_id, {
        action,
        notes: reason,
      });
      showAdminToast(`Order ${item.order_reference} resolved (${action === 'requeue_for_delivery' ? 're-queued' : 'cancelled'}).`, 'success');
      setSelected(null);
      setConfirmAction(null);
      await loadDisputes();
    } catch (err) {
      showAdminToast(err?.message || 'Unable to resolve dispute.', 'danger');
      setConfirmAction(null);
    }
  }

  const columns = [
    { key: 'order_reference', label: 'Order Ref', render: (row) => <strong>{row.order_reference}</strong> },
    { key: 'restaurant_name', label: 'Restaurant' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'rider_name', label: 'Rider', render: (row) => row.rider_name || '—' },
    { key: 'failure_reason', label: 'Failure Reason', render: (row) => row.failure_reason || '—' },
    { key: 'total_amount', label: 'Amount', align: 'right', render: (row) => formatPeso(row.total_amount) },
    { key: 'failed_at', label: 'Failed At', render: (row) => (row.failed_at ? formatDateTime(row.failed_at) : '—') },
    { key: 'order_status', label: 'Status', render: (row) => <StatusBadge status={row.order_status} /> },
  ];

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title={`Disputes & Failed Deliveries (${items.length})`}
          description="Review failed deliveries reported by riders and requeue or cancel orders."
        />
        {notice && <p className="admin-inline-notice" role="status">{notice}</p>}

        <div className="admin-filter-bar">
          <label className="admin-filter-control">
            Search
            <input
              aria-label="Search disputes"
              placeholder="Order ref, customer, restaurant, or failure reason"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        <DataTable
          columns={columns}
          rows={items}
          loading={loading}
          tableSearch={globalQuery}
          onRowClick={(row) => setSelected(row)}
          rowActions={(row) => [
            { label: 'Review', onClick: () => setSelected(row) },
            { label: 'Requeue', onClick: () => setConfirmAction({ item: row, action: 'requeue_for_delivery' }) },
            { label: 'Cancel Order', onClick: () => setConfirmAction({ item: row, action: 'cancel_order' }) },
          ]}
          emptyTitle="No failed deliveries or open disputes"
          emptyDescription="Failed deliveries escalated by riders will appear here for resolution."
        />
      </section>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        size="wide"
        title={selected ? `Dispute · ${selected.order_reference}` : 'Dispute Details'}
        subtitle={selected ? `${selected.restaurant_name} · ${selected.customer_name}` : undefined}
        headerExtra={selected ? <StatusBadge status={selected.order_status} /> : null}
        footer={selected ? (
          <>
            <button className="admin-action-button" type="button" onClick={() => setSelected(null)}>Close</button>
            <button
              className="admin-action-button"
              type="button"
              onClick={() => setConfirmAction({ item: selected, action: 'requeue_for_delivery' })}
            >
              Requeue for delivery
            </button>
            <button
              className="admin-action-button admin-action-button--danger"
              type="button"
              onClick={() => setConfirmAction({ item: selected, action: 'cancel_order' })}
            >
              Cancel &amp; close order
            </button>
          </>
        ) : null}
      >
        {selected && (
          <ul className="admin-detail-list">
            <li><strong>Order Reference</strong>{selected.order_reference}</li>
            <li><strong>Restaurant</strong>{selected.restaurant_name}</li>
            <li><strong>Customer</strong>{selected.customer_name}</li>
            <li><strong>Rider</strong>{selected.rider_name || 'Unassigned'}</li>
            <li><strong>Drop-off Address</strong>{selected.delivery_address_text || '—'}</li>
            <li><strong>Payment</strong>{String(selected.payment_method).toUpperCase()} ({selected.payment_status})</li>
            <li><strong>Order Total</strong>{formatPeso(selected.total_amount)}</li>
            <li><strong>Failed At</strong>{selected.failed_at ? formatDateTime(selected.failed_at) : '—'}</li>
            <li><strong>Failure Reason</strong>{selected.failure_reason || '—'}</li>
            <li><strong>Delivery Notes</strong>{selected.delivery_notes || '—'}</li>
          </ul>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.action === 'requeue_for_delivery' ? 'Requeue order for delivery?' : 'Cancel failed order?'}
        description={confirmAction?.action === 'requeue_for_delivery'
          ? 'This will reset the order to ready and allow another online rider to accept it.'
          : 'This will cancel the order and any pending cash payment.'}
        confirmLabel={confirmAction?.action === 'requeue_for_delivery' ? 'Requeue order' : 'Cancel order'}
        requireReason
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmResolution}
      />
    </AdminLayout>
  );
}

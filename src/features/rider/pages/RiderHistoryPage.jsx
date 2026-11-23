import { useCallback, useEffect, useState } from 'react';
import { Card, CardBody } from '../../../components/common/Card';
import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';
import riderService from '../../../services/riderService';
import { formatDateTimeManila, formatPeso } from '../../../utils/format';

export default function RiderHistoryPage() {
  const [deliveries, setDeliveries] = useState([]);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await riderService.getDeliveryHistory({
        page,
        perPage: 20,
        status: statusFilter,
        search,
      });
      setDeliveries(res.deliveries || []);
      setPagination(res.pagination || { current_page: 1, last_page: 1, total: 0 });
    } catch (err) {
      setError(err?.message || 'Unable to load delivery history.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div className="rider-page-shell">
      <PageHeader
        title={`Delivery history (${pagination.total || deliveries.length})`}
        subtitle="Completed, failed, and past delivery records."
        eyebrow="History"
      />

      {error && (
        <div role="alert" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--status-error-bg)', color: 'var(--status-error-text)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 'var(--space-4)', alignItems: 'center' }}>
        <input
          type="search"
          aria-label="Search delivery history"
          placeholder="Search by order ref or restaurant"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{ flex: '1 1 220px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}
        />
        <select
          aria-label="Filter delivery history by status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}
        >
          <option value="all">All statuses</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <GlobalStateView state="loading" title="Loading delivery history..." />
      ) : deliveries.length === 0 ? (
        <GlobalStateView
          state="empty"
          title="No delivery history yet"
          description="Completed or failed deliveries will appear here."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {deliveries.map((row) => (
            <Card key={row.delivery_id}>
              <CardBody style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
                    {row.order_reference} · {row.restaurant_name}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginTop: 2 }}>
                    {row.dropoff_address_text || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Status: <strong>{row.delivery_status}</strong>
                    {row.delivered_at ? ` · Delivered ${formatDateTimeManila(row.delivered_at)}` : ''}
                    {row.failed_at ? ` · Failed ${formatDateTimeManila(row.failed_at)}` : ''}
                    {row.recipient_name ? ` · Recipient: ${row.recipient_name}` : ''}
                    {row.has_proof_photo ? ' · POD Photo' : ''}
                  </div>
                  {row.failure_reason && (
                    <div style={{ fontSize: 11, color: 'var(--status-error-text)', marginTop: 4 }}>
                      Failure reason: {row.failure_reason}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
                    {formatPeso(row.rider_earning)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Order: {formatPeso(row.order_total)}
                  </div>
                  {row.cod_amount_collected > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      COD: {formatPeso(row.cod_amount_collected)} ({row.cod_remittance_status})
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}

          {pagination.last_page > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </button>
              <span>Page {pagination.current_page} of {pagination.last_page}</span>
              <button type="button" disabled={page >= pagination.last_page} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

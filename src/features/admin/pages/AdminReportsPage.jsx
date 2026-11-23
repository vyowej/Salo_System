import { useCallback, useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import AdminLayout from '../../../layouts/AdminLayout';
import adminApiService from '../../../services/adminApiService';
import { DataTable, PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { formatPeso } from '../utils/format';
import './AdminPages.css';

function defaultDateRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86400000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default function AdminReportsPage() {
  useAdminPageSearch({ disabled: true });
  const initial = defaultDateRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');

  const loadSummary = useCallback(async (rangeFrom, rangeTo) => {
    setLoading(true);
    setError('');
    try {
      const data = await adminApiService.getReportsSummary({ from: rangeFrom, to: rangeTo });
      setSummary(data);
    } catch (err) {
      setError(err?.message || 'Unable to load platform reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary(initial.from, initial.to);
  }, [loadSummary, initial.from, initial.to]);

  const handleApplyRange = (event) => {
    event.preventDefault();
    loadSummary(from, to);
  };

  const handleExport = async (type) => {
    setExporting(type);
    setExportError('');
    try {
      const { filename, blob } = await adminApiService.exportReportCsv({ type, from, to });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err?.message || 'Failed to export CSV report.');
    } finally {
      setExporting('');
    }
  };

  const topRestaurants = summary?.top_restaurants ?? [];

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Reports and analytics"
          description="Platform performance, revenue summaries, and audited CSV exports (max 90-day range)."
        />

        <form className="admin-filter-row" onSubmit={handleApplyRange} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 16 }}>
          <label className="admin-filter-control">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
          </label>
          <label className="admin-filter-control">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
          </label>
          <Button type="submit" variant="primary" size="sm" disabled={loading}>Apply range</Button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="button" variant="outline" size="sm" disabled={Boolean(exporting)} onClick={() => handleExport('orders')}>
              {exporting === 'orders' ? 'Exporting...' : 'Export Orders CSV'}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={Boolean(exporting)} onClick={() => handleExport('reservations')}>
              {exporting === 'reservations' ? 'Exporting...' : 'Export Reservations CSV'}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={Boolean(exporting)} onClick={() => handleExport('finance')}>
              {exporting === 'finance' ? 'Exporting...' : 'Export Finance CSV'}
            </Button>
          </div>
        </form>

        {exportError && (
          <div className="admin-inline-error" role="alert" style={{ marginBottom: 12 }}>
            {exportError}
          </div>
        )}

        {loading ? (
          <StateView state="loading" title="Loading report summary..." />
        ) : error ? (
          <StateView
            state="error"
            title="Unable to load reports"
            description={error}
            action={<Button variant="primary" size="sm" onClick={() => loadSummary(from, to)}>Retry</Button>}
          />
        ) : (
          <>
            <div className="admin-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 20 }}>
              <article className="admin-card">
                <small>Orders GMV</small>
                <strong style={{ display: 'block', fontSize: '1.25rem' }}>{formatPeso(Number(summary?.orders?.gmv ?? 0))}</strong>
                <span>{summary?.orders?.total ?? 0} total · {summary?.orders?.completed ?? 0} completed</span>
              </article>
              <article className="admin-card">
                <small>Completed GMV</small>
                <strong style={{ display: 'block', fontSize: '1.25rem' }}>{formatPeso(Number(summary?.orders?.completed_gmv ?? 0))}</strong>
                <span>Delivery fees: {formatPeso(Number(summary?.orders?.delivery_fees ?? 0))}</span>
              </article>
              <article className="admin-card">
                <small>Reservations</small>
                <strong style={{ display: 'block', fontSize: '1.25rem' }}>{summary?.reservations?.total ?? 0}</strong>
                <span>Deposits held: {formatPeso(Number(summary?.reservations?.deposits_held ?? 0))}</span>
              </article>
              <article className="admin-card">
                <small>Refunds Confirmed</small>
                <strong style={{ display: 'block', fontSize: '1.25rem' }}>{formatPeso(Number(summary?.refunds?.confirmed_total ?? 0))}</strong>
                <span>{summary?.refunds?.count ?? 0} refund records</span>
              </article>
            </div>

            <div className="admin-card">
              <h2 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Top Restaurants by GMV ({summary?.range?.from} to {summary?.range?.to})</h2>
              <StateView state={topRestaurants.length ? 'success' : 'empty'} title="No order activity in selected date range.">
                <DataTable
                  rows={topRestaurants}
                  rowKey={(row) => row.restaurant_id}
                  columns={[
                    { key: 'restaurant_name', label: 'Restaurant', render: (r) => r.restaurant_name },
                    { key: 'orders_count', label: 'Orders', render: (r) => r.orders_count },
                    { key: 'gmv', label: 'GMV', render: (r) => formatPeso(Number(r.gmv ?? 0)) },
                  ]}
                />
              </StateView>
            </div>
          </>
        )}
      </section>
    </AdminLayout>
  );
}

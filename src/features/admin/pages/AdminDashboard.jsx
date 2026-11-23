import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import Button from '../../../components/common/Button';
import adminApiService from '../../../services/adminApiService';
import { PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { formatPeso } from '../utils/format';
import './AdminPages.css';

export default function AdminDashboard() {
  useAdminPageSearch({ disabled: true });
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminApiService.getDashboard();
      setMetrics(data);
    } catch (err) {
      setError(err?.message || 'Unable to load platform overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const users = metrics?.users || {};
  const restaurants = metrics?.restaurants || {};
  const riders = metrics?.riders || {};
  const orders = metrics?.orders || {};
  const reservations = metrics?.reservations || {};
  const queues = metrics?.pending_queues || {};

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Platform overview"
          description="Live platform KPIs, active operations, and pending review queues."
          actions={
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <Link to="/admin/applications"><Button variant="primary" size="sm">Review Applications</Button></Link>
              <Link to="/admin/accounts"><Button variant="outline" size="sm">Manage Users</Button></Link>
            </div>
          }
        />

        {error && (
          <div className="admin-inline-notice" role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span>{error}</span>
            <button type="button" className="admin-action-button" onClick={loadDashboard}>Retry</button>
          </div>
        )}

        {loading && !metrics ? (
          <StateView state="loading" title="Loading platform metrics..." />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div className="admin-record-panel">
                <div className="admin-muted">Total GMV</div>
                <strong>{formatPeso(orders.gmv_total || 0)}</strong>
                <div className="admin-muted">{orders.total || 0} total orders ({orders.today || 0} today)</div>
              </div>
              <div className="admin-record-panel">
                <div className="admin-muted">Orders in Progress</div>
                <strong>{orders.active || 0}</strong>
                <div className="admin-muted">{orders.completed || 0} completed · {orders.failed || 0} failed</div>
              </div>
              <div className="admin-record-panel">
                <div className="admin-muted">Table Reservations</div>
                <strong>{reservations.total || 0}</strong>
                <div className="admin-muted">{reservations.active || 0} active · {reservations.completed || 0} completed</div>
              </div>
              <div className="admin-record-panel">
                <div className="admin-muted">Accounts</div>
                <strong>{users.total || 0}</strong>
                <div className="admin-muted">{users.active || 0} active users</div>
              </div>
              <div className="admin-record-panel">
                <div className="admin-muted">Restaurants</div>
                <strong>{restaurants.active || 0} / {restaurants.total || 0}</strong>
                <div className="admin-muted">Active / total branches</div>
              </div>
              <div className="admin-record-panel">
                <div className="admin-muted">Riders</div>
                <strong>{riders.online || 0} online</strong>
                <div className="admin-muted">{riders.active || 0} active / {riders.total || 0} total</div>
              </div>
            </div>

            <div className="admin-record-panel">
              <h2 style={{ margin: '0 0 10px', fontSize: 'var(--font-size-md)' }}>Operational Queues</h2>
              <ul className="admin-detail-list">
                <li>
                  <strong>Restaurant Applications</strong>
                  <Link to="/admin/applications">{queues.restaurant_applications || 0} pending review</Link>
                </li>
                <li>
                  <strong>Rider Applications</strong>
                  <Link to="/admin/applications">{queues.rider_applications || 0} pending review</Link>
                </li>
                <li>
                  <strong>Branch Permits</strong>
                  <Link to="/admin/branch-permits">{queues.branch_permits || 0} pending review</Link>
                </li>
                <li>
                  <strong>Failed Deliveries / Disputes</strong>
                  <Link to="/admin/disputes">{queues.failed_deliveries || 0} open case(s)</Link>
                </li>
                <li>
                  <strong>COD Remittances Submitted</strong>
                  <Link to="/admin/finance">{queues.cod_submitted || 0} awaiting verification</Link>
                </li>
              </ul>
            </div>
          </>
        )}
      </section>
    </AdminLayout>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import AdminLayout from '../../../layouts/AdminLayout';
import adminApiService from '../../../services/adminApiService';
import { PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { formatDateTime } from '../utils/format';
import './AdminPages.css';

export default function AdminSupportPage() {
  useAdminPageSearch({ disabled: true });
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminApiService.getSupportOverview();
      setOverview(data);
    } catch (err) {
      setError(err?.message || 'Unable to load support escalations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const counts = overview?.counts ?? {};
  const disputes = overview?.disputes ?? [];
  const reservationReviews = overview?.reservation_reviews ?? [];
  const changeRequests = overview?.change_requests ?? [];
  const lifecycleRequests = overview?.lifecycle_requests ?? [];

  const totalOpen =
    (counts.disputes ?? 0) +
    (counts.reservation_reviews ?? 0) +
    (counts.change_requests ?? 0) +
    (counts.lifecycle_requests ?? 0);

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Support and complaints"
          description="Aggregated escalations across failed-delivery disputes, flagged reservation reviews, and account requests."
          actions={<Button variant="outline" size="sm" onClick={loadOverview} disabled={loading}>Refresh</Button>}
        />

        {loading ? (
          <StateView state="loading" title="Loading open escalations..." />
        ) : error ? (
          <StateView
            state="error"
            title="Unable to load support queue"
            description={error}
            action={<Button variant="primary" size="sm" onClick={loadOverview}>Retry</Button>}
          />
        ) : (
          <>
            <div className="admin-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
              <article className="admin-card">
                <small>Failed-Delivery Disputes</small>
                <strong style={{ display: 'block', fontSize: '1.25rem' }}>{counts.disputes ?? 0}</strong>
                <Link to="/admin/orders/disputes" className="admin-link-action">Open Disputes</Link>
              </article>
              <article className="admin-card">
                <small>Reservation Deposit Reviews</small>
                <strong style={{ display: 'block', fontSize: '1.25rem' }}>{counts.reservation_reviews ?? 0}</strong>
                <Link to="/admin/reservations" className="admin-link-action">Open Reservations</Link>
              </article>
              <article className="admin-card">
                <small>Profile Change Requests</small>
                <strong style={{ display: 'block', fontSize: '1.25rem' }}>{counts.change_requests ?? 0}</strong>
                <Link to="/admin/restaurants" className="admin-link-action">Review Requests</Link>
              </article>
              <article className="admin-card">
                <small>Lifecycle Requests</small>
                <strong style={{ display: 'block', fontSize: '1.25rem' }}>{counts.lifecycle_requests ?? 0}</strong>
                <Link to="/admin/accounts" className="admin-link-action">Open Accounts</Link>
              </article>
            </div>

            <StateView
              state={totalOpen > 0 ? 'success' : 'empty'}
              title="No open escalations"
              description="All disputes, reservation deposit reviews, and pending account requests are resolved."
            >
              <div style={{ display: 'grid', gap: 16 }}>
                {disputes.length > 0 && (
                  <div className="admin-card">
                    <h2 style={{ margin: '0 0 10px', fontSize: '1rem' }}>Open Failed-Delivery Disputes</h2>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {disputes.map((item) => (
                        <div key={`dispute-${item.order_id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <div>
                            <strong>{item.reference}</strong> · {item.restaurant_name} ({item.customer_name})
                            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{item.reason}</div>
                          </div>
                          <Link to={item.target_route} className="admin-link-action">Resolve in Disputes</Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {reservationReviews.length > 0 && (
                  <div className="admin-card">
                    <h2 style={{ margin: '0 0 10px', fontSize: '1rem' }}>Flagged Reservation Reviews</h2>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {reservationReviews.map((item) => (
                        <div key={`res-${item.reservation_id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <div>
                            <strong>{item.reference}</strong> · {item.restaurant_name} ({item.customer_name})
                            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{item.reason}</div>
                          </div>
                          <Link to={item.target_route} className="admin-link-action">Review Reservation</Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {changeRequests.length > 0 && (
                  <div className="admin-card">
                    <h2 style={{ margin: '0 0 10px', fontSize: '1rem' }}>Pending Change Requests</h2>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {changeRequests.map((item) => (
                        <div key={`cr-${item.request_id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <div>
                            <strong>{item.request_type}</strong> · {item.requester_name} · {formatDateTime(item.created_at)}
                          </div>
                          <Link to={item.target_route} className="admin-link-action">Open Restaurants</Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {lifecycleRequests.length > 0 && (
                  <div className="admin-card">
                    <h2 style={{ margin: '0 0 10px', fontSize: '1rem' }}>Pending Lifecycle Requests</h2>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {lifecycleRequests.map((item) => (
                        <div key={`lc-${item.request_id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <div>
                            <strong>{item.request_type}</strong> · {item.requester_name} · {item.reason || 'Pending review'}
                          </div>
                          <Link to={item.target_route} className="admin-link-action">Open Accounts</Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </StateView>
          </>
        )}
      </section>
    </AdminLayout>
  );
}

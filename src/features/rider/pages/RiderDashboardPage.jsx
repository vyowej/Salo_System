import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import riderService from '../../../services/riderService';
import { useAuth } from '../../../hooks/useAuth';
import './RiderDashboardPage.css';

export default function RiderDashboardPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await riderService.getDashboard();
      setDashboard(data);
    } catch (err) {
      setError(err?.message || 'Unable to load rider dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleToggleAvailability = async () => {
    if (toggling) return;
    const nextStatus = dashboard?.availability === 'online' ? 'offline' : 'online';
    setToggling(true);
    setError(null);
    try {
      await riderService.updateAvailability(nextStatus);
      await loadDashboard();
      window.dispatchEvent(new Event('salo:riderUpdated'));
    } catch (err) {
      setError(err?.message || 'Unable to update availability.');
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="rider-page-shell rider-dashboard-page">
        <PageHeader title="Rider dashboard" subtitle="Ready for today's deliveries?" eyebrow="Rider overview" />
        <GlobalStateView state="loading" title="Loading rider dashboard..." />
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="rider-page-shell rider-dashboard-page">
        <PageHeader title="Rider dashboard" subtitle="Ready for today's deliveries?" eyebrow="Rider overview" />
        <GlobalStateView state="error" title="Could not load dashboard" description={error} onRetry={loadDashboard} />
      </div>
    );
  }

  const rider = dashboard?.rider || {};
  const stats = dashboard?.stats || {};
  const isOnline = dashboard?.availability === 'online';
  const activeDelivery = dashboard?.active_delivery || null;
  const displayName = user?.name || rider.name || user?.username || 'Rider';

  return (
    <div className="rider-page-shell rider-dashboard-page">
      <PageHeader title="Rider dashboard" subtitle="Ready for today's deliveries?" eyebrow="Rider overview" />

      {error && (
        <div role="alert" style={{ marginBottom: 'var(--space-4)', color: 'var(--danger, #c62828)', fontSize: 'var(--font-size-sm)' }}>
          {error}
        </div>
      )}

      <section className="rider-dashboard-status-bar-section" aria-label="Rider status and driver mode">
        <Card className={`rider-status-bar ${isOnline ? 'card--tint-green' : ''}`}>
          <CardBody className="rider-status-bar-body">
            <div className="rider-status-bar-left">
              <div className="rider-status-bar-avatar" aria-hidden="true">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="rider-status-bar-info">
                <div className="rider-status-bar-name-row">
                  <span className="rider-status-bar-name">{displayName}</span>
                </div>
                <p className="rider-status-bar-zone">
                  {rider.base_city || 'Base city not set'} · Status: {rider.rider_status || 'active'}
                </p>
              </div>
            </div>
            <div className="rider-status-bar-right">
              <Button
                variant={isOnline ? 'secondary' : 'primary'}
                size="sm"
                onClick={handleToggleAvailability}
                disabled={toggling}
              >
                {toggling ? 'Updating...' : isOnline ? 'Go offline' : 'Go online'}
              </Button>
            </div>
          </CardBody>
        </Card>
      </section>

      <section className="rider-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <StatCard label="Completed today" value={String(stats.completed_today ?? 0)} tone="green" />
        <StatCard label="Active delivery" value={stats.has_active_delivery ? '1 Active' : 'None'} tone="gold" />
        <StatCard label="Availability" value={isOnline ? 'Online' : 'Offline'} tone="brown" />
      </section>

      {activeDelivery ? (
        <Card>
          <CardBody>
            <h2 style={{ marginTop: 0 }}>Active Delivery</h2>
            <p><strong>Order:</strong> {activeDelivery.order_reference || `#${activeDelivery.order_id}`}</p>
            <p><strong>Restaurant:</strong> {activeDelivery.restaurant_name}</p>
            <p><strong>Status:</strong> {activeDelivery.delivery_status}</p>
            <Link to="/rider/deliveries/active">
              <Button variant="primary" size="sm">View active delivery</Button>
            </Link>
          </CardBody>
        </Card>
      ) : (
        <GlobalStateView
          state="empty"
          title="No active delivery"
          description="Delivery job offers and dispatch pooling will appear here once the rider dispatch API is connected."
        />
      )}
    </div>
  );
}

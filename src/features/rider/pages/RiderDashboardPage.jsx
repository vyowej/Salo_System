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

const DAILY_TRIP_GOAL = 10;

const RIDER_DECK_TABS = [
  { id: 'pulse', label: 'Daily Pulse' },
  { id: 'queue', label: 'Order Queue' },
  { id: 'tips', label: 'Rider Tips' },
];

export default function RiderDashboardPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [availableDeliveries, setAvailableDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [deckIndex, setDeckIndex] = useState(0);
  const [heroPhotoFailed, setHeroPhotoFailed] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, availableResult] = await Promise.all([
        riderService.getDashboard(),
        riderService.getAvailableDeliveries({ perPage: 5 }).catch(() => ({ deliveries: [] })),
      ]);
      setDashboard(data);
      const list = Array.isArray(availableResult?.deliveries)
        ? availableResult.deliveries
        : Array.isArray(availableResult?.data)
          ? availableResult.data
          : [];
      setAvailableDeliveries(list);
    } catch (err) {
      setError(err?.message || 'Unable to load rider dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const isRiderOnline = (avail) => (
    typeof avail === 'string'
      ? avail === 'online'
      : Boolean(avail?.is_online || avail?.status === 'online')
  );

  const handleToggleAvailability = async () => {
    if (toggling) return;
    const nextStatus = isRiderOnline(dashboard?.availability) ? 'offline' : 'online';
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
  const isRiderActive = rider.rider_status === 'active';
  const isOnline = isRiderOnline(dashboard?.availability);
  const activeDelivery = dashboard?.active_delivery || null;
  const displayName = user?.name || rider.name || user?.username || 'Rider';
  const firstName = displayName.split(' ')[0];
  const completedToday = Number(stats.completed_today ?? 0);
  const goalPercent = Math.min(100, Math.round((completedToday / DAILY_TRIP_GOAL) * 100));
  const activeTab = RIDER_DECK_TABS[deckIndex];

  return (
    <div className="rider-page-shell rider-dashboard-page">
      <PageHeader title="Rider dashboard" subtitle="Ready for today's deliveries?" eyebrow="Rider overview" />

      {!isRiderActive && (
        <div
          role="status"
          style={{
            marginBottom: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--status-warning-bg, #fff8e1)',
            color: 'var(--status-warning-text, #7c5800)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
          }}
        >
          Awaiting activation — an admin must activate your rider account (status: {rider.rider_status || 'approved'}) before you can go online or accept deliveries.
        </div>
      )}

      {error && (
        <div role="alert" style={{ marginBottom: 'var(--space-4)', color: 'var(--danger, #c62828)', fontSize: 'var(--font-size-sm)' }}>
          {error}
        </div>
      )}

      {/* ── 1 & 5. Hero Shift & Live Pulse Banner ─────────────────── */}
      <section className="rider-hero-banner" aria-label="Rider status and shift overview">
        <div className="rider-hero-media" aria-hidden="true">
          {!heroPhotoFailed ? (
            <img
              src="/assets/rider/rider-hero.jpg"
              alt=""
              className="rider-hero-photo"
              onError={() => setHeroPhotoFailed(true)}
            />
          ) : (
            <div className="rider-hero-fallback">
              <span className="rider-hero-orb rider-hero-orb--1" />
              <span className="rider-hero-orb rider-hero-orb--2" />
            </div>
          )}
          <div className="rider-hero-scrim" />
        </div>

        <div className="rider-hero-content">
          <div className="rider-hero-left">
            <div className="rider-status-bar-avatar rider-hero-avatar" aria-hidden="true">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="rider-hero-pill-row">
                <span className={`rider-live-pill ${isOnline ? 'is-online' : 'is-offline'}`}>
                  <span className="rider-live-dot" aria-hidden="true" />
                  {isOnline ? 'Online & receiving' : 'Offline'}
                </span>
                <span className="rider-zone-pill">
                  {rider.base_city || 'Zone not set'}
                </span>
              </div>
              <h2 className="rider-hero-greeting">
                {!isRiderActive
                  ? `Welcome, ${firstName}`
                  : isOnline
                    ? `Ready to roll, ${firstName}?`
                    : `Take a breather, ${firstName}`}
              </h2>
              <p className="rider-hero-sub">
                {activeDelivery
                  ? `You have an active delivery (${activeDelivery.order_reference || `#${activeDelivery.order_id}`}) in progress.`
                  : availableDeliveries.length > 0
                    ? `${availableDeliveries.length} ${availableDeliveries.length === 1 ? 'delivery is' : 'deliveries are'} waiting in your area.`
                    : 'Your route is clear. Stay online to catch incoming kitchen pickups.'}
              </p>
            </div>
          </div>

          <div className="rider-hero-actions">
            <Button
              variant={isOnline ? 'secondary' : 'primary'}
              size="md"
              onClick={handleToggleAvailability}
              disabled={toggling || !isRiderActive}
            >
              {!isRiderActive ? 'Awaiting activation' : toggling ? 'Updating...' : isOnline ? 'Go offline' : 'Go online'}
            </Button>
            <Link to={activeDelivery ? '/rider/deliveries/active' : '/rider/deliveries'} style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="md">
                {activeDelivery ? 'Open active trip →' : 'Find deliveries →'}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stat Cards ────────────────────────────────────────────── */}
      <section className="rider-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <StatCard label="Completed today" value={String(completedToday)} tone="green" />
        <StatCard label="Active delivery" value={stats.has_active_delivery ? '1 Active' : 'None'} tone="gold" />
        <StatCard label="Available nearby" value={String(availableDeliveries.length)} tone="brown" />
      </section>

      {/* ── 2. Quick Actions Launchpad ────────────────────────────── */}
      <section className="rider-quick-actions" aria-label="Quick rider actions">
        <Link to="/rider/deliveries" className="rider-quick-card">
          <span className="rider-quick-icon" aria-hidden="true">🛵</span>
          <div className="rider-quick-copy">
            <strong>Available Deliveries</strong>
            <span>{availableDeliveries.length > 0 ? `${availableDeliveries.length} ready for pickup` : 'Browse open orders'}</span>
          </div>
          <span className="rider-quick-arrow" aria-hidden="true">→</span>
        </Link>

        <Link to="/rider/map" className="rider-quick-card">
          <span className="rider-quick-icon" aria-hidden="true">🗺️</span>
          <div className="rider-quick-copy">
            <strong>Live Map & GPS</strong>
            <span>{rider.base_city || 'Track routes & zones'}</span>
          </div>
          <span className="rider-quick-arrow" aria-hidden="true">→</span>
        </Link>

        <Link to="/rider/schedule" className="rider-quick-card">
          <span className="rider-quick-icon" aria-hidden="true">📅</span>
          <div className="rider-quick-copy">
            <strong>Shift Schedule</strong>
            <span>Plan your riding hours</span>
          </div>
          <span className="rider-quick-arrow" aria-hidden="true">→</span>
        </Link>

        <Link to="/rider/support" className="rider-quick-card">
          <span className="rider-quick-icon" aria-hidden="true">🛡️</span>
          <div className="rider-quick-copy">
            <strong>Safety & Support</strong>
            <span>Help center & guidelines</span>
          </div>
          <span className="rider-quick-arrow" aria-hidden="true">→</span>
        </Link>
      </section>

      {/* ── 3 & 4. Interactive Pulse Graph + Active / Queue Deck ── */}
      <section className="rider-pulse-deck" aria-label="Shift pulse and activity">
        <div className="rider-pulse-header">
          <div>
            <span className="rider-pulse-eyebrow">SHIFT PULSE</span>
            <h2 className="rider-pulse-title">Today on the road</h2>
          </div>

          <div className="rider-pulse-controls">
            <div className="rider-pulse-tabs" role="tablist" aria-label="Shift pulse views">
              {RIDER_DECK_TABS.map((tab, idx) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={idx === deckIndex}
                  className={`rider-pulse-tab ${idx === deckIndex ? 'is-active' : ''}`.trim()}
                  onClick={() => setDeckIndex(idx)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="rider-pulse-next-btn"
              onClick={() => setDeckIndex((idx) => (idx + 1) % RIDER_DECK_TABS.length)}
            >
              Next →
            </button>
          </div>
        </div>

        <div key={activeTab.id} className="rider-pulse-body" role="tabpanel" aria-label={activeTab.label}>
          {activeTab.id === 'pulse' && (
            <div className="rider-pulse-grid">
              <div className="rider-goal-card">
                <svg viewBox="0 0 110 110" className="rider-goal-ring" role="img" aria-label={`${completedToday} of ${DAILY_TRIP_GOAL} daily trips`}>
                  <circle cx="55" cy="55" r="42" fill="none" stroke="var(--surface-secondary)" strokeWidth="10" />
                  <circle
                    cx="55"
                    cy="55"
                    r="42"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="10"
                    strokeDasharray={`${Math.max(10, (goalPercent / 100) * 264)} 264`}
                    strokeLinecap="round"
                    transform="rotate(-90 55 55)"
                    className="rider-goal-arc"
                  />
                  <text x="55" y="52" textAnchor="middle" className="rider-goal-val">{completedToday}</text>
                  <text x="55" y="68" textAnchor="middle" className="rider-goal-sub">/ {DAILY_TRIP_GOAL} trips</text>
                </svg>
                <div className="rider-goal-copy">
                  <strong>Daily Trip Goal</strong>
                  <p>
                    {completedToday >= DAILY_TRIP_GOAL
                      ? 'Goal reached! Great hustle today.'
                      : `${DAILY_TRIP_GOAL - completedToday} more ${DAILY_TRIP_GOAL - completedToday === 1 ? 'trip' : 'trips'} to hit today's target.`}
                  </p>
                </div>
              </div>

              <div className="rider-active-panel">
                {activeDelivery ? (
                  <>
                    <span className="rider-panel-tag is-active">Active Trip</span>
                    <h3>{activeDelivery.restaurant_name || 'Current Pickup'}</h3>
                    <p>
                      Order <strong>{activeDelivery.order_reference || `#${activeDelivery.order_id}`}</strong> · Status: {activeDelivery.delivery_status}
                    </p>
                    <Link to="/rider/deliveries/active" style={{ textDecoration: 'none' }}>
                      <Button variant="primary" size="sm">View active delivery →</Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <span className="rider-panel-tag">Standby</span>
                    <h3>No active delivery right now</h3>
                    <p>Go online and accept a ready order from Available deliveries to start your next trip.</p>
                    <Link to="/rider/deliveries" style={{ textDecoration: 'none' }}>
                      <Button variant="primary" size="sm">View available deliveries →</Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab.id === 'queue' && (
            <div className="rider-queue-list">
              {availableDeliveries.length === 0 ? (
                <div className="rider-queue-empty">
                  <strong>No open orders in the queue right now</strong>
                  <p>Check back in a moment or keep your status online to receive new dispatch alerts.</p>
                </div>
              ) : (
                availableDeliveries.slice(0, 3).map((order) => (
                  <div key={order.order_id || order.id} className="rider-queue-row">
                    <div>
                      <strong>{order.restaurant_name || 'Partner Kitchen'}</strong>
                      <span>{order.order_reference || `#${order.order_id || order.id}`} · {order.delivery_city || rider.base_city || 'Nearby'}</span>
                    </div>
                    <Link to="/rider/deliveries" style={{ textDecoration: 'none' }}>
                      <Button variant="outline" size="sm">Inspect →</Button>
                    </Link>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab.id === 'tips' && (
            <div className="rider-tips-grid">
              <div className="rider-tip-item">
                <strong>Keep GPS active</strong>
                <p>Accurate location sharing helps dispatch match you with nearby kitchens faster.</p>
              </div>
              <div className="rider-tip-item">
                <strong>Verify pickup items</strong>
                <p>Double-check order references and sealed bags before marking an order Picked Up.</p>
              </div>
              <div className="rider-tip-item">
                <strong>Stay safe on the road</strong>
                <p>Use the Safety & Support center anytime you need urgent assistance during a trip.</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

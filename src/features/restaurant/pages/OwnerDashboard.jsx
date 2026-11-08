import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import { ErrorState, LoadingSpinner } from '../../../components/feedback';
import { DASHBOARD_ACTIVITY_SAMPLES } from './team/dashboardSamples';
import './team/r7Dashboard.css';

// ── Helpers ──────────────────────────────────────────────────────
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Magandang umaga!';
  if (hour < 18) return 'Magandang hapon!';
  return 'Magandang gabi!';
}

function formatDate() {
  return new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatPeso(amount) {
  return `₱${amount.toLocaleString('en-PH')}`;
}

function getOrderStatusBadge(status) {
  const map = {
    Pending: 'warning',
    'Pending Confirmation': 'warning',
    Accepted: 'info',
    Preparing: 'primary',
    'Ready for Pickup': 'success',
    'Ready for Dispatch': 'success',
    'Out for Delivery': 'info',
    Completed: 'success',
    Rejected: 'error',
    Cancelled: 'default',
  };
  return map[status] || 'default';
}

function getReservationStatusBadge(status) {
  const map = {
    Pending: 'warning',
    Confirmed: 'success',
    Cancelled: 'default',
    Completed: 'success',
  };
  return map[status] || 'default';
}

// ── Stat Card ────────────────────────────────────────────────────
function StatCard({ label, value, sub, accentColor, accentBg, icon, trend, to }) {
  const Wrapper = to ? Link : 'div';
  return (
    <Wrapper
      {...(to ? { to } : {})}
      aria-label={to ? `${label}: ${value}. Open ${to === '/owner/reports' ? 'Reports' : to === '/owner/orders' ? 'Orders' : to === '/owner/reservations' ? 'Reservations' : 'Inventory'}` : undefined}
      style={{
        background: 'var(--surface-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        position: 'relative',
        overflow: 'hidden',
        color: 'inherit',
        textDecoration: 'none',
        cursor: to ? 'pointer' : undefined,
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: accentColor,
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            fontWeight: 700,
            color: accentColor,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {label}
        </span>
        {icon && (
          <span
            style={{
              width: 32,
              height: 32,
              background: accentBg,
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}
          >
            {icon}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        <span
          style={{
            fontSize: 'var(--font-size-3xl)',
            fontWeight: 800,
            color: 'var(--text-primary)',
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {trend && (
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--status-success-text)' }}>
            ↑ {trend}
          </span>
        )}
      </div>

      {sub && (
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', margin: 0 }}>
          {sub}
        </p>
      )}
    </Wrapper>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────
export default function OwnerDashboard() {
  const access = useRestaurantAccess();
  const { selectedRestaurantId } = access;
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [upcomingReservations, setUpcomingReservations] = useState([]);
  const [restaurant, setRestaurant] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryWarnings, setSummaryWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDashboard = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      const rest = ownerService.getRestaurant(selectedRestaurantId);
      const s = ownerService.getDashboardStats(selectedRestaurantId);
      const orders = ownerService.getOrders(selectedRestaurantId, {
        canViewCustomer: access.canAccess(['orders.customer.view']),
      });
      const reservations = ownerService.getReservations(selectedRestaurantId);
      const earnings = ownerService.getEarningsOverview(selectedRestaurantId);
      const localToday = new Date();
      const todayKey = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, '0')}-${String(localToday.getDate()).padStart(2, '0')}`;
      const nextSummary = {
        weeklyRevenue: earnings.thisWeek,
        monthlyRevenue: earnings.thisMonth,
        todayReservations: reservations.filter((reservation) => reservation.date === todayKey).length,
        availableTables: null,
        lowStockItems: null,
        soldOutItems: null,
      };
      const warnings = [];
      try {
        nextSummary.availableTables = ownerService.getTables(selectedRestaurantId, todayKey)
          .filter((table) => table.status === 'Available').length;
      } catch {
        warnings.push('Table availability');
      }
      try {
        const inventory = ownerService.getInventoryItems(selectedRestaurantId);
        nextSummary.lowStockItems = inventory.filter((item) => item.stockStatus === 'Low Stock').length;
        nextSummary.soldOutItems = inventory.filter((item) => item.kind === 'menu' && item.stockStatus === 'Out of Stock').length;
      } catch {
        warnings.push('Inventory summaries');
      }

      setRestaurant(rest);
      setStats(s);
      setSummary(nextSummary);
      setSummaryWarnings(warnings);
      setRecentOrders(orders.slice(0, 5));
      setUpcomingReservations(reservations
        .filter((r) => r.status === 'Pending' || r.status === 'Confirmed')
        .slice(0, 3));
    } catch (loadError) {
      setError(loadError.message || 'Unable to load restaurant overview.');
    } finally {
      setLoading(false);
    }
  }, [access, selectedRestaurantId]);

  useEffect(() => {
    loadDashboard();
    window.addEventListener('salo:demoStoreUpdated', loadDashboard);
    return () => window.removeEventListener('salo:demoStoreUpdated', loadDashboard);
  }, [loadDashboard]);

  function handleOrderAction(orderId, newStatus) {
    try {
      ownerService.updateOrderStatus(orderId, newStatus, selectedRestaurantId);
    } catch (actionError) {
      setError(actionError.message || 'Unable to update order status.');
    }
  }

  if (loading) {
    return <OwnerLayout><LoadingSpinner size="lg" label="Loading restaurant overview..." /></OwnerLayout>;
  }
  if (error) {
    return <OwnerLayout><ErrorState description={error} onRetry={loadDashboard} /></OwnerLayout>;
  }
  if (!stats || !restaurant) {
    return <OwnerLayout><ErrorState description="Restaurant overview data is unavailable." onRetry={loadDashboard} /></OwnerLayout>;
  }

  return (
    <OwnerLayout>
      {/* ── Greeting Section ─────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--fiesta-gold-subtle, #FEF3C7)',
              color: 'var(--fiesta-gold-text, #92400E)',
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: 'var(--radius-full)',
              letterSpacing: '0.04em',
            }}
          >
            ✨ {getGreeting()}
          </span>
        </div>
        <h1 className="page-title" style={{ fontSize: 'var(--font-size-3xl)', marginBottom: 'var(--space-1)' }}>
          Here's your restaurant overview
        </h1>
        <p className="page-subtitle">
          {restaurant?.name || 'Your Restaurant'} &nbsp;·&nbsp; {formatDate()}
        </p>
      </div>

      {/* ── 4 Stat Cards ─────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-8)',
        }}
      >
        <StatCard
          label="Today's Revenue"
          value={formatPeso(stats.todayRevenue)}
          sub="From completed deliveries & pickups"
          trend="+12% vs yesterday"
          accentColor="var(--fiesta-gold, #F59E0B)"
          accentBg="var(--fiesta-gold-subtle, #FEF3C7)"
          icon="💰"
          to="/owner/reports"
        />
        <StatCard
          label="Orders Today"
          value={stats.ordersToday}
          sub={`${stats.pendingOrders} pending · ${stats.preparingOrders} preparing · ${stats.completedToday} done`}
          accentColor="var(--accent, #F36B2B)"
          accentBg="var(--accent-subtle, #FFF0E8)"
          icon="🧾"
          to="/owner/orders"
        />
        <StatCard
          label="Pending Reservations"
          value={stats.pendingReservations}
          sub={stats.pendingReservations > 0 ? '⚠ Needs attention' : 'All reservations handled'}
          accentColor="var(--fiesta-green, #2E7D32)"
          accentBg="var(--fiesta-green-subtle, #E8F5E9)"
          icon="📅"
          to="/owner/reservations"
        />
        <StatCard
          label="Avg Order Value"
          value={formatPeso(stats.avgOrderValue)}
          sub="Lifetime average per order"
          accentColor="var(--fiesta-brown, #5D4037)"
          accentBg="var(--fiesta-brown-subtle, #EFEBE9)"
          icon="📊"
        />
      </div>

      <section className="r7-dashboard-additions" aria-label="Additional restaurant summaries">
        <div className="r7-dashboard-additions-heading"><div><p className="r7-eyebrow">QUICK HEALTH CHECK</p><h2 className="section-title">More at a glance</h2></div><span>Live demo summaries</span></div>
        <div className="r7-dashboard-summary-grid">
          <StatCard label="Today's Sales" value={formatPeso(stats.todayRevenue)} sub="Open sales reports" accentColor="var(--fiesta-gold, #F59E0B)" accentBg="var(--fiesta-gold-subtle, #FEF3C7)" icon="₱" to="/owner/reports" />
          <StatCard label="This Week" value={formatPeso(summary?.weeklyRevenue ?? 0)} sub="Sales total · open reports" accentColor="var(--accent)" accentBg="var(--accent-subtle)" icon="↗" to="/owner/reports" />
          <StatCard label="This Month" value={formatPeso(summary?.monthlyRevenue ?? 0)} sub="Sales total · open reports" accentColor="var(--fiesta-brown, #5D4037)" accentBg="var(--fiesta-brown-subtle, #EFEBE9)" icon="▦" to="/owner/reports" />
          <StatCard label="Pending Orders" value={stats.pendingOrders} sub="Review orders needing a decision" accentColor="var(--accent)" accentBg="var(--accent-subtle)" icon="!" to="/owner/orders" />
          <StatCard label="Today's Reservations" value={summary?.todayReservations ?? 0} sub="Reservations scheduled today" accentColor="var(--fiesta-green, #2E7D32)" accentBg="var(--fiesta-green-subtle, #E8F5E9)" icon="⌂" to="/owner/reservations" />
          <StatCard label="Available Tables" value={summary?.availableTables ?? '—'} sub="Current table availability" accentColor="var(--fiesta-green, #2E7D32)" accentBg="var(--fiesta-green-subtle, #E8F5E9)" icon="▤" to="/owner/tables" />
          <StatCard label="Low-Stock Items" value={summary?.lowStockItems ?? '—'} sub={summary?.lowStockItems > 0 ? 'Review items needing attention' : 'Inventory summary' } accentColor="var(--fiesta-gold, #F59E0B)" accentBg="var(--fiesta-gold-subtle, #FEF3C7)" icon="⚠" to="/owner/inventory" />
          <StatCard label="Sold-Out Items" value={summary?.soldOutItems ?? '—'} sub="Menu items with zero tracked stock" accentColor="var(--salo-error, #DC4545)" accentBg="var(--status-error-bg)" icon="∅" to="/owner/menu" />
        </div>
        {summaryWarnings.length > 0 && <p className="r7-dashboard-warning" role="status">Some live summary values are unavailable for this account: {summaryWarnings.join(', ')}.</p>}
      </section>

      {/* ── Live Orders Quick Strip ───────────────────── */}
      <section style={{ marginBottom: 'var(--space-8)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-4)',
          }}
        >
          <div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--accent)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                display: 'block',
                marginBottom: 2,
              }}
            >
              Real-time
            </span>
            <h2 className="section-title" style={{ margin: 0 }}>
              Live Orders
            </h2>
          </div>
          <Link to="/owner/orders" style={{ textDecoration: 'none' }}>
            <Button variant="ghost" size="sm">
              View All Orders →
            </Button>
          </Link>
        </div>

        <div
          style={{
            background: 'var(--surface-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {/* Table Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr 80px 90px 130px 160px',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-5)',
              background: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border-primary)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            <span>Order #</span>
            <span>Customer</span>
            <span>Items</span>
            <span>Total</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {recentOrders.length === 0 ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
              No orders yet today.
            </div>
          ) : (
            recentOrders.map((order, idx) => (
              <div
                key={order.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr 80px 90px 130px 160px',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-5)',
                  borderBottom: idx < recentOrders.length - 1 ? '1px solid var(--border-secondary)' : 'none',
                  alignItems: 'center',
                  fontSize: 'var(--font-size-sm)',
                  transition: 'background var(--transition-fast)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                  {order.id}
                </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  {order.customerName}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {order.itemCount} item{order.itemCount !== 1 ? 's' : ''}
                </span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {formatPeso(order.total)}
                </span>
                <span>
                  <Badge variant={getOrderStatusBadge(order.status)} size="sm" dot>
                    {order.status}
                  </Badge>
                </span>
                <span style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {(order.status === 'Pending' || order.status === 'Pending Confirmation') && (
                    <>
                      <button
                        onClick={() => handleOrderAction(order.id, 'Accepted')}
                        style={{
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                          background: 'var(--fiesta-green, #2E7D32)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                        }}
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => navigate('/owner/orders')}
                        style={{
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                          background: 'var(--status-error-bg)',
                          color: 'var(--salo-error, #DC4545)',
                          border: '1px solid var(--salo-error, #DC4545)',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                        }}
                      >
                        Review
                      </button>
                    </>
                  )}
                  {order.status === 'Accepted' && (
                    <button
                      onClick={() => handleOrderAction(order.id, 'Preparing')}
                      style={{
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 700,
                        background: 'var(--accent)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                      }}
                    >
                      Start Prep
                    </button>
                  )}
                  {order.status === 'Preparing' && (
                    <button
                      onClick={() => handleOrderAction(order.id, order.fulfillment === 'pickup' ? 'Ready for Pickup' : 'Ready for Dispatch')}
                      style={{
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 700,
                        background: 'var(--fiesta-gold, #F59E0B)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                      }}
                    >
                      {order.fulfillment === 'pickup' ? 'Ready for Pickup' : 'Ready for Dispatch'}
                    </button>
                  )}
                  {(order.status === 'Ready for Pickup' || order.status === 'Ready for Dispatch' || order.status === 'Out for Delivery' || order.status === 'Completed' || order.status === 'Cancelled' || order.status === 'Rejected') && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
                      {order.status === 'Completed' ? '✓ Done' : ['Cancelled', 'Rejected'].includes(order.status) ? `✕ ${order.status}` : '—'}
                    </span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="r7-dashboard-activity" aria-labelledby="r7-dashboard-activity-title">
        <div className="r7-dashboard-additions-heading"><div><p className="r7-eyebrow">SAMPLE PREVIEW</p><h2 id="r7-dashboard-activity-title" className="section-title">Recent Activities</h2></div><span>Not a live activity feed</span></div>
        <div className="r7-dashboard-activity-list">{DASHBOARD_ACTIVITY_SAMPLES.map((item) => <article key={item.id}><span className="r7-dashboard-activity-icon" aria-hidden="true">✦</span><span><strong>{item.title}</strong><small>{item.detail} · {item.module}</small></span><time>{item.time}</time></article>)}</div>
      </section>

      {/* ── Upcoming Reservations Strip ───────────────── */}
      <section style={{ marginBottom: 'var(--space-8)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-4)',
          }}
        >
          <div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--fiesta-green, #2E7D32)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                display: 'block',
                marginBottom: 2,
              }}
            >
              Upcoming
            </span>
            <h2 className="section-title" style={{ margin: 0 }}>
              Reservations
            </h2>
          </div>
          <Link to="/owner/reservations" style={{ textDecoration: 'none' }}>
            <Button variant="ghost" size="sm">
              View All Reservations →
            </Button>
          </Link>
        </div>

        <div
          style={{
            background: 'var(--surface-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {/* Table Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 100px 90px 80px 110px 160px',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-5)',
              background: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border-primary)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            <span>Guest</span>
            <span>Date</span>
            <span>Time</span>
            <span>Party</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {upcomingReservations.length === 0 ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
              No upcoming reservations.
            </div>
          ) : (
            upcomingReservations.map((res, idx) => (
              <div
                key={res.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 100px 90px 80px 110px 160px',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-5)',
                  borderBottom: idx < upcomingReservations.length - 1 ? '1px solid var(--border-secondary)' : 'none',
                  alignItems: 'center',
                  fontSize: 'var(--font-size-sm)',
                  transition: 'background var(--transition-fast)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {res.guestName}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {new Date(res.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {res.time}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  👥 {res.partySize}
                </span>
                <span>
                  <Badge variant={getReservationStatusBadge(res.status)} size="sm" dot>
                    {res.status}
                  </Badge>
                </span>
                <Link to="/owner/reservations" style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>
                  Review details
                </Link>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── Menu Quick Health ─────────────────────────── */}
      <section style={{ marginBottom: 'var(--space-8)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-4)',
          }}
        >
          <div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--fiesta-brown, #5D4037)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                display: 'block',
                marginBottom: 2,
              }}
            >
              Menu Status
            </span>
            <h2 className="section-title" style={{ margin: 0 }}>
              Menu Health
            </h2>
          </div>
          <Link to="/owner/menu" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm">
              Edit Menu →
            </Button>
          </Link>
        </div>

        <div
          style={{
            background: 'var(--surface-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-5)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            gap: 'var(--space-8)',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Total Items
            </span>
            <span style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--text-primary)' }}>
              {stats.totalMenuItems}
            </span>
          </div>

          <div style={{ width: 1, height: 40, background: 'var(--border-primary)' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Unavailable
            </span>
            <span
              style={{
                fontSize: 'var(--font-size-2xl)',
                fontWeight: 800,
                color: stats.unavailableItems > 0 ? 'var(--salo-error, #DC4545)' : 'var(--status-success-text)',
              }}
            >
              {stats.unavailableItems}
            </span>
          </div>

          <div style={{ width: 1, height: 40, background: 'var(--border-primary)' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Available
            </span>
            <span style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--status-success-text)' }}>
              {stats.totalMenuItems - stats.unavailableItems}
            </span>
          </div>

          {stats.unavailableItems > 0 && (
            <div
              style={{
                marginLeft: 'auto',
                background: 'var(--status-warning-bg)',
                color: 'var(--status-warning-text)',
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 500,
              }}
            >
              ⚠ {stats.unavailableItems} item{stats.unavailableItems !== 1 ? 's are' : ' is'} currently unavailable and hidden from customers.
            </div>
          )}
        </div>
      </section>
    </OwnerLayout>
  );
}

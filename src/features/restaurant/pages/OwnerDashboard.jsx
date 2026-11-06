import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';

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
    Preparing: 'primary',
    'Ready for Pickup': 'success',
    'Out for Delivery': 'info',
    Completed: 'success',
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
function StatCard({ label, value, sub, accentColor, accentBg, icon, trend }) {
  return (
    <div
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
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────
export default function OwnerDashboard() {
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [upcomingReservations, setUpcomingReservations] = useState([]);
  const [restaurant, setRestaurant] = useState(null);

  useEffect(() => {
    const rest = ownerService.getRestaurant();
    const s = ownerService.getDashboardStats();
    const orders = ownerService.getOrders();
    const reservations = ownerService.getReservations();

    setRestaurant(rest);
    setStats(s);

    // Last 5 orders (most recent first)
    setRecentOrders(orders.slice(0, 5));

    // Next 3 pending or confirmed reservations
    const upcoming = reservations.filter((r) => r.status === 'Pending' || r.status === 'Confirmed').slice(0, 3);
    setUpcomingReservations(upcoming);
  }, []);

  function handleOrderAction(orderId, newStatus) {
    ownerService.updateOrderStatus(orderId, newStatus);
    const updated = ownerService.getOrders();
    setRecentOrders(updated.slice(0, 5));
    setStats(ownerService.getDashboardStats());
  }

  function handleReservationAction(resId, newStatus) {
    ownerService.updateReservationStatus(resId, newStatus);
    const updated = ownerService.getReservations();
    const upcoming = updated.filter((r) => r.status === 'Pending' || r.status === 'Confirmed').slice(0, 3);
    setUpcomingReservations(upcoming);
    setStats(ownerService.getDashboardStats());
  }

  if (!stats) return null;

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
        />
        <StatCard
          label="Orders Today"
          value={stats.ordersToday}
          sub={`${stats.pendingOrders} pending · ${stats.preparingOrders} preparing · ${stats.completedToday} done`}
          accentColor="var(--accent, #F36B2B)"
          accentBg="var(--accent-subtle, #FFF0E8)"
          icon="🧾"
        />
        <StatCard
          label="Pending Reservations"
          value={stats.pendingReservations}
          sub={stats.pendingReservations > 0 ? '⚠ Needs attention' : 'All reservations handled'}
          accentColor="var(--fiesta-green, #2E7D32)"
          accentBg="var(--fiesta-green-subtle, #E8F5E9)"
          icon="📅"
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
                  {order.status === 'Pending' && (
                    <>
                      <button
                        onClick={() => handleOrderAction(order.id, 'Preparing')}
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
                        onClick={() => handleOrderAction(order.id, 'Cancelled')}
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
                        Reject
                      </button>
                    </>
                  )}
                  {order.status === 'Preparing' && (
                    <button
                      onClick={() => handleOrderAction(order.id, 'Ready for Pickup')}
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
                      Mark Ready
                    </button>
                  )}
                  {(order.status === 'Ready for Pickup' || order.status === 'Out for Delivery' || order.status === 'Completed' || order.status === 'Cancelled') && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
                      {order.status === 'Completed' ? '✓ Done' : order.status === 'Cancelled' ? '✕ Cancelled' : '—'}
                    </span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
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
                <span style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {res.status === 'Pending' && (
                    <>
                      <button
                        onClick={() => handleReservationAction(res.id, 'Confirmed')}
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
                        Confirm
                      </button>
                      <button
                        onClick={() => handleReservationAction(res.id, 'Cancelled')}
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
                        Decline
                      </button>
                    </>
                  )}
                  {res.status === 'Confirmed' && (
                    <span style={{ fontSize: 11, color: 'var(--status-success-text)', fontWeight: 600 }}>
                      ✓ Confirmed
                    </span>
                  )}
                </span>
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

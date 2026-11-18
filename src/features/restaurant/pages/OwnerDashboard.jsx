import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import { ErrorState, LoadingSpinner } from '../../../components/feedback';
import SetupChecklistCard from '../components/SetupChecklistCard';
import { useRoleOnboarding } from '../../../hooks/useRoleOnboarding';
import './team/r7Dashboard.css';

function formatPeso(amount) {
  return `₱${amount.toLocaleString('en-PH')}`;
}

function getOrderStatusBadge(status) {
  const norm = String(status || '').toLowerCase();
  const map = {
    pending: 'warning',
    accepted: 'info',
    preparing: 'primary',
    ready: 'success',
    out_for_delivery: 'info',
    delivered: 'success',
    completed: 'success',
    rejected: 'error',
    cancelled: 'default',
  };
  return map[norm] || 'default';
}

function formatOrderStatusLabel(status, fulfillment) {
  const norm = String(status || '').toLowerCase();
  if (norm === 'ready') {
    return fulfillment === 'pickup' ? 'Ready for Pickup' : 'Ready for Dispatch';
  }
  const labels = {
    pending: 'Pending',
    accepted: 'Accepted',
    preparing: 'Preparing',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    completed: 'Completed',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  };
  return labels[norm] || status || 'Pending';
}

function toLocalDateKey(dateValue) {
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function computeDashboardStatsFromOrders(orders = [], reservations = [], now = new Date()) {
  const todayKey = toLocalDateKey(now);
  const weekAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let todayRevenue = 0;
  let ordersToday = 0;
  let pendingOrders = 0;
  let preparingOrders = 0;
  let completedToday = 0;
  let weeklyRevenue = 0;
  let monthlyRevenue = 0;
  let validOrderCount = 0;
  let validOrderSum = 0;

  for (const order of orders) {
    const status = String(order.status || '').toLowerCase();
    const total = Number(order.total || 0);
    const createdDate = order.createdAt ? new Date(order.createdAt) : null;
    const isValidDate = createdDate && !Number.isNaN(createdDate.getTime());
    const isToday = isValidDate && toLocalDateKey(createdDate) === todayKey;
    const isCompleted = status === 'completed' || status === 'delivered';

    if (isToday) ordersToday += 1;
    if (status === 'pending') pendingOrders += 1;
    if (status === 'preparing') preparingOrders += 1;
    if (isToday && isCompleted) {
      completedToday += 1;
      todayRevenue += total;
    }

    if (isValidDate && isCompleted) {
      if (createdDate.getTime() >= weekAgoMs) weeklyRevenue += total;
      if (createdDate.getMonth() === currentMonth && createdDate.getFullYear() === currentYear) {
        monthlyRevenue += total;
      }
    }

    if (status !== 'rejected' && status !== 'cancelled') {
      validOrderCount += 1;
      validOrderSum += total;
    }
  }

  return {
    stats: {
      todayRevenue,
      ordersToday,
      pendingOrders,
      preparingOrders,
      completedToday,
      pendingReservations: reservations.filter((r) => r.status === 'Pending').length,
      avgOrderValue: validOrderCount > 0 ? Math.round((validOrderSum / validOrderCount) * 100) / 100 : 0,
      totalMenuItems: 0,
      unavailableItems: 0,
    },
    weeklyRevenue,
    monthlyRevenue,
  };
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
function StatCard({ label, value, sub, tone, icon, iconState, trend, to }) {
  const Wrapper = to ? Link : 'div';
  return (
    <Wrapper
      {...(to ? { to } : {})}
      aria-label={to ? `${label}: ${value}. Open ${to === '/owner/reports' ? 'Reports' : to === '/owner/orders' ? 'Orders' : to === '/owner/reservations' ? 'Reservations' : 'Inventory'}` : undefined}
      className={`brand-card brand-card--${tone} brand-card--stat${to ? ' brand-card--interactive' : ''}`}
    >
      <div className="brand-card__heading">
        <span className="brand-card__label">{label}</span>
        {icon && (
          <span className={`brand-card__icon-chip${iconState ? ` brand-card__icon-chip--${iconState}` : ''}`} aria-hidden="true">
            {icon}
          </span>
        )}
      </div>

      <div className="brand-card__value-row">
        <span className="brand-card__value">{value}</span>
        {trend && <span className="brand-card__trend">↑ {trend}</span>}
      </div>

      {sub && <p className="brand-card__helper">{sub}</p>}
    </Wrapper>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────
export default function OwnerDashboard() {
  const access = useRestaurantAccess();
  const { selectedRestaurantId } = access;
  const businessOnboarding = useRoleOnboarding('business', {
    access,
    selectedRestaurantId,
  });
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [upcomingReservations, setUpcomingReservations] = useState([]);
  const [restaurant, setRestaurant] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryWarnings, setSummaryWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const canViewCustomer = access.canAccess(['orders.customer.view']);
      const canOrderHandle = access.canAccess(['orders.view', 'orders.handle']);

      const [profileResult, ordersResult] = await Promise.all([
        access.isOwner && selectedRestaurantId
          ? ownerService.getProfile(selectedRestaurantId).catch(() => null)
          : Promise.resolve(null),
        canOrderHandle
          ? ownerService.fetchRestaurantOrders({
              page: 1,
              perPage: 50,
              restaurantId: selectedRestaurantId,
            })
          : Promise.resolve({ orders: [] }),
      ]);

      const rest = profileResult || access.selectedRestaurant || null;
      const rawOrders = Array.isArray(ordersResult?.orders) ? ordersResult.orders : [];
      const orders = rawOrders.map((order) => ({
        ...order,
        customerName: canViewCustomer ? order.customerName : 'Customer',
        itemCount: Array.isArray(order.items)
          ? order.items.reduce((sum, item) => sum + Number(item.quantity || 1), 0)
          : 0,
      }));

      const reservations = ownerService.getReservations(selectedRestaurantId);
      const localToday = new Date();
      const todayKey = toLocalDateKey(localToday);
      const computed = computeDashboardStatsFromOrders(orders, reservations, localToday);

      const nextSummary = {
        weeklyRevenue: computed.weeklyRevenue,
        monthlyRevenue: computed.monthlyRevenue,
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
      setStats(computed.stats);
      setSummary(nextSummary);
      setSummaryWarnings(warnings);
      setRecentOrders(orders.slice(0, 5));
      setUpcomingReservations(reservations
        .filter((r) => r.status === 'Pending' || r.status === 'Confirmed')
        .slice(0, 3));
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load restaurant overview.');
    } finally {
      setLoading(false);
    }
  }, [access, selectedRestaurantId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function handleOrderAction(orderId, action) {
    try {
      if (action === 'accept') {
        await ownerService.acceptOrder(orderId, selectedRestaurantId);
      } else if (action === 'prepare') {
        await ownerService.prepareOrder(orderId, selectedRestaurantId);
      } else if (action === 'ready') {
        await ownerService.readyOrder(orderId, selectedRestaurantId);
      } else if (action === 'complete') {
        await ownerService.completeOrder(orderId, selectedRestaurantId);
      }
      await loadDashboard();
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update order status.');
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
      <SetupChecklistCard
        userId={businessOnboarding.userId}
        restaurantId={selectedRestaurantId}
        isApprovedOwner={businessOnboarding.isApprovedOwner}
        checklist={businessOnboarding.businessChecklist}
      />

      {/* ── 4 Stat Cards ─────────────────────────────── */}
      <div className="owner-dashboard-stats-grid">
        <StatCard
          label="Today's Revenue"
          value={formatPeso(stats.todayRevenue)}
          sub="From completed deliveries & pickups"
          trend="+12% vs yesterday"
          tone="gold"
          icon="💰"
          to="/owner/reports"
        />
        <StatCard
          label="Orders Today"
          value={stats.ordersToday}
          sub={`${stats.pendingOrders} pending · ${stats.preparingOrders} preparing · ${stats.completedToday} done`}
          tone="orange"
          icon="🧾"
          to="/owner/orders"
        />
        <StatCard
          label="Pending Reservations"
          value={stats.pendingReservations}
          sub={stats.pendingReservations > 0 ? '⚠ Needs attention' : 'All reservations handled'}
          tone="green"
          icon="📅"
          to="/owner/reservations"
        />
        <StatCard
          label="Avg Order Value"
          value={formatPeso(stats.avgOrderValue)}
          sub="Lifetime average per order"
          tone="brown"
          icon="📊"
        />
      </div>

      <section className="r7-dashboard-additions" aria-label="Additional restaurant summaries">
        <div className="r7-dashboard-additions-heading"><div><p className="r7-eyebrow">QUICK HEALTH CHECK</p><h2 className="section-title">More at a glance</h2></div><span>Live summaries</span></div>
        <div className="r7-dashboard-summary-grid">
          <StatCard label="Today's Sales" value={formatPeso(stats.todayRevenue)} sub="Open sales reports" tone="gold" icon="₱" to="/owner/reports" />
          <StatCard label="This Week" value={formatPeso(summary?.weeklyRevenue ?? 0)} sub="Sales total · open reports" tone="gold" icon="↗" to="/owner/reports" />
          <StatCard label="This Month" value={formatPeso(summary?.monthlyRevenue ?? 0)} sub="Sales total · open reports" tone="gold" icon="▦" to="/owner/reports" />
          <StatCard label="Pending Orders" value={stats.pendingOrders} sub="Review orders needing a decision" tone="orange" icon="!" to="/owner/orders" />
          <StatCard label="Today's Reservations" value={summary?.todayReservations ?? 0} sub="Reservations scheduled today" tone="green" icon="⌂" to="/owner/reservations" />
          <StatCard label="Available Tables" value={summary?.availableTables ?? '—'} sub="Current table availability" tone="green" icon="▤" to="/owner/tables" />
          <StatCard label="Low-Stock Items" value={summary?.lowStockItems ?? '—'} sub={summary?.lowStockItems > 0 ? 'Review items needing attention' : 'Inventory summary'} tone="brown" icon="⚠" iconState="warning" to="/owner/inventory" />
          <StatCard label="Sold-Out Items" value={summary?.soldOutItems ?? '—'} sub="Menu items with zero tracked stock" tone="brown" icon="∅" iconState="danger" to="/owner/menu" />
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
                  {order.orderReference || `#${order.id}`}
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
                    {formatOrderStatusLabel(order.status, order.fulfillment)}
                  </Badge>
                </span>
                <span style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {order.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleOrderAction(order.id, 'accept')}
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
                  {order.status === 'accepted' && (
                    <button
                      onClick={() => handleOrderAction(order.id, 'prepare')}
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
                  {order.status === 'preparing' && (
                    <button
                      onClick={() => handleOrderAction(order.id, 'ready')}
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
                  {['ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'rejected'].includes(order.status) && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
                      {order.status === 'completed' || order.status === 'delivered'
                        ? '✓ Done'
                        : ['cancelled', 'rejected'].includes(order.status)
                          ? `✕ ${formatOrderStatusLabel(order.status, order.fulfillment)}`
                          : '—'}
                    </span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="r7-dashboard-activity" aria-labelledby="r7-dashboard-activity-title">
        <div className="r7-dashboard-additions-heading"><div><h2 id="r7-dashboard-activity-title" className="section-title">Recent Activities</h2></div><span>Activity feed pending backend</span></div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', margin: 0 }}>No recent activity recorded yet.</p>
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

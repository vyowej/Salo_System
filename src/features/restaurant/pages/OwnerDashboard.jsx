import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import WarningDialog from '../../../components/common/WarningDialog';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import { ErrorState, LoadingSpinner } from '../../../components/feedback';
import SetupChecklistCard from '../components/SetupChecklistCard';
import { useRoleOnboarding } from '../../../hooks/useRoleOnboarding';
import {
  formatPeso,
  getOrderStatusBadge,
  formatOrderStatusLabel,
  toLocalDateKey,
  computeDashboardStatsFromOrders,
} from '../utils/ownerDashboardUtils';
import StatCard from '../components/dashboard/OwnerDashboardStatCard';
import OwnerDashboardReservationsSection from '../components/dashboard/OwnerDashboardReservationsSection';
import OwnerDashboardMenuHealthSection from '../components/dashboard/OwnerDashboardMenuHealthSection';
import QuickHealthCheckDeck from '../components/dashboard/QuickHealthCheckDeck';
import './team/r7Dashboard.css';

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
  const [warning, setWarning] = useState('');
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
      setWarning(actionError?.message || 'Unable to update order status.');
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

      <QuickHealthCheckDeck
        stats={stats}
        summary={summary}
        summaryWarnings={summaryWarnings}
      />

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

      <OwnerDashboardReservationsSection upcomingReservations={upcomingReservations} />

      <OwnerDashboardMenuHealthSection stats={stats} />

      <WarningDialog
        open={Boolean(warning)}
        title="Order Warning"
        message={warning}
        onClose={() => setWarning('')}
      />
    </OwnerLayout>
  );
}

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import adminService from '../../../services/adminService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

export default function AdminDashboard() {
  const [stats, setStats] = useState(adminService.getPlatformStats());
  const [restaurants, setRestaurants] = useState(adminService.getRestaurants());
  const [riders, setRiders] = useState(adminService.getRiders());
  const [orders, setOrders] = useState(adminService.getOrders());

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    setStats(adminService.getPlatformStats());
    setRestaurants(adminService.getRestaurants());
    setRiders(adminService.getRiders());
    setOrders(adminService.getOrders());
  }

  function handleApproveRestaurant(id) {
    adminService.updateRestaurantStatus(id, 'Active');
    refresh();
  }

  function handleApproveRider(id) {
    adminService.updateRiderStatus(id, 'Active');
    refresh();
  }

  const pendingRests = restaurants.filter((r) => r.status === 'Pending Approval');
  const pendingRiders = riders.filter((r) => r.status === 'Pending Verification');

  return (
    <AdminLayout>
      {/* ── Page Header ────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
          <span className="fiesta-pill" style={{ background: 'var(--fiesta-brown-subtle, #EFEBE9)', color: 'var(--salo-brown, #5D4037)' }}>
            🏛️ Central Operations Command
          </span>
          <span className="fiesta-pill fiesta-pill-gold">Metro Manila Zone 1</span>
        </div>
        <h1 className="page-title" style={{ fontSize: 'var(--font-size-3xl)', marginTop: 'var(--space-1)' }}>
          Platform Overview & HQ Analytics
        </h1>
        <p className="page-subtitle">
          Monitor multi-restaurant orders, partner onboarding approvals, and real-time fleet operations.
        </p>
      </div>

      {/* ── 4 Top KPI Cards ─────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-8)',
      }}>
        {/* GMV */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
            Total Platform GMV
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--accent)', margin: 'var(--space-2) 0' }}>
            ₱{stats.totalRevenue.toLocaleString('en-PH')}
          </p>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--salo-green)', fontWeight: 600 }}>
            ↑ 22.4% vs last calendar month
          </span>
        </div>

        {/* Take Rate */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
            Commission Net Revenue
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--salo-green)', margin: 'var(--space-2) 0' }}>
            ₱{stats.platformCommissionEarned.toLocaleString('en-PH')}
          </p>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            10.0% effective take rate
          </span>
        </div>

        {/* Orders Today */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--fiesta-gold, #F59E0B)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
            Active Orders Today
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--fiesta-gold, #F59E0B)', margin: 'var(--space-2) 0' }}>
            {stats.ordersToday}
          </p>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            Across {stats.totalRestaurants} active restaurants
          </span>
        </div>

        {/* Couriers */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--salo-brown, #5D4037)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
            Couriers on the Road
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--salo-brown, #5D4037)', margin: 'var(--space-2) 0' }}>
            {stats.activeRidersOnRoad} / {stats.totalRiders}
          </p>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--salo-green)', fontWeight: 600 }}>
            94% fulfillment capacity
          </span>
        </div>
      </div>

      {/* ── Pending Verification Queues ─────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 'var(--space-6)',
        marginBottom: 'var(--space-8)',
      }}>
        {/* Pending Restaurant Approvals */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <h2 className="section-title" style={{ margin: 0, fontSize: 'var(--font-size-md)' }}>
              🏪 Pending Restaurant Partners ({pendingRests.length})
            </h2>
            <Link to="/admin/restaurants" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              View All →
            </Link>
          </div>

          {pendingRests.length === 0 ? (
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
              No restaurant partner applications awaiting review.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {pendingRests.map((rest) => (
                <div
                  key={rest.id}
                  style={{
                    padding: 'var(--space-3)',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 'var(--font-size-xs)', display: 'block' }}>{rest.name}</strong>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rest.cuisine} · {rest.ownerName}</span>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => handleApproveRestaurant(rest.id)}>
                    Approve
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Rider Verifications */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <h2 className="section-title" style={{ margin: 0, fontSize: 'var(--font-size-md)' }}>
              🛵 Pending Courier Onboarding ({pendingRiders.length})
            </h2>
            <Link to="/admin/riders" style={{ fontSize: 11, color: 'var(--salo-green)', textDecoration: 'none', fontWeight: 600 }}>
              View All →
            </Link>
          </div>

          {pendingRiders.length === 0 ? (
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
              No courier applications currently pending verification.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {pendingRiders.map((rider) => (
                <div
                  key={rider.id}
                  style={{
                    padding: 'var(--space-3)',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 'var(--font-size-xs)', display: 'block' }}>{rider.name}</strong>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rider.vehicle} · {rider.zone}</span>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => handleApproveRider(rider.id)}>
                    Verify LTO
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Live Orders Surveillance ───────────────────── */}
      <div style={{
        background: 'var(--surface-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-6)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>Active Multi-Kitchen Orders</h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Real-time monitoring of customer order groups and rider dispatches
            </p>
          </div>
          <Link to="/admin/orders" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm">
              Manage Orders & Disputes →
            </Button>
          </Link>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--border-secondary)', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '12px 14px' }}>Order Ref</th>
                <th style={{ padding: '12px 14px' }}>Customer</th>
                <th style={{ padding: '12px 14px' }}>Kitchens Involved</th>
                <th style={{ padding: '12px 14px' }}>Assigned Courier</th>
                <th style={{ padding: '12px 14px' }}>Gross Total</th>
                <th style={{ padding: '12px 14px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                  <td style={{ padding: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {o.id}
                  </td>
                  <td style={{ padding: '14px', color: 'var(--text-secondary)' }}>
                    {o.customerName}
                  </td>
                  <td style={{ padding: '14px' }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {o.restaurants.join(' + ')}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                      {o.subOrdersCount} sub-order kitchens
                    </span>
                  </td>
                  <td style={{ padding: '14px', color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                    {o.riderName === 'Unassigned' ? (
                      <Badge variant="warning" size="sm">Dispatch Pending</Badge>
                    ) : (
                      o.riderName
                    )}
                  </td>
                  <td style={{ padding: '14px', fontWeight: 700, color: 'var(--accent)' }}>
                    ₱{o.totalAmount.toLocaleString('en-PH')}
                  </td>
                  <td style={{ padding: '14px' }}>
                    <Badge variant={o.status === 'Completed' ? 'success' : o.status === 'Cancelled' ? 'error' : 'primary'} size="sm" dot>
                      {o.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

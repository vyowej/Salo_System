import { useState, useEffect } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import adminService from '../../../services/adminService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

const TABS = ['All', 'Refund Requested', 'In Transit', 'Preparing', 'Completed', 'Cancelled'];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('All');
  const [search, setSearch] = useState('');

  function loadOrders() {
    setOrders(adminService.getOrders());
  }

  useEffect(() => {
    loadOrders();
  }, []);

  function handleDisputeAction(id, action) {
    adminService.resolveOrderDispute(id, action);
    loadOrders();
  }

  const filtered = orders.filter((o) => {
    let matchTab = true;
    if (tab === 'Refund Requested') {
      matchTab = o.disputeStatus.includes('Refund');
    } else if (tab !== 'All') {
      matchTab = o.status === tab;
    }

    const term = search.toLowerCase();
    const matchSearch =
      o.id.toLowerCase().includes(term) ||
      o.customerName.toLowerCase().includes(term) ||
      o.restaurants.some((r) => r.toLowerCase().includes(term));

    return matchTab && matchSearch;
  });

  return (
    <AdminLayout>
      {/* ── Page Header ────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--accent)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Fulfillment Supervision
          </span>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}>
            Platform Orders & Dispute Escalations
          </h1>
          <p className="page-subtitle">
            Oversee multi-kitchen order groupings, verify independent sub-order dispatch, and resolve customer claims
          </p>
        </div>
      </div>

      {/* ── Tabs & Search ──────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto' }}>
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                border: tab === t ? '1px solid var(--accent)' : '1px solid var(--border-primary)',
                background: tab === t ? 'var(--accent)' : 'var(--surface-primary)',
                color: tab === t ? '#fff' : 'var(--text-primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-lg)',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          minWidth: 260,
        }}>
          <input
            type="text"
            placeholder="Search Order Ref, Customer, Kitchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              width: '100%',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      {/* ── Orders Table ───────────────────────────────── */}
      <div style={{
        background: 'var(--surface-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-4)',
        boxShadow: 'var(--shadow-sm)',
        overflowX: 'auto',
      }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-8) 0', color: 'var(--text-muted)' }}>
            <p>No orders matching current filter.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--border-secondary)', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '12px 14px' }}>Order Ref</th>
                <th style={{ padding: '12px 14px' }}>Customer & Destination</th>
                <th style={{ padding: '12px 14px' }}>Multi-Kitchens</th>
                <th style={{ padding: '12px 14px' }}>Assigned Rider</th>
                <th style={{ padding: '12px 14px' }}>Total Amount</th>
                <th style={{ padding: '12px 14px' }}>Order Status</th>
                <th style={{ padding: '12px 14px' }}>Dispute / Claim</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Resolution</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                  <td style={{ padding: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {o.id}
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                      {o.createdAt}
                    </span>
                  </td>
                  <td style={{ padding: '14px' }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block' }}>{o.customerName}</strong>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>📍 {o.deliveryAddress}</span>
                  </td>
                  <td style={{ padding: '14px', fontSize: 'var(--font-size-xs)' }}>
                    <strong style={{ color: 'var(--accent)', display: 'block' }}>
                      {o.restaurants.join(' + ')}
                    </strong>
                    <span style={{ color: 'var(--text-muted)' }}>{o.subOrdersCount} independent kitchens</span>
                  </td>
                  <td style={{ padding: '14px', color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                    {o.riderName}
                  </td>
                  <td style={{ padding: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    ₱{o.totalAmount.toLocaleString('en-PH')}
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                      {o.paymentMethod}
                    </span>
                  </td>
                  <td style={{ padding: '14px' }}>
                    <Badge variant={o.status === 'Completed' ? 'success' : o.status === 'Cancelled' ? 'error' : 'primary'} size="sm" dot>
                      {o.status}
                    </Badge>
                  </td>
                  <td style={{ padding: '14px' }}>
                    {o.disputeStatus.includes('Refund') ? (
                      <Badge variant="warning" size="sm">⚠ {o.disputeStatus}</Badge>
                    ) : (
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>None</span>
                    )}
                  </td>
                  <td style={{ padding: '14px', textAlign: 'right' }}>
                    {o.disputeStatus === 'Refund Requested' ? (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Button variant="danger" size="sm" onClick={() => handleDisputeAction(o.id, 'Refund Approved')}>
                          Approve Refund
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDisputeAction(o.id, 'Dispute Dismissed')}>
                          Dismiss
                        </Button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Settled</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}

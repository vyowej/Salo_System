import { useState, useEffect } from 'react';
import RiderLayout from '../../../layouts/RiderLayout';
import riderService from '../../../services/riderService';
import Badge from '../../../components/common/Badge';

export default function RiderHistoryPage() {
  const [history, setHistory] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setHistory(riderService.getDeliveryHistory());
  }, []);

  const filtered = history.filter((item) => {
    const term = search.toLowerCase();
    return (
      item.id.toLowerCase().includes(term) ||
      item.orderId.toLowerCase().includes(term) ||
      item.restaurantName.toLowerCase().includes(term) ||
      item.customerName.toLowerCase().includes(term) ||
      item.dropoffAddress.toLowerCase().includes(term)
    );
  });

  const totalEarned = history.reduce((sum, h) => sum + (h.payout || 0) + (h.tip || 0), 0);

  return (
    <RiderLayout>
      {/* ── Page Header ────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--salo-green)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Trip Records
          </span>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}>
            Delivery History ({history.length} Trips)
          </h1>
          <p className="page-subtitle">
            Complete record of your fulfilled deliveries, rider fares, and customer tips
          </p>
        </div>

        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-lg)',
          padding: '8px 16px',
          textAlign: 'right',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Period Payout</span>
          <p style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--salo-green)', margin: '2px 0 0' }}>
            ₱{totalEarned.toLocaleString('en-PH')}
          </p>
        </div>
      </div>

      {/* ── Search Bar ─────────────────────────────────── */}
      <div style={{
        background: 'var(--surface-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-lg)',
        padding: '8px 14px',
        display: 'flex',
        alignItems: 'center',
        maxWidth: 420,
        marginBottom: 'var(--space-6)',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', marginRight: 10 }}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search by Order #, Restaurant, or Area..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            border: 'none',
            background: 'transparent',
            outline: 'none',
            width: '100%',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* ── History Table ──────────────────────────────── */}
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
            <p>No trips match your search criteria.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--border-secondary)', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '12px 14px' }}>Trip ID</th>
                <th style={{ padding: '12px 14px' }}>Date & Time</th>
                <th style={{ padding: '12px 14px' }}>Restaurant → Customer</th>
                <th style={{ padding: '12px 14px' }}>Payment</th>
                <th style={{ padding: '12px 14px' }}>Fare</th>
                <th style={{ padding: '12px 14px' }}>Tip</th>
                <th style={{ padding: '12px 14px' }}>Your Payout</th>
                <th style={{ padding: '12px 14px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                  <td style={{ padding: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {row.id}
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                      {row.orderId}
                    </span>
                  </td>
                  <td style={{ padding: '14px', color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                    {row.completedAt}
                  </td>
                  <td style={{ padding: '14px' }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block' }}>{row.restaurantName}</strong>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                      📍 {row.dropoffAddress}
                    </span>
                  </td>
                  <td style={{ padding: '14px', color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                    {row.paymentMethod}
                  </td>
                  <td style={{ padding: '14px', color: 'var(--text-primary)' }}>
                    ₱{row.payout}
                  </td>
                  <td style={{ padding: '14px', color: 'var(--salo-green)' }}>
                    {row.tip ? `+₱${row.tip}` : '—'}
                  </td>
                  <td style={{ padding: '14px', fontWeight: 800, color: 'var(--salo-green)' }}>
                    ₱{row.payout + (row.tip || 0)}
                  </td>
                  <td style={{ padding: '14px' }}>
                    <Badge variant="success" size="sm" dot>Completed</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </RiderLayout>
  );
}

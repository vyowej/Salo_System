import { useCallback, useEffect, useState } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Badge from '../../../components/common/Badge';
import { EmptyState, ErrorState, LoadingSpinner } from '../../../components/feedback';
import { useRestaurantAccess } from '../access/useRestaurantAccess';

export default function OwnerEarningsPage() {
  const { selectedRestaurantId } = useRestaurantAccess();
  const [earnings, setEarnings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadEarnings = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      setEarnings(ownerService.getEarningsOverview(selectedRestaurantId));
    } catch (loadError) {
      setError(loadError.message || 'Unable to load earnings.');
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId]);

  useEffect(() => {
    loadEarnings();
  }, [loadEarnings]);

  if (loading) {
    return <OwnerLayout><LoadingSpinner size="lg" label="Loading earnings..." /></OwnerLayout>;
  }
  if (error) {
    return <OwnerLayout><ErrorState description={error} onRetry={loadEarnings} /></OwnerLayout>;
  }
  if (!earnings) {
    return <OwnerLayout><ErrorState description="Earnings data is unavailable." onRetry={loadEarnings} /></OwnerLayout>;
  }

  const recentSales = Array.isArray(earnings.recentSales) ? earnings.recentSales : [];
  const settlements = Array.isArray(earnings.settlements) ? earnings.settlements : [];
  const maxDaily = Math.max(0, ...recentSales.map((sale) => sale.amount));

  return (
    <OwnerLayout>
      {/* ── Top Metrics Grid ────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-8)',
      }}>
        {/* Today */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
            Today's Gross Sales
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--accent)', margin: 'var(--space-2) 0' }}>
            ₱{earnings.today.toLocaleString('en-PH')}
          </p>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--salo-green)', fontWeight: 600 }}>
            Demo data
          </span>
        </div>

        {/* This Week */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
            This Week
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--fiesta-gold, #F59E0B)', margin: 'var(--space-2) 0' }}>
            ₱{earnings.thisWeek.toLocaleString('en-PH')}
          </p>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            Demo data
          </span>
        </div>

        {/* This Month */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
            This Month
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--text-primary)', margin: 'var(--space-2) 0' }}>
            ₱{earnings.thisMonth.toLocaleString('en-PH')}
          </p>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            Total orders: {earnings.totalOrders}
          </span>
        </div>

        {/* Pending Payout */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1.5px solid var(--salo-green)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--salo-green)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
            Pending payout (demo)
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--salo-green)', margin: 'var(--space-2) 0' }}>
            ₱{earnings.pendingPayout.toLocaleString('en-PH')}
          </p>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            Not connected to a payment or payout service
          </span>
        </div>
      </div>

      {/* ── 7-Day Sales Trend Bar Chart ──────────────────── */}
      <div style={{
        background: 'var(--surface-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-6)',
        marginBottom: 'var(--space-8)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>Recent Daily Performance</h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Daily gross sales from demo data
            </p>
          </div>
          <Badge variant="warning">Demo Data</Badge>
        </div>

        {/* Bar chart representation */}
        {recentSales.length === 0 ? <EmptyState title="No sales data yet" description="No daily earnings data is available for this restaurant." /> : <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          height: 180,
          gap: 'var(--space-3)',
          paddingBottom: 'var(--space-4)',
          borderBottom: '1px solid var(--border-secondary)',
        }}>
          {recentSales.map((item) => {
            const heightPercent = maxDaily ? Math.round((item.amount / maxDaily) * 100) : 0;

            return (
              <div
                key={item.day}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  height: '100%',
                  justifyContent: 'flex-end',
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  ₱{(item.amount / 1000).toFixed(1)}k
                </span>
                <div
                  style={{
                    width: '100%',
                    maxWidth: 42,
                    height: `${heightPercent}%`,
                    minHeight: 12,
                    background: item.day === 'Sun' ? 'var(--accent)' : 'var(--fiesta-gold, #F59E0B)',
                    borderRadius: '6px 6px 0 0',
                    transition: 'height var(--transition-normal)',
                  }}
                  title={`${item.day}: ₱${item.amount.toLocaleString()}`}
                />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                  {item.day}
                </span>
              </div>
            );
          })}
        </div>}
      </div>

      {/* ── Transaction History Table ────────────────────── */}
      <div style={{
        background: 'var(--surface-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-6)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <h2 className="section-title" style={{ marginBottom: 'var(--space-4)' }}>
          Settlement History
        </h2>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--border-secondary)', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '12px 16px' }}>Payout Ref</th>
                <th style={{ padding: '12px 16px' }}>Date</th>
                <th style={{ padding: '12px 16px' }}>Method</th>
                <th style={{ padding: '12px 16px' }}>Gross Sales</th>
                <th style={{ padding: '12px 16px' }}>Fees</th>
                <th style={{ padding: '12px 16px' }}>Net Amount</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((row) => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{row.id}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{row.date}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{row.method}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-primary)' }}>₱{(row.gross || 0).toLocaleString()}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--salo-error)' }}>-₱{(row.fee || 0).toLocaleString()}</td>
                  <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--salo-green)' }}>₱{(row.net || 0).toLocaleString()}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <Badge variant={row.status === 'Completed' ? 'success' : 'default'} size="sm" dot>{row.status || 'Unknown'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {settlements.length === 0 && <EmptyState title="No settlement history" description="Settlement records are not available in the demo data." />}
        </div>
      </div>
    </OwnerLayout>
  );
}

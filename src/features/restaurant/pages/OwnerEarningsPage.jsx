import { useState } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';

export default function OwnerEarningsPage() {
  const earnings = ownerService.getEarningsOverview();
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [payoutSuccess, setPayoutSuccess] = useState(false);

  function handleRequestPayout() {
    setPayoutSuccess(true);
    setTimeout(() => {
      setPayoutSuccess(false);
      setPayoutModalOpen(false);
    }, 2000);
  }

  const maxDaily = Math.max(...earnings.recentSales.map((s) => s.amount));

  return (
    <OwnerLayout>
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
            Financial Performance
          </span>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}>
            Earnings & Payouts
          </h1>
          <p className="page-subtitle">
            Track daily gross revenue, platform settlements, and bank disbursements
          </p>
        </div>

        <Button variant="primary" size="md" onClick={() => setPayoutModalOpen(true)}>
          Request Payout (₱{earnings.pendingPayout.toLocaleString('en-PH')})
        </Button>
      </div>

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
            ↑ 14% higher than yesterday
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
            Across 58 completed orders
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
            Avg Order: ₱{earnings.avgOrderValue}
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
            Available Payout
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--salo-green)', margin: 'var(--space-2) 0' }}>
            ₱{earnings.pendingPayout.toLocaleString('en-PH')}
          </p>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            Next scheduled: Monday 10:00 AM
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
            <h2 className="section-title" style={{ margin: 0 }}>Recent 7-Day Performance</h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Daily gross sales from dine-in reservation deposits and multi-order deliveries
            </p>
          </div>
          <Badge variant="primary">Updated Real-Time</Badge>
        </div>

        {/* Bar chart representation */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          height: 180,
          gap: 'var(--space-3)',
          paddingBottom: 'var(--space-4)',
          borderBottom: '1px solid var(--border-secondary)',
        }}>
          {earnings.recentSales.map((item) => {
            const heightPercent = Math.round((item.amount / maxDaily) * 100);

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
        </div>
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
          Recent Settlements & Disbursals
        </h2>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--border-secondary)', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '12px 16px' }}>Payout Ref</th>
                <th style={{ padding: '12px 16px' }}>Date</th>
                <th style={{ padding: '12px 16px' }}>Method</th>
                <th style={{ padding: '12px 16px' }}>Gross Sales</th>
                <th style={{ padding: '12px 16px' }}>Commission (10%)</th>
                <th style={{ padding: '12px 16px' }}>Net Payout</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                { id: 'PAY-8821', date: 'Nov 03, 2026', method: 'BDO Unibank (••4190)', gross: 24500, fee: 2450, net: 22050, status: 'Completed' },
                { id: 'PAY-8815', date: 'Oct 27, 2026', method: 'BDO Unibank (••4190)', gross: 29800, fee: 2980, net: 26820, status: 'Completed' },
                { id: 'PAY-8809', date: 'Oct 20, 2026', method: 'BDO Unibank (••4190)', gross: 21300, fee: 2130, net: 19170, status: 'Completed' },
                { id: 'PAY-8794', date: 'Oct 13, 2026', method: 'BDO Unibank (••4190)', gross: 31200, fee: 3120, net: 28080, status: 'Completed' },
              ].map((row) => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{row.id}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{row.date}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{row.method}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-primary)' }}>₱{row.gross.toLocaleString()}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--salo-error)' }}>-₱{row.fee.toLocaleString()}</td>
                  <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--salo-green)' }}>₱{row.net.toLocaleString()}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <Badge variant="success" size="sm" dot>Disbursed</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Request Payout Modal ─────────────────────────── */}
      <Modal
        open={payoutModalOpen}
        onClose={() => setPayoutModalOpen(false)}
        title="Request Bank Payout"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', width: '100%' }}>
            <Button variant="ghost" onClick={() => setPayoutModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRequestPayout} disabled={payoutSuccess}>
              {payoutSuccess ? 'Submitted!' : 'Confirm Disbursement'}
            </Button>
          </div>
        }
      >
        {payoutSuccess ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
            <span style={{ fontSize: 40 }}>✅</span>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginTop: 8 }}>Payout Initiated</h3>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>
              ₱{earnings.pendingPayout.toLocaleString('en-PH')} will be credited to your verified BDO account within 24 hours.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
              Transfer your available restaurant earnings directly to your registered bank account:
            </p>

            <div style={{
              padding: 'var(--space-4)',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-primary)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Disbursement Amount</span>
                <strong style={{ fontSize: 'var(--font-size-md)', color: 'var(--salo-green)' }}>
                  ₱{earnings.pendingPayout.toLocaleString('en-PH')}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Destination</span>
                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>BDO Unibank ••••4190</span>
              </div>
            </div>

            <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              SALO delivers payouts automatically on Mondays, or immediately upon on-demand request. No hidden withdrawal fees.
            </p>
          </div>
        )}
      </Modal>
    </OwnerLayout>
  );
}

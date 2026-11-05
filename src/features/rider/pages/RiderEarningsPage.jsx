import { useState, useEffect } from 'react';
import RiderLayout from '../../../layouts/RiderLayout';
import riderService from '../../../services/riderService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import { Input, Select } from '../../../components/forms';

export default function RiderEarningsPage() {
  const [profile, setProfile] = useState(riderService.getRiderProfile());
  const [earnings, setEarnings] = useState(riderService.getEarningsSummary());
  const [remittances, setRemittances] = useState(riderService.getRemittances());

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [remitAmount, setRemitAmount] = useState(profile.cashOnHand || 1450);
  const [channel, setChannel] = useState('GCash Remittance');
  const [reference, setReference] = useState('');
  const [successMsg, setSuccessMsg] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    const p = riderService.getRiderProfile();
    setProfile(p);
    setRemitAmount(p.cashOnHand);
    setEarnings(riderService.getEarningsSummary());
    setRemittances(riderService.getRemittances());
  }

  function handleRemitSubmit(e) {
    e.preventDefault();
    if (!remitAmount || remitAmount <= 0) return;

    riderService.remitCash(remitAmount, channel, reference);
    setSuccessMsg(true);
    setTimeout(() => {
      setSuccessMsg(false);
      setModalOpen(false);
      refresh();
    }, 1500);
  }

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
            Rider Finance & Collections
          </span>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}>
            Earnings & COD Remittance
          </h1>
          <p className="page-subtitle">
            Manage your daily delivery income, tips, and cash-on-delivery settlements
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => { setReference(`REF-${Math.floor(10000000 + Math.random() * 90000000)}`); setModalOpen(true); }}
          disabled={profile.cashOnHand <= 0}
        >
          Remit COD Cash (₱{profile.cashOnHand.toLocaleString('en-PH')})
        </Button>
      </div>

      {/* ── Key Cards Grid ──────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-8)',
      }}>
        {/* Today's Earning */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
            Today's Net Payout
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--salo-green)', margin: 'var(--space-2) 0' }}>
            ₱{earnings.todayEarnings.toLocaleString('en-PH')}
          </p>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            Fares: ₱{earnings.deliveryFees} · Tips: ₱{earnings.tips}
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
            This Week's Fares
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--fiesta-gold, #F59E0B)', margin: 'var(--space-2) 0' }}>
            ₱{earnings.weeklyEarnings.toLocaleString('en-PH')}
          </p>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            Paid out every Wednesday to GCash
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
            This Month Total
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--text-primary)', margin: 'var(--space-2) 0' }}>
            ₱{earnings.monthlyEarnings.toLocaleString('en-PH')}
          </p>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            {profile.totalTrips} Total Deliveries
          </span>
        </div>

        {/* Cash On Hand */}
        <div style={{
          background: 'var(--surface-primary)',
          border: profile.cashOnHand > 2000 ? '2px solid var(--accent)' : '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
            Cash On Hand (To Remit)
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--accent)', margin: 'var(--space-2) 0' }}>
            ₱{profile.cashOnHand.toLocaleString('en-PH')}
          </p>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            Limit: ₱5,000 before dispatch pause
          </span>
        </div>
      </div>

      {/* ── Remittance History Table ─────────────────────── */}
      <div style={{
        background: 'var(--surface-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-6)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>Recent Remittance History</h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Confirmed settlements of customer cash collected on deliveries
            </p>
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--salo-green)', fontWeight: 600 }}>
            ✓ Account in Good Standing
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--border-secondary)', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '12px 14px' }}>Remit ID</th>
                <th style={{ padding: '12px 14px' }}>Date & Time</th>
                <th style={{ padding: '12px 14px' }}>Channel</th>
                <th style={{ padding: '12px 14px' }}>Reference #</th>
                <th style={{ padding: '12px 14px' }}>Amount Remitted</th>
                <th style={{ padding: '12px 14px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {remittances.map((row) => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                  <td style={{ padding: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{row.id}</td>
                  <td style={{ padding: '14px', color: 'var(--text-secondary)' }}>{row.date}</td>
                  <td style={{ padding: '14px', color: 'var(--text-secondary)' }}>{row.channel}</td>
                  <td style={{ padding: '14px' }}>
                    <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                      {row.reference}
                    </code>
                  </td>
                  <td style={{ padding: '14px', fontWeight: 700, color: 'var(--accent)' }}>
                    ₱{row.amount.toLocaleString('en-PH')}
                  </td>
                  <td style={{ padding: '14px' }}>
                    <Badge variant="success" size="sm" dot>{row.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Remit Modal ──────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Remit Cash on Hand"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', width: '100%' }}>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRemitSubmit} disabled={successMsg}>
              {successMsg ? 'Verified & Remitted!' : 'Submit Remittance Proof'}
            </Button>
          </div>
        }
      >
        {successMsg ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
            <span style={{ fontSize: 44 }}>✅</span>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginTop: 8 }}>
              Remittance Confirmed
            </h3>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>
              ₱{parseFloat(remitAmount).toLocaleString('en-PH')} has been credited and deducted from your cash on hand.
            </p>
          </div>
        ) : (
          <form onSubmit={handleRemitSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{
              padding: 'var(--space-3)',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}>
              Send payment to SALO Official Rider Collections account, then enter your confirmation reference below.
            </div>

            <Input
              id="remit-amount"
              label="Remittance Amount (₱)"
              type="number"
              max={profile.cashOnHand}
              min="1"
              value={remitAmount}
              onChange={(e) => setRemitAmount(e.target.value)}
              required
            />

            <Select
              id="remit-channel"
              label="Payment Channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              options={[
                { value: 'GCash Remittance', label: 'GCash (0917-800-SALO)' },
                { value: 'Maya App', label: 'Maya Pay (SALO Logistics Inc.)' },
                { value: '7-Eleven Cliqq', label: '7-Eleven Cliqq Machine' },
              ]}
            />

            <Input
              id="remit-ref"
              label="Transaction Reference Number"
              placeholder="e.g. 9948102941"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              required
            />
          </form>
        )}
      </Modal>
    </RiderLayout>
  );
}

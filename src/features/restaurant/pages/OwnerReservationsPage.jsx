import { useState, useEffect } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'Pending', label: 'Pending' },
  { id: 'Confirmed', label: 'Confirmed' },
  { id: 'Completed', label: 'Completed' },
  { id: 'Cancelled', label: 'Cancelled' },
];

function statusVariant(status = '') {
  const s = status.toLowerCase();
  if (s === 'pending') return 'warning';
  if (s === 'confirmed') return 'success';
  if (s === 'completed') return 'info';
  if (s === 'cancelled') return 'default';
  return 'default';
}

export default function OwnerReservationsPage() {
  const [reservations, setReservations] = useState([]);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  function loadReservations() {
    setReservations(ownerService.getReservations());
  }

  useEffect(() => {
    loadReservations();
  }, []);

  function handleStatus(id, newStatus) {
    ownerService.updateReservationStatus(id, newStatus);
    loadReservations();
  }

  const filtered = filter === 'all'
    ? reservations
    : reservations.filter((r) => r.status === filter);

  return (
    <OwnerLayout>
      {/* ── Page Header ────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--fiesta-gold, #F59E0B)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Dine-In Bookings
        </span>
        <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}>
          Table Reservations
        </h1>
        <p className="page-subtitle">
          Review guest party requests, track deposits, and manage dining room capacity
        </p>
      </div>

      {/* ── Filter Tabs ────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)', overflowX: 'auto', paddingBottom: 4 }}>
        {TABS.map((tab) => {
          const count = tab.id === 'all'
            ? reservations.length
            : reservations.filter((r) => r.status === tab.id).length;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                border: filter === tab.id ? '1px solid var(--accent)' : '1px solid var(--border-primary)',
                background: filter === tab.id ? 'var(--accent)' : 'var(--surface-primary)',
                color: filter === tab.id ? '#fff' : 'var(--text-primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all var(--transition-fast)',
              }}
            >
              <span>{tab.label}</span>
              <span style={{
                background: filter === tab.id ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)',
                color: filter === tab.id ? '#fff' : 'var(--text-muted)',
                borderRadius: 'var(--radius-full)',
                padding: '1px 6px',
                fontSize: 11,
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Reservations List ───────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-12) var(--space-4)',
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          color: 'var(--text-muted)',
        }}>
          <p style={{ fontSize: 32, marginBottom: 8 }}>🪑</p>
          <p style={{ fontWeight: 600, fontSize: 'var(--font-size-md)', color: 'var(--text-primary)' }}>No reservations in this status</p>
          <p style={{ fontSize: 'var(--font-size-sm)', marginTop: 4 }}>Any incoming table booking requests will appear here automatically.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {filtered.map((res) => {
            const isExpanded = expandedId === res.id;

            return (
              <div
                key={res.id}
                style={{
                  background: 'var(--surface-primary)',
                  border: isExpanded ? '1px solid var(--accent)' : '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-xl)',
                  padding: 'var(--space-4) var(--space-5)',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
                }}
              >
                {/* Main Row */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 'var(--space-3)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: 'var(--radius-lg)',
                      background: 'var(--bg-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 22,
                    }}>
                      🪑
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                          {res.guestName}
                        </h3>
                        <Badge variant={statusVariant(res.status)} size="sm" dot>
                          {res.status}
                        </Badge>
                      </div>

                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--text-secondary)',
                        marginTop: 4,
                        flexWrap: 'wrap',
                      }}>
                        <span>👥 {res.guestCount} guests</span>
                        <span>•</span>
                        <span>📅 {res.date} at {res.time}</span>
                        <span>•</span>
                        <span style={{ color: res.depositPaid ? 'var(--salo-green)' : 'var(--text-muted)', fontWeight: 600 }}>
                          {res.depositPaid ? '₱500 Deposit Paid' : 'No Deposit'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Expand Button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    {res.status === 'Pending' && (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleStatus(res.id, 'Confirmed')}
                        >
                          Confirm Booking
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStatus(res.id, 'Cancelled')}
                          style={{ color: 'var(--salo-error)' }}
                        >
                          Decline
                        </Button>
                      </>
                    )}

                    {res.status === 'Confirmed' && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleStatus(res.id, 'Completed')}
                        >
                          Mark Seated / Done
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStatus(res.id, 'Cancelled')}
                          style={{ color: 'var(--text-muted)' }}
                        >
                          Cancel
                        </Button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : res.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        padding: '6px 10px',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {isExpanded ? 'Hide Details ▲' : 'Details ▼'}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div style={{
                    marginTop: 'var(--space-4)',
                    paddingTop: 'var(--space-4)',
                    borderTop: '1px solid var(--border-secondary)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 'var(--space-4)',
                    fontSize: 'var(--font-size-xs)',
                  }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Contact Phone</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{res.phone || 'None provided'}</strong>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Special Notes / Requests</span>
                      <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                        {res.specialRequests || 'No special requests submitted.'}
                      </p>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Reservation Reference</span>
                      <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>
                        {res.id}
                      </code>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </OwnerLayout>
  );
}

import { Link } from 'react-router-dom';
import Badge from '../../../../components/common/Badge';
import Button from '../../../../components/common/Button';
import { getReservationStatusBadge } from '../../utils/ownerDashboardUtils';

export default function OwnerDashboardReservationsSection({ upcomingReservations }) {
  return (
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
  );
}

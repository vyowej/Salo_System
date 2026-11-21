import { Link } from 'react-router-dom';
import Button from '../../../../components/common/Button';

export default function OwnerDashboardMenuHealthSection({ stats, publishStatus = null }) {
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
          {publishStatus ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-block', marginTop: 4 }}>
              {publishStatus.is_published
                ? (publishStatus.pending_changes?.total > 0
                  ? `Published · ${publishStatus.pending_changes.total} unpublished change(s)`
                  : 'Published to customers')
                : 'Not published yet (hidden from customers)'}
            </span>
          ) : null}
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
  );
}

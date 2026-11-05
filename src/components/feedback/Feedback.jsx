import './Feedback.css';

/** Loading skeleton block */
export function Skeleton({ width, height, className = '' }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height: height || '16px' }}
      aria-hidden="true"
    />
  );
}

/** Skeleton text lines */
export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`skeleton-text ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height: '14px',
            width: i === lines - 1 ? '60%' : '100%',
          }}
        />
      ))}
    </div>
  );
}

/** Skeleton card */
export function SkeletonCard({ className = '' }) {
  return (
    <div className={`card skeleton-card ${className}`} aria-hidden="true">
      <div className="skeleton" style={{ height: '160px', borderRadius: 0 }} />
      <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div className="skeleton" style={{ height: '14px', width: '70%' }} />
        <div className="skeleton" style={{ height: '14px', width: '90%' }} />
        <div className="skeleton" style={{ height: '14px', width: '50%' }} />
      </div>
    </div>
  );
}

/** Empty state */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}) {
  return (
    <div className={`empty-state ${className}`}>
      {icon && <div className="empty-state-icon">{icon}</div>}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}

/** Error state */
export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  className = '',
}) {
  return (
    <div className={`error-state ${className}`}>
      <div className="error-state-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {onRetry && (
        <button className="btn btn-secondary" onClick={onRetry} type="button">
          Try again
        </button>
      )}
    </div>
  );
}

/** Inline loading spinner centered */
export function LoadingSpinner({ size = 'md', label = 'Loading…' }) {
  const dim = size === 'sm' ? 20 : size === 'lg' ? 40 : 28;
  const border = size === 'sm' ? 2 : size === 'lg' ? 4 : 3;
  return (
    <div className="loading-spinner-center" role="status" aria-label={label}>
      <div
        style={{
          width: dim,
          height: dim,
          border: `${border}px solid var(--border-primary)`,
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 600ms linear infinite',
        }}
      />
    </div>
  );
}

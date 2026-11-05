import './Card.css';

/**
 * SALO Card Component
 *
 * @param {string}  variant   - 'default' | 'elevated' | 'flat'
 * @param {boolean} interactive
 * @param {string}  as        - Root element (default 'div')
 */
export function Card({
  children,
  variant = 'default',
  interactive = false,
  as: Tag = 'div',
  className = '',
  ...props
}) {
  const classes = [
    'card',
    variant !== 'default' ? `card-${variant}` : '',
    interactive ? 'card-interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag className={classes} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({ children, className = '', ...props }) {
  return <div className={`card-header ${className}`} {...props}>{children}</div>;
}

export function CardTitle({ children, description, className = '' }) {
  return (
    <div className={className}>
      <h3 className="card-title">{children}</h3>
      {description && <p className="card-description">{description}</p>}
    </div>
  );
}

export function CardBody({ children, size = 'md', className = '', ...props }) {
  const sizeClass = size === 'sm' ? 'card-body-sm' : size === 'lg' ? 'card-body-lg' : 'card-body';
  return <div className={`${sizeClass} ${className}`} {...props}>{children}</div>;
}

export function CardFooter({ children, className = '', ...props }) {
  return <div className={`card-footer ${className}`} {...props}>{children}</div>;
}

/**
 * Stat card — for dashboard metrics
 */
export function StatCard({ label, value, change, changeType = 'positive', icon, className = '' }) {
  return (
    <div className={`card stat-card ${className}`}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span className="stat-card-label">{label}</span>
        {icon && <span style={{ color: 'var(--text-muted)' }}>{icon}</span>}
      </div>
      <span className="stat-card-value">{value}</span>
      {change && (
        <span className={`stat-card-change ${changeType}`}>
          {changeType === 'positive' ? '↑' : '↓'} {change}
        </span>
      )}
    </div>
  );
}

export default Card;

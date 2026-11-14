import './Badge.css';

/** Map of status → badge variant */
const STATUS_MAP = {
  pending:                  'upcoming',
  confirmed:                'upcoming',
  accepted:                 'upcoming',
  preparing:                'upcoming',
  'ready for pickup':       'upcoming',
  ready:                    'upcoming',
  'out for delivery':       'upcoming',
  'on the way':             'upcoming',
  'in progress':            'upcoming',
  scheduled:                'upcoming',
  'cancellation requested': 'upcoming',
  'partially completed':    'upcoming',
  approved:                 'completed',
  active:                   'completed',
  completed:                'completed',
  delivered:                'completed',
  'picked up':              'completed',
  rejected:                 'cancelled',
  cancelled:                'cancelled',
  failed:                   'cancelled',
  inactive:                 'default',
};

/**
 * SALO Badge Component
 *
 * @param {string}  variant   - 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' | 'upcoming' | 'completed' | 'cancelled'
 * @param {string}  status    - Semantic status string (auto-maps to variant)
 * @param {string}  size      - 'sm' | 'md' | 'lg'
 * @param {boolean} dot       - Show a dot indicator
 * @param {node}    icon      - Optional leading icon
 * @param {boolean} outlined
 */
export default function Badge({
  children,
  variant,
  status,
  size = 'md',
  dot = false,
  icon = null,
  outlined = false,
  className = '',
}) {
  const resolvedVariant = variant || (status ? STATUS_MAP[status.toLowerCase()] : undefined) || 'default';

  const classes = [
    'badge',
    `badge-${resolvedVariant}`,
    size !== 'md' ? `badge-${size}` : '',
    outlined ? 'badge-outlined' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes}>
      {icon}
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {children || (status && capitalize(status))}
    </span>
  );
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

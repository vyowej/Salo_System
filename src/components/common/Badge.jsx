import './Badge.css';

/** Map of status → badge variant */
const STATUS_MAP = {
  pending:    'warning',
  approved:   'success',
  active:     'success',
  completed:  'success',
  delivered:  'success',
  rejected:   'error',
  cancelled:  'error',
  failed:     'error',
  inactive:   'default',
  preparing:  'primary',
  ready:      'primary',
  'on the way': 'info',
};

/**
 * SALO Badge Component
 *
 * @param {string}  variant   - 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'
 * @param {string}  status    - Semantic status string (auto-maps to variant)
 * @param {string}  size      - 'sm' | 'md' | 'lg'
 * @param {boolean} dot       - Show a dot indicator
 * @param {boolean} outlined
 */
export default function Badge({
  children,
  variant,
  status,
  size = 'md',
  dot = false,
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
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {children || (status && capitalize(status))}
    </span>
  );
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

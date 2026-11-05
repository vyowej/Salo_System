import './Button.css';

/**
 * SALO Button Component
 *
 * @param {string}  variant   - 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-outline'
 * @param {string}  size      - 'sm' | 'md' | 'lg' | 'xl'
 * @param {boolean} fullWidth
 * @param {boolean} loading
 * @param {boolean} iconOnly
 * @param {node}    leftIcon
 * @param {node}    rightIcon
 * @param {string}  as        - 'button' | 'a' | 'span'
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  iconOnly = false,
  leftIcon,
  rightIcon,
  as: Tag = 'button',
  className = '',
  onClick,
  type = 'button',
  ...props
}) {
  const classes = [
    'btn',
    `btn-${variant}`,
    size !== 'md' ? `btn-${size}` : '',
    fullWidth ? 'btn-full' : '',
    iconOnly ? 'btn-icon' : '',
    loading ? 'btn-loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag
      className={classes}
      disabled={disabled || loading}
      aria-disabled={disabled || loading}
      onClick={!disabled && !loading ? onClick : undefined}
      type={Tag === 'button' ? type : undefined}
      {...props}
    >
      {loading ? (
        <span className="spinner spinner-sm" aria-hidden="true" />
      ) : leftIcon ? (
        <span className="btn-icon-left" aria-hidden="true">{leftIcon}</span>
      ) : null}

      {!iconOnly && <span>{children}</span>}
      {iconOnly && !loading && children}

      {!loading && rightIcon && (
        <span className="btn-icon-right" aria-hidden="true">{rightIcon}</span>
      )}
    </Tag>
  );
}

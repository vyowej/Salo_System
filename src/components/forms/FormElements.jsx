import './FormElements.css';

/** Label */
export function Label({ children, htmlFor, required, className = '' }) {
  return (
    <label
      htmlFor={htmlFor}
      className={`form-label ${required ? 'form-label-required' : ''} ${className}`}
    >
      {children}
    </label>
  );
}

/** HelperText */
export function HelperText({ children, className = '' }) {
  return <p className={`form-helper ${className}`}>{children}</p>;
}

/** ErrorMessage */
export function ErrorMessage({ children, className = '' }) {
  if (!children) return null;
  return (
    <p className={`form-error ${className}`} role="alert">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0V5zm.75 7a1 1 0 110-2 1 1 0 010 2z"/>
      </svg>
      {children}
    </p>
  );
}

/** FormGroup */
export function FormGroup({ children, className = '' }) {
  return <div className={`form-group ${className}`}>{children}</div>;
}

/**
 * Input
 */
export function Input({
  id,
  label,
  helper,
  error,
  required,
  size = 'md',
  leftIcon,
  rightIcon,
  className = '',
  ...props
}) {
  const sizeClass = size === 'sm' ? 'input-sm' : size === 'lg' ? 'input-lg' : '';
  const classes = [
    'input',
    sizeClass,
    error ? 'input-error' : '',
    leftIcon ? 'has-icon-left' : '',
    rightIcon ? 'has-icon-right' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <FormGroup>
      {label && <Label htmlFor={id} required={required}>{label}</Label>}
      <div className="input-wrapper">
        {leftIcon && <span className="input-icon-left">{leftIcon}</span>}
        <input id={id} className={classes} required={required} {...props} />
        {rightIcon && <span className="input-icon-right">{rightIcon}</span>}
      </div>
      {helper && !error && <HelperText>{helper}</HelperText>}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </FormGroup>
  );
}

/**
 * Textarea
 */
export function Textarea({
  id,
  label,
  helper,
  error,
  required,
  className = '',
  ...props
}) {
  return (
    <FormGroup>
      {label && <Label htmlFor={id} required={required}>{label}</Label>}
      <textarea
        id={id}
        className={`textarea ${error ? 'input-error' : ''} ${className}`}
        required={required}
        {...props}
      />
      {helper && !error && <HelperText>{helper}</HelperText>}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </FormGroup>
  );
}

/**
 * Select
 */
export function Select({
  id,
  label,
  helper,
  error,
  required,
  size = 'md',
  children,
  className = '',
  ...props
}) {
  const sizeClass = size === 'sm' ? 'select-sm' : size === 'lg' ? 'select-lg' : '';
  return (
    <FormGroup>
      {label && <Label htmlFor={id} required={required}>{label}</Label>}
      <div className="input-wrapper">
        <select
          id={id}
          className={`select ${sizeClass} ${error ? 'input-error' : ''} ${className}`}
          required={required}
          style={{ paddingRight: '36px' }}
          {...props}
        >
          {children}
        </select>
        <span className="input-icon-right" style={{ pointerEvents: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 6.146a.5.5 0 01.708 0L8 8.793l2.646-2.647a.5.5 0 11.708.708l-3 3a.5.5 0 01-.708 0l-3-3a.5.5 0 010-.708z"/>
          </svg>
        </span>
      </div>
      {helper && !error && <HelperText>{helper}</HelperText>}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </FormGroup>
  );
}

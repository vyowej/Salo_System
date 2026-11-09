import { Link } from 'react-router-dom';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import { DELIVERY_OUTCOMES } from '../constants/riderConstants';
import './RiderUI.css';

export function RiderPageHeading({ eyebrow, title, description, actions }) {
  return (
    <header className="rider-page-heading">
      <div>
        <p className="rider-eyebrow">{eyebrow}</p>
        <h1 className="rider-title">{title}</h1>
        {description && <p className="rider-description">{description}</p>}
      </div>
      {actions && <div className="rider-heading-actions">{actions}</div>}
    </header>
  );
}

export function RiderCard({ title, description, actions, children, className = '' }) {
  return (
    <Card className={`rider-card ${className}`}>
      {(title || description || actions) && (
        <div className="rider-card-heading">
          <div>
            {title && <h2 className="rider-card-title">{title}</h2>}
            {description && <p className="rider-card-description">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <CardBody className="rider-card-body">{children}</CardBody>
    </Card>
  );
}

export function RiderStatusBadge({ status, tone }) {
  const resolvedTone = tone || (DELIVERY_OUTCOMES.includes(status) ? 'danger' : 'neutral');
  const variant = {
    success: 'success',
    warning: 'warning',
    info: 'info',
    danger: 'error',
    neutral: 'default',
    primary: 'primary',
  }[resolvedTone] || 'default';
  return <Badge variant={variant} size="sm" dot>{status}</Badge>;
}

export function RiderStatePanel({ state, data, onStateChange }) {
  if (state === 'Loading') {
    return (
      <div className="rider-skeleton-stack" role="status" aria-label="Loading preview">
        <span className="rider-skeleton rider-skeleton-title" />
        <span className="rider-skeleton" />
        <span className="rider-skeleton" />
      </div>
    );
  }
  if (state === 'Empty') {
    return (
      <div className="rider-empty-state">
        <span className="rider-empty-icon" aria-hidden="true">⌁</span>
        <h2>{data.emptyTitle}</h2>
        <p>{data.emptyMessage}</p>
      </div>
    );
  }
  if (state === 'Error') {
    return (
      <div className="rider-state-alert is-error" role="alert">
        <strong>{data.errorTitle}</strong>
        <span>{data.errorMessage}</span>
        <Button variant="outline" size="sm" onClick={() => onStateChange('Sample data')}>{data.retryLabel}</Button>
      </div>
    );
  }
  if (state === 'Success') {
    return (
      <div className="rider-state-alert is-success" role="status">
        <strong>{data.successTitle}</strong>
        <span>{data.successMessage}</span>
      </div>
    );
  }
  return null;
}

export function RiderPreviewControls({ state, states, onChange, label }) {
  return (
    <label className="rider-preview-control">
      <span>{label}</span>
      <select value={state} onChange={(event) => onChange(event.target.value)}>
        {states.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  );
}

export function RiderMetric({ label, value, detail, tone = 'default' }) {
  return (
    <Card className={`rider-metric tone-${tone}`}>
      <CardBody className="rider-metric-body">
        <span className="rider-metric-label">{label}</span>
        <strong className="rider-metric-value">{value}</strong>
        <span className="rider-metric-detail">{detail}</span>
      </CardBody>
    </Card>
  );
}

export function RiderLinkButton({ to, children, variant = 'outline' }) {
  return <Button as={Link} to={to} variant={variant} size="sm">{children}</Button>;
}

export function RiderUploadField({ label, accept, onChange, preview, multiple = false, hint }) {
  return (
    <label className="rider-upload-field">
      <span className="rider-upload-label">{label}</span>
      {preview && <img className="rider-upload-preview" src={preview} alt="" />}
      <input type="file" accept={accept} multiple={multiple} onChange={onChange} />
      <span className="rider-upload-hint">{hint}</span>
    </label>
  );
}

export function RiderTimeline({ items, active }) {
  return (
    <ol className="rider-timeline">
      {items.map((item) => (
        <li key={item.label} className={item.label === active ? 'is-current' : item.complete ? 'is-complete' : ''}>
          <span className="rider-timeline-marker" aria-hidden="true" />
          <div><strong>{item.label}</strong><span>{item.time || item.note}</span></div>
        </li>
      ))}
    </ol>
  );
}

export function RiderSelect({ label, options, value, onChange, id }) {
  return (
    <label className="rider-field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={onChange}>
        {options.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  );
}

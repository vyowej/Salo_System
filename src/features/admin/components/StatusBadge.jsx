import './AdminComponents.css';

const TONES = {
  active: 'success',
  approved: 'success',
  accepted: 'success',
  completed: 'success',
  verified: 'success',
  'pending approval': 'action',
  'pending verification': 'action',
  'pending invitation': 'action',
  'pending review': 'action',
  pending: 'warning',
  expired: 'neutral',
  scheduled: 'gold',
  draft: 'brown',
  submitted: 'gold',
  'documents requested': 'action',
  'more information requested': 'action',
  'under review': 'gold',
  'awaiting rider response': 'gold',
  resolved: 'success',
  closed: 'success',
  suspended: 'error',
  rejected: 'error',
  cancelled: 'error',
  deactivated: 'neutral',
  inactive: 'neutral',
  'in transit': 'info',
  preparing: 'info',
  'on delivery': 'info',
};

export default function StatusBadge({ status, className = '' }) {
  const tone = TONES[String(status).toLowerCase()] || 'neutral';
  return <span className={`admin-status-badge admin-status-badge--${tone} ${className}`.trim()}>{status}</span>;
}

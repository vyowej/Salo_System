import './AdminComponents.css';

const TONES = {
  active: 'success',
  approved: 'success',
  accepted: 'success',
  completed: 'success',
  verified: 'success',
  'pending approval': 'warning',
  'pending verification': 'warning',
  'pending invitation': 'warning',
  pending: 'warning',
  expired: 'warning',
  'documents requested': 'warning',
  'more information requested': 'warning',
  'under review': 'warning',
  suspended: 'error',
  rejected: 'error',
  cancelled: 'error',
  deactivated: 'neutral',
  inactive: 'neutral',
  'in transit': 'info',
  preparing: 'info',
  'on delivery': 'info',
};

export default function StatusBadge({ status }) {
  const tone = TONES[String(status).toLowerCase()] || 'neutral';
  return <span className={`admin-status-badge admin-status-badge--${tone}`}>{status}</span>;
}

import './AdminApplications.css';

const STATUS_TONE_MAP = {
  approved: 'success',
  verified: 'success',
  rejected: 'danger',
  submitted: 'warning',
  'pending review': 'warning',
  pending_review: 'warning',
  'under review': 'warning',
  under_review: 'warning',
  resubmitted: 'warning',
  pending: 'warning',
  'additional documents required': 'warning',
  additional_documents_required: 'warning',
  'waiting for applicant': 'warning',
};

export default function StatusChip({ status, label, className = '' }) {
  const display = label || status || 'Unknown';
  const normalized = String(status || display).toLowerCase().trim();
  const tone = STATUS_TONE_MAP[normalized] || 'neutral';

  return (
    <span className={`salo-status-chip salo-status-chip--${tone} ${className}`.trim()}>
      <span className="salo-status-chip__dot" aria-hidden="true" />
      <span>{display}</span>
    </span>
  );
}

import Badge from '../../../components/common/Badge';
import { statusBadgeVariants } from '../constants/statusConfig';
import './StatusBadge.css';

export default function StatusBadge({ status, config = [], tone = 'neutral' }) {
  const match = Array.isArray(config)
    ? config.find((item) => item.key === status || item.label === status)
    : null;

  const resolvedTone = match?.tone || tone;
  const label = match?.label || status || 'Status';
  const variant = statusBadgeVariants[resolvedTone] || 'default';

  return <Badge variant={variant} size="sm">{label}</Badge>;
}

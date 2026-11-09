import Badge from '../../../components/common/Badge';

const toneMap = {
  neutral: 'default',
  info: 'primary',
  success: 'success',
  warning: 'warning',
  danger: 'error',
};

export default function StatusBadge({ status, config = [], tone = 'neutral' }) {
  const match = Array.isArray(config)
    ? config.find((item) => item.key === status || item.label === status)
    : null;

  const resolvedTone = match?.tone || tone;
  const label = match?.label || status || 'Status';
  const variant = toneMap[resolvedTone] || 'default';

  return <Badge variant={variant} size="sm">{label}</Badge>;
}

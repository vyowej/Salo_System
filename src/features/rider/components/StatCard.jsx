import { Card, CardBody } from '../../../components/common/Card';

export default function StatCard({ label, value, helper, icon, tone = 'neutral' }) {
  const toneClass = ['orange', 'gold', 'green', 'brown'].includes(tone) ? ` card--tint-${tone}` : '';
  return (
    <Card className={`rider-stat-card card--stat${toneClass}`}>
      <CardBody className="rider-stat-card-body">
        <div className="rider-stat-card-header">
          {icon && <span className="rider-stat-card-icon" aria-hidden="true">{icon}</span>}
          <span className="rider-stat-card-label">{label}</span>
        </div>
        <strong className="rider-stat-card-value">{value}</strong>
        {helper && <span className="rider-stat-card-helper">{helper}</span>}
      </CardBody>
    </Card>
  );
}

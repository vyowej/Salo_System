import { Card, CardBody } from '../../../components/common/Card';
import './StatCard.css';

export default function StatCard({ label, value, helper, icon, tone = 'neutral', isText }) {
  const toneClass = ['orange', 'gold', 'green', 'brown'].includes(tone) ? ` card--tint-${tone}` : '';
  const stringVal = String(value ?? '');
  const isTextValue = isText !== undefined ? isText : (
    /[a-zA-Z]/.test(stringVal) && !/^[₱$€£]?\s*[\d,.]+%?$/.test(stringVal.trim())
  );

  return (
    <Card className={`rider-stat-card card--stat${toneClass}`}>
      <CardBody className="rider-stat-card-body">
        <div className="rider-stat-card-header">
          {icon && <span className="rider-stat-card-icon" aria-hidden="true">{icon}</span>}
          <span className="rider-stat-card-label">{label}</span>
        </div>
        <strong
          className={`rider-stat-card-value${isTextValue ? ' rider-stat-card-value--text' : ''}`}
          title={isTextValue ? stringVal : undefined}
        >
          {value}
        </strong>
        {helper && <span className="rider-stat-card-helper">{helper}</span>}
      </CardBody>
    </Card>
  );
}

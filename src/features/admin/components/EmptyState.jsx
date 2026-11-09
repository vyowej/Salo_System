import Button from '../../../components/common/Button';
import './AdminComponents.css';

export default function EmptyState({ title, description, actionLabel, onAction }) {
  return (
    <div className="admin-empty-state">
      <h2>{title || 'No records to display'}</h2>
      <p>{description || 'There are no records available for the current view.'}</p>
      {actionLabel && onAction && <Button variant="outline" onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}

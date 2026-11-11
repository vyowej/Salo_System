import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import './StateView.css';

export default function StateView({ state = 'ready', emptyTitle = 'Nothing to show yet', emptyMessage = 'This preview has no data to display.', onRetry, children }) {
  if (state === 'loading') {
    return (
      <Card className="rider-state-view">
        <CardBody className="rider-state-view-body loading">
          <span className="rider-skeleton-line short" />
          <span className="rider-skeleton-line" />
          <span className="rider-skeleton-line" />
          <span className="rider-skeleton-line medium" />
        </CardBody>
      </Card>
    );
  }

  if (state === 'empty') {
    return (
      <div className="rider-state-view empty" role="status">
        <span className="rider-state-view-icon" aria-hidden="true">🛵</span>
        <h3>{emptyTitle}</h3>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="rider-state-view error" role="alert">
        <span className="rider-state-view-icon" aria-hidden="true">!</span>
        <h3>Preview could not be loaded</h3>
        <p>We could not load this rider screen preview.</p>
        {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>}
      </div>
    );
  }

  return <>{children}</>;
}

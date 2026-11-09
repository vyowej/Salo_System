import Button from '../../../components/common/Button';
import EmptyState from './EmptyState';
import './AdminComponents.css';

export default function StateView({ state = 'success', title, description, retry, children }) {
  if (state === 'loading') {
    return (
      <div className="admin-state-view" role="status" aria-live="polite">
        <span className="admin-state-view__spinner" aria-hidden="true" />
        <p>Loading {title || 'admin data'}…</p>
        {retry && <Button variant="outline" onClick={retry}>Retry</Button>}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="admin-state-view" role="alert">
        <h2>Unable to load {title || 'this section'}</h2>
        <p>{description || 'The demo data could not be loaded. Please retry.'}</p>
        {retry && <Button variant="outline" onClick={retry}>Retry</Button>}
      </div>
    );
  }
  if (state === 'empty') {
    return <EmptyState title={title ? `No ${title} records` : undefined} description={description} actionLabel={retry ? 'Reload' : undefined} onAction={retry} />;
  }
  return children ?? null;
}

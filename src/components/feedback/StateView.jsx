import { EmptyState, ErrorState, LoadingSpinner } from './Feedback';

export default function StateView({
  state = 'empty',
  title,
  description,
  icon,
  action,
  onRetry,
  className = '',
}) {
  if (state === 'loading') {
    return (
      <div className={`empty-state ${className}`.trim()} role="status" aria-live="polite">
        <LoadingSpinner size="md" />
        <p className="empty-state-description">{title || 'Loading...'}</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <ErrorState
        title={title}
        message={description}
        onRetry={onRetry}
        className={className}
      />
    );
  }

  return (
    <EmptyState
      icon={icon}
      title={title || 'Nothing here yet'}
      description={description}
      action={action}
      className={className}
    />
  );
}

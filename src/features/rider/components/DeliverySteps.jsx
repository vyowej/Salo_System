import './DeliveryFlow.css';

export default function DeliverySteps({
  steps = [],
  currentKey = '',
  compact = false,
  className = '',
}) {
  const activeIndex = steps.findIndex((item) => item.key === currentKey || item.label === currentKey);
  const flowClassName = compact ? 'delivery-flow delivery-flow-compact' : 'delivery-flow';

  return (
    <ol className={`${flowClassName} ${className}`.trim()} aria-label="Delivery steps">
      {steps.map((step, index) => {
        const key = step.key || step.label;
        const isCurrent = key === currentKey || step.label === currentKey;
        const isComplete = activeIndex >= 0 && index < activeIndex;
        const isLocked = activeIndex >= 0 && index > activeIndex;

        return (
          <li
            key={key}
            className={[
              'delivery-flow-step',
              isCurrent ? 'is-current' : '',
              isComplete ? 'is-complete' : '',
              isLocked ? 'is-locked' : '',
            ].filter(Boolean).join(' ') }
          >
            <span className="delivery-flow-step-marker" aria-hidden="true">
              {isComplete ? '✓' : ''}
            </span>
            <div className="delivery-flow-step-body">
              <span className="delivery-flow-step-label">{step.label}</span>
              <small>{isLocked ? 'Locked until the previous step is complete.' : step.description || 'Current step in progress.'}</small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

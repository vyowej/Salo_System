import './StepTracker.css';

export default function StepTracker({ steps = [], currentKey = '' }) {
  const activeIndex = steps.findIndex((item) => item.key === currentKey || item.label === currentKey);

  return (
    <div className="rider-step-tracker" aria-label="Delivery steps">
      {steps.map((step, index) => {
        const key = step.key || step.label;
        const isActive = key === currentKey;
        const isComplete = index < activeIndex;
        const isLocked = activeIndex >= 0 && index > activeIndex;
        const statusClass = isActive ? 'is-active' : isComplete ? 'is-complete' : isLocked ? 'is-locked' : '';

        return (
          <div key={key} className={`rider-step-item ${statusClass}`}>
            <span className="rider-step-indicator" aria-hidden="true">{isComplete ? '✓' : index + 1}</span>
            <div>
              <strong>{step.label}</strong>
              <small>{isLocked ? 'Locked until the previous step is complete.' : step.description}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

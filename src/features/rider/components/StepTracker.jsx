export default function StepTracker({ steps = [], currentKey = '' }) {
  return (
    <div className="rider-step-tracker" aria-label="Delivery steps">
      {steps.map((step, index) => {
        const key = step.key || step.label;
        const isActive = key === currentKey;
        const isComplete = index < steps.findIndex((item) => item.key === currentKey || item.label === currentKey);
        const statusClass = isActive ? 'is-active' : isComplete ? 'is-complete' : '';

        return (
          <div key={key} className={`rider-step-item ${statusClass}`}>
            <span className="rider-step-indicator" aria-hidden="true">{index + 1}</span>
            <div>
              <strong>{step.label}</strong>
              {step.description && <small>{step.description}</small>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { RIDER_APPLICATION_STEPS } from '../constants/riderApplicationDefaults';
import './RiderApplicationProgress.css';

export default function RiderApplicationProgress({
  currentStep,
  completedSteps = [],
  onStepClick,
}) {
  const currentStepData =
    RIDER_APPLICATION_STEPS.find((s) => s.step === currentStep) ||
    RIDER_APPLICATION_STEPS[0];
  const progressPercent = Math.round(
    ((currentStep - 1) / (RIDER_APPLICATION_STEPS.length - 1)) * 100
  );

  return (
    <div className="rider-progress-section" aria-label="Rider Application Progress">
      {/* Mobile / Tablet compact bar */}
      <div className="rider-progress-compact">
        <div className="rider-compact-header">
          <span className="rider-compact-step-num">
            Step {currentStep} of {RIDER_APPLICATION_STEPS.length}
          </span>
          <span className="rider-compact-step-name">{currentStepData.label}</span>
        </div>
        <div
          className="rider-compact-bar"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div className="rider-compact-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {/* Desktop horizontal stepper */}
      <ol className="rider-stepper-list">
        {RIDER_APPLICATION_STEPS.map((item) => {
          const isCurrent = item.step === currentStep;
          const isCompleted = completedSteps.includes(item.step) || item.step < currentStep;
          const isClickable = isCompleted || item.step === currentStep;

          let stepClass = 'rider-step-node';
          if (isCurrent) stepClass += ' current';
          if (isCompleted) stepClass += ' completed';
          if (isClickable) stepClass += ' clickable';

          return (
            <li key={item.id} className={stepClass}>
              <button
                type="button"
                className="rider-step-trigger"
                onClick={() => isClickable && onStepClick?.(item.step)}
                disabled={!isClickable}
                aria-current={isCurrent ? 'step' : undefined}
                title={`Go to Step ${item.step}: ${item.label}`}
              >
                <span className="rider-step-bubble">
                  {isCompleted ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    item.step
                  )}
                </span>
                <span className="rider-step-text">
                  <span className="rider-step-title">{item.shortLabel || item.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

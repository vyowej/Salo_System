import { WIZARD_STEPS } from '../constants/applicationDefaults';
import './ApplicationProgress.css';

export default function ApplicationProgress({
  currentStep,
  completedSteps = [],
  onStepClick,
}) {
  const currentStepData = WIZARD_STEPS.find((s) => s.step === currentStep) || WIZARD_STEPS[0];
  const progressPercent = Math.round(((currentStep - 1) / (WIZARD_STEPS.length - 1)) * 100);

  return (
    <div className="wizard-progress-section" aria-label="Application Progress">
      {/* Mobile / Tablet compact bar */}
      <div className="wizard-progress-compact">
        <div className="wizard-compact-header">
          <span className="wizard-compact-step-num">Step {currentStep} of {WIZARD_STEPS.length}</span>
          <span className="wizard-compact-step-name">{currentStepData.label}</span>
        </div>
        <div className="wizard-compact-bar" role="progressbar" aria-valuenow={progressPercent} aria-valuemin="0" aria-valuemax="100">
          <div className="wizard-compact-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {/* Desktop horizontal stepper */}
      <ol className="wizard-stepper-list">
        {WIZARD_STEPS.map((item) => {
          const isCurrent = item.step === currentStep;
          const isCompleted = completedSteps.includes(item.step) || item.step < currentStep;
          const isClickable = isCompleted || item.step === currentStep;

          let stepClass = 'wizard-step-node';
          if (isCurrent) stepClass += ' current';
          if (isCompleted) stepClass += ' completed';
          if (isClickable) stepClass += ' clickable';

          return (
            <li key={item.id} className={stepClass}>
              <button
                type="button"
                className="wizard-step-trigger"
                onClick={() => isClickable && onStepClick?.(item.step)}
                disabled={!isClickable}
                aria-current={isCurrent ? 'step' : undefined}
                title={`Go to Step ${item.step}: ${item.label}`}
              >
                <span className="wizard-step-bubble">
                  {isCompleted ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    item.step
                  )}
                </span>
                <span className="wizard-step-text">
                  <span className="wizard-step-title">{item.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

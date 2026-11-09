import './StepperHeader.css';

export default function StepperHeader({ steps, activeStep }) {
  return (
    <div className="rider-form-steps" aria-label="Application steps">
      {steps.map((label, index) => (
        <span
          key={label}
          className={index === activeStep ? 'active' : index < activeStep ? 'complete' : ''}
          aria-current={index === activeStep ? 'step' : undefined}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

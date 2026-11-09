import './ReviewStep.css';

export default function ReviewStep({ fields, form, vehicleType, termsAccepted, onTermsChange }) {
  return (
    <div className="rider-review-panel">
      <h3>Review your application</h3>
      <dl>
        {fields.map((field) => (
          <div key={field.key} className="rider-review-row">
            <dt>{field.label}</dt>
            <dd>{form[field.key] || 'Not provided in this preview'}</dd>
          </div>
        ))}
        <div className="rider-review-row">
          <dt>Vehicle type</dt>
          <dd>{vehicleType}</dd>
        </div>
      </dl>
      <label className="rider-checkbox-row">
        <input type="checkbox" checked={termsAccepted} onChange={(event) => onTermsChange(event.target.checked)} />
        <span>I confirm that the information above is accurate.</span>
      </label>
    </div>
  );
}

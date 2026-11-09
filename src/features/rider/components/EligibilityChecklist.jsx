export default function EligibilityChecklist({ conditions = [] }) {
  return (
    <div className="rider-eligibility-checklist">
      {conditions.map((condition) => (
        <div key={condition.key} className={`rider-eligibility-item ${condition.met ? 'is-met' : 'is-unmet'}`}>
          <span className="rider-eligibility-icon" aria-hidden="true">{condition.met ? '✓' : '○'}</span>
          <div>
            <strong>{condition.label}</strong>
            {!condition.met && <small>{condition.reason}</small>}
          </div>
        </div>
      ))}
    </div>
  );
}

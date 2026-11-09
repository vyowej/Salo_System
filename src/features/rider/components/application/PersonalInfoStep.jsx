import './PersonalInfoStep.css';

export default function PersonalInfoStep({ fields, form, onChange }) {
  return (
    <div className="rider-form-grid rider-personal-info-step">
      {fields.map((field) => (
        <label key={field.key} className="rider-field">
          <span>{field.label}</span>
          <input
            type={field.type}
            placeholder={field.placeholder}
            value={form[field.key]}
            onChange={(event) => onChange(field.key, event.target.value)}
          />
        </label>
      ))}
    </div>
  );
}

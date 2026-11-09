export default function FilterBar({ filters = [], values = {}, onChange }) {
  return (
    <div className="rider-filter-bar">
      {filters.map((filter) => (
        <label key={filter.key} className="rider-filter-field">
          <span>{filter.label}</span>
          <select
            value={values[filter.key] ?? filter.defaultValue ?? ''}
            onChange={(event) => onChange(filter.key, event.target.value)}
          >
            {(filter.options || []).map((option) => (
              <option key={String(option.value ?? option)} value={option.value ?? option}>
                {option.label ?? option}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

import './AdminComponents.css';

export default function Tabs({ items, value, onChange, label = 'Section tabs' }) {
  return (
    <div className="admin-tabs" role="tablist" aria-label={label}>
      {items.map((item) => {
        const key = typeof item === 'string' ? item : item.value;
        const text = typeof item === 'string' ? item : item.label;
        return (
          <button key={key} className="admin-tab" type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)}>
            {text}
          </button>
        );
      })}
    </div>
  );
}

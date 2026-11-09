import './AdminComponents.css';

export default function StatCard({ label, value, hint }) {
  return (
    <article className="admin-stat-card">
      <span className="admin-stat-card__label">{label}</span>
      <p className="admin-stat-card__value">{value}</p>
      {hint && <span className="admin-stat-card__hint">{hint}</span>}
    </article>
  );
}

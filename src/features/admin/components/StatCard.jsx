import { Link } from 'react-router-dom';
import './AdminComponents.css';

export default function StatCard({ label, value, hint, to, status = false, warning = false, danger = false }) {
  const accentClass = danger
    ? ' admin-stat-card--danger'
    : (warning || status ? ' admin-stat-card--warning' : '');

  const content = (
    <>
      <span className="admin-stat-card__label">{label}</span>
      <p className="admin-stat-card__value">{value}</p>
      {hint && <span className="admin-stat-card__hint">{hint}</span>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={`admin-stat-card admin-stat-card--link${accentClass}`}>
        {content}
      </Link>
    );
  }

  return (
    <article className={`admin-stat-card${accentClass}`}>
      {content}
    </article>
  );
}

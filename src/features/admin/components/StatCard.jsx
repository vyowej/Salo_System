import './AdminComponents.css';

export default function StatCard({ label, value, hint, tone = 'neutral', status = false, danger = false }) {
  const toneClass = ['orange', 'gold', 'green', 'brown'].includes(tone) ? ` card--tint-${tone}` : '';
  return (
    <article className={`card admin-stat-card card--stat${toneClass}${status ? ' card--status' : ''}${danger ? ' admin-stat-card--danger' : ''}`}>
      <span className="admin-stat-card__label">{label}</span>
      <p className="admin-stat-card__value">{value}</p>
      {hint && <span className="admin-stat-card__hint">{hint}</span>}
    </article>
  );
}

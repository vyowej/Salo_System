import { Link } from 'react-router-dom';

export default function OwnerDashboardStatCard({ label, value, sub, tone, icon, iconState, trend, to }) {
  const Wrapper = to ? Link : 'div';
  const targetName =
    to === '/owner/reports'
      ? 'Reports'
      : to === '/owner/orders'
        ? 'Orders'
        : to === '/owner/reservations'
          ? 'Reservations'
          : 'Inventory';

  return (
    <Wrapper
      {...(to ? { to } : {})}
      aria-label={to ? `${label}: ${value}. Open ${targetName}` : undefined}
      className={`brand-card brand-card--${tone} brand-card--stat${to ? ' brand-card--interactive' : ''}`}
    >
      <div className="brand-card__heading">
        <span className="brand-card__label">{label}</span>
        {icon && (
          <span className={`brand-card__icon-chip${iconState ? ` brand-card__icon-chip--${iconState}` : ''}`} aria-hidden="true">
            {icon}
          </span>
        )}
      </div>

      <div className="brand-card__value-row">
        <span className="brand-card__value">{value}</span>
        {trend && <span className="brand-card__trend">↑ {trend}</span>}
      </div>

      {sub && <p className="brand-card__helper">{sub}</p>}
    </Wrapper>
  );
}

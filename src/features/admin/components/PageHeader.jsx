import './AdminComponents.css';

export default function PageHeader({ actions }) {
  if (!actions) return null;

  return (
    <div className="admin-page-header admin-page-header--actions-only">
      <div className="admin-page-header__actions">{actions}</div>
    </div>
  );
}

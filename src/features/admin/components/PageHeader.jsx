import './AdminComponents.css';

export default function PageHeader({ title, description, eyebrow, actions }) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-header__copy">
        {eyebrow && <span className="admin-page-header__eyebrow">{eyebrow}</span>}
        <h1 className="page-title admin-page-header__title">{title}</h1>
        {description && <p className="admin-page-header__description">{description}</p>}
      </div>
      {actions && <div className="admin-page-header__actions">{actions}</div>}
    </header>
  );
}

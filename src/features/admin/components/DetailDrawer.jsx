import { useEffect } from 'react';
import './AdminComponents.css';

export default function DetailDrawer({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="admin-detail-drawer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="admin-detail-drawer__panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="admin-detail-drawer__header">
          <h2>{title}</h2>
          <button className="admin-icon-button" type="button" aria-label="Close details" onClick={onClose}>×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

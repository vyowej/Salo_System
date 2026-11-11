import { useEffect, useRef } from 'react';
import Badge from '../../../../components/common/Badge';
import { PREVIEW_STATES } from './r7PreviewUtils';
import './r7Preview.css';

export function DesignPreviewBanner({ state, onStateChange }) {
  return (
    <div className="r7-preview-banner">
      <div>
        <span className="r7-preview-mark" aria-hidden="true">✦</span>
        <span><strong>Design preview - sample data</strong><small>Presentation only · nothing is saved or sent</small></span>
      </div>
      {import.meta.env.DEV && <label className="r7-state-picker"><span>Preview state</span><select value={state} onChange={(event) => onStateChange(event.target.value)} aria-label="Choose design preview state">{PREVIEW_STATES.map((item) => <option key={item}>{item}</option>)}</select></label>}
    </div>
  );
}

export function PreviewPageHeader({ action }) {
  if (!action) return null;
  return <div className="r7-page-header-actions">{action}</div>;
}

export function PreviewStatePanel({ state, name = 'records', onRetry }) {
  if (state === 'Sample data') return null;
  if (state === 'Loading') return <section className="r7-state-panel" aria-label="Loading preview">{[1, 2, 3].map((item) => <div className="r7-skeleton-row" key={item}><i /><span><b /><b /></span><i /></div>)}</section>;
  if (state === 'Empty') return <section className="r7-state-panel r7-empty-state"><span aria-hidden="true">✦</span><h2>No {name} yet</h2><p>When there’s something to show, it will appear here.</p></section>;
  return <section className="r7-state-panel r7-error-state" role="alert"><span aria-hidden="true">!</span><h2>This preview couldn’t load</h2><p>This sample error state demonstrates how a retry message will appear.</p><button type="button" className="r7-secondary-button" onClick={onRetry}>Try again</button></section>;
}

export function PreviewDialog({ open, onClose, title, children, drawer = false }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    const focusable = () => [...panel.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
    (focusable()[0] || panel).focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...panelRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
    if (!items.length) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === items[0]) {
      event.preventDefault();
      items.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
      event.preventDefault();
      items[0].focus();
    }
  };
  return <div className={`r7-overlay ${drawer ? 'r7-overlay-drawer' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={panelRef} className={`r7-dialog ${drawer ? 'r7-drawer' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={handleKeyDown}>
    <header className="r7-dialog-header"><div><p className="r7-eyebrow">SALO · DESIGN PREVIEW</p><h2>{title}</h2></div><button type="button" className="r7-dialog-close" onClick={onClose} aria-label={`Close ${title}`}>×</button></header>
    <div className="r7-dialog-body">{children}</div>
  </section></div>;
}

export function StatusBadge({ status }) {
  const variants = { Active: 'success', Scheduled: 'info', Expired: 'default', Inactive: 'default', Pending: 'warning', Completed: 'success', Cancelled: 'error', Rejected: 'error', Owner: 'warning', 'Co-owner': 'info', Staff: 'default' };
  return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
}

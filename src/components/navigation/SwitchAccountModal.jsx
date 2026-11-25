import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { resolveUserWorkspaces } from '../../config/workspaceConfig';
import { SWITCH_ACCOUNT_COPY } from '../../config/navigationConfig';
import './SwitchAccountModal.css';

export default function SwitchAccountModal({
  open,
  onClose,
  currentRole = null,
  onUseDifferentAccount,
}) {
  const navigate = useNavigate();
  const { user, roles, activeWorkspace, setActiveWorkspace, logout } = useAuth();
  const closeBtnRef = useRef(null);

  const workspaces = resolveUserWorkspaces(currentRole || activeWorkspace, roles.length ? roles : user?.roles);

  useEffect(() => {
    if (!open) return undefined;

    closeBtnRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSelectWorkspace = (workspace) => {
    if (workspace.isCurrent) return;
    setActiveWorkspace?.(workspace.authRole);
    onClose();
    navigate(workspace.homeHref);
  };

  const handleDifferentAccount = async () => {
    onClose();
    if (onUseDifferentAccount) {
      await onUseDifferentAccount();
      return;
    }
    await logout();
    navigate('/login', { replace: true, state: null });
  };

  return createPortal(
    <div
      className="switch-account-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="switch-account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="switch-account-title"
      >
        <div className="switch-account-header">
          <div>
            <h2 id="switch-account-title" className="switch-account-title">
              {SWITCH_ACCOUNT_COPY.title}
            </h2>
            <p className="switch-account-subtitle">{SWITCH_ACCOUNT_COPY.subtitle}</p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="switch-account-close"
            onClick={onClose}
            aria-label="Close Switch Account dialog"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="switch-account-body">
          <section className="switch-account-section" aria-label={SWITCH_ACCOUNT_COPY.workspacesHeading}>
            <h3 className="switch-account-section-label">{SWITCH_ACCOUNT_COPY.workspacesHeading}</h3>
            <div className="switch-account-list">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  className={`switch-account-item ${workspace.isCurrent ? 'is-current' : ''}`}
                  disabled={workspace.isCurrent}
                  onClick={() => handleSelectWorkspace(workspace)}
                >
                  <span className="switch-account-item-main">
                    <span className="switch-account-item-title">{workspace.label}</span>
                    <span className="switch-account-item-desc">{workspace.description}</span>
                  </span>
                  {workspace.isCurrent ? (
                    <span className="switch-account-current-pill">{SWITCH_ACCOUNT_COPY.currentBadge}</span>
                  ) : (
                    <span className="switch-account-arrow" aria-hidden="true">→</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          <section className="switch-account-section" aria-label={SWITCH_ACCOUNT_COPY.otherHeading}>
            <h3 className="switch-account-section-label">{SWITCH_ACCOUNT_COPY.otherHeading}</h3>
            <button
              type="button"
              className="switch-account-item"
              onClick={handleDifferentAccount}
            >
              <span className="switch-account-item-main">
                <span className="switch-account-item-title">{SWITCH_ACCOUNT_COPY.useDifferentLabel}</span>
                <span className="switch-account-item-desc">{SWITCH_ACCOUNT_COPY.useDifferentHint}</span>
              </span>
              <span className="switch-account-arrow" aria-hidden="true">→</span>
            </button>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}

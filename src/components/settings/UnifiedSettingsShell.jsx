import { useMemo, useState } from 'react';
import Button from '../common/Button';
import StateView from '../feedback/StateView';
import { SETTINGS_LABELS } from '../../config/settingsConfig';
import './UnifiedSettingsShell.css';

function groupSections(sections) {
  const groups = [];
  const map = new Map();
  for (const section of sections) {
    const groupName = section.group || 'General';
    if (!map.has(groupName)) {
      const entry = { label: groupName, items: [] };
      map.set(groupName, entry);
      groups.push(entry);
    }
    map.get(groupName).items.push(section);
  }
  return groups;
}

export default function UnifiedSettingsShell({
  eyebrow = 'Settings',
  title = 'Settings',
  subtitle = 'Manage your account, notifications, security, and workspace preferences.',
  sections = [],
  activeSection: controlledSection,
  onSectionChange,
  state = 'ready',
  onRetry,
  dirty = false,
  onSave,
  onDiscard,
  saveLabel = SETTINGS_LABELS.saveButton,
  discardLabel = SETTINGS_LABELS.discardButton,
  notice = '',
  headerActions = null,
  renderSection,
}) {
  const [internalSection, setInternalSection] = useState(sections[0]?.id || 'account');
  const [mobileScreen, setMobileScreen] = useState('list');

  const currentSectionId = controlledSection || internalSection;
  const activeMeta = sections.find((item) => item.id === currentSectionId) || sections[0];
  const groups = useMemo(() => groupSections(sections), [sections]);

  const handleSelectSection = (sectionId) => {
    if (onSectionChange) {
      onSectionChange(sectionId);
    } else {
      setInternalSection(sectionId);
    }
    setMobileScreen('detail');
  };

  return (
    <div className="salo-settings-page">
      <div className="salo-settings-page-head">
        <div>
          <p className="salo-settings-page-eyebrow">{eyebrow}</p>
          <h1 className="salo-settings-page-title">{title}</h1>
          {subtitle && <p className="salo-settings-page-subtitle">{subtitle}</p>}
        </div>
        {headerActions}
      </div>

      {notice && (
        <p className="salo-settings-notice" role="status">
          {notice}
        </p>
      )}

      {state !== 'ready' && state !== 'success' && state !== 'default' ? (
        <StateView
          state={state}
          title="Settings"
          emptyTitle="Settings unavailable"
          emptyDescription="No settings are available for this account right now."
          onRetry={onRetry}
        />
      ) : (
        <div className={`salo-settings-layout ${mobileScreen === 'list' ? 'is-mobile-list' : 'is-mobile-detail'}`}>
          {/* Desktop left sub-navigation */}
          <nav className="salo-settings-nav" aria-label="Settings sections">
            {groups.map((group) => (
              <div key={group.label} className="salo-settings-nav-group">
                <p className="salo-settings-nav-group-label">{group.label}</p>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`salo-settings-nav-item ${activeMeta?.id === item.id ? 'is-selected' : ''}`}
                    aria-current={activeMeta?.id === item.id ? 'page' : undefined}
                    onClick={() => handleSelectSection(item.id)}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* Mobile section list */}
          <div className="salo-settings-mobile-list" aria-label="Settings sections">
            {groups.map((group) => (
              <div key={group.label} className="salo-settings-mobile-group">
                <p className="salo-settings-nav-group-label">{group.label}</p>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="salo-settings-mobile-card"
                    onClick={() => handleSelectSection(item.id)}
                  >
                    <span className="salo-settings-mobile-card-copy">
                      <strong>{item.label}</strong>
                      {item.description && <small>{item.description}</small>}
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Content area */}
          <div className="salo-settings-content">
            <button
              type="button"
              className="salo-settings-mobile-back"
              onClick={() => setMobileScreen('list')}
            >
              <span aria-hidden="true">←</span>
              <span>{SETTINGS_LABELS.backToSections}</span>
            </button>

            {activeMeta && (
              <div className="salo-settings-section-head">
                <p className="salo-settings-section-eyebrow">{activeMeta.eyebrow || activeMeta.group}</p>
                <h2 className="salo-settings-section-title">{activeMeta.title || activeMeta.label}</h2>
                {activeMeta.description && (
                  <p className="salo-settings-section-desc">{activeMeta.description}</p>
                )}
              </div>
            )}

            {activeMeta && renderSection?.(activeMeta.id)}

            {dirty && (
              <div className="salo-settings-save-bar" role="status">
                <div className="salo-settings-save-copy">
                  <strong>{SETTINGS_LABELS.unsavedTitle}</strong>
                  <small>{SETTINGS_LABELS.unsavedHint}</small>
                </div>
                <div className="salo-settings-save-actions">
                  <Button type="button" variant="outline" onClick={onDiscard}>
                    {discardLabel}
                  </Button>
                  <Button type="button" variant="primary" onClick={onSave}>
                    {saveLabel}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

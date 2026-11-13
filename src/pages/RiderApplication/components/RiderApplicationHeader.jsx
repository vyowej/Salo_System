import BrandMark from '../../../components/common/BrandMark';
import Button from '../../../components/common/Button';
import './RiderApplicationHeader.css';

export default function RiderApplicationHeader({
  currentStep,
  totalSteps,
  onSaveDraft,
  onExit,
  isDraftSaved,
  savingDraft,
  lastSavedTime = null,
  saveError = null,
}) {
  const formatTime = (isoString) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formattedSavedTime = formatTime(lastSavedTime);

  return (
    <header className="rider-wizard-header" role="banner">
      <div className="rider-wizard-header-container">
        {/* Left: Brand + Application Identifier */}
        <div className="rider-wizard-header-brand">
          <BrandMark size="sm" />
          <span className="rider-wizard-brand-divider" aria-hidden="true" />
          <div className="rider-wizard-context">
            <span className="rider-wizard-app-badge">Courier Onboarding</span>
            <span className="rider-wizard-app-title">Rider Application</span>
          </div>
        </div>

        {/* Right: Step Counter + Actions */}
        <div className="rider-wizard-header-actions">
          {/* Polished Step Pill */}
          <div className="rider-wizard-step-pill" aria-live="polite">
            <span className="step-pill-label">Step</span>
            <span className="step-pill-numbers">
              <strong>{currentStep}</strong>
              <span className="step-pill-separator">/</span>
              <span>{totalSteps}</span>
            </span>
          </div>

          <div className="rider-wizard-buttons-group">
            {lastSavedTime && !savingDraft && (
              <span className="rider-last-saved-indicator" title={`Last saved: ${new Date(lastSavedTime).toLocaleString()}`}>
                Saved {formattedSavedTime}
              </span>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSaveDraft}
              loading={savingDraft}
              disabled={savingDraft}
              title="Save current application progress to draft"
              className={`rider-wizard-save-btn ${isDraftSaved ? 'btn-draft-saved' : ''} ${saveError ? 'btn-save-error' : ''}`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              <span>
                {savingDraft
                  ? 'Saving...'
                  : isDraftSaved
                  ? 'Draft Saved ✓'
                  : 'Save Progress'}
              </span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onExit}
              className="rider-wizard-exit-btn"
              title="Exit application"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              <span>Exit</span>
            </Button>
          </div>
        </div>
      </div>
      {saveError && (
        <div className="rider-header-error-banner" role="alert">
          <span>⚠️ {saveError}</span>
        </div>
      )}
    </header>
  );
}

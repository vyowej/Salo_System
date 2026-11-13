import BrandMark from '../../../components/common/BrandMark';
import Button from '../../../components/common/Button';
import './ApplicationHeader.css';

export default function ApplicationHeader({
  currentStep,
  totalSteps,
  onSaveDraft,
  onExit,
  isDraftSaved,
  savingDraft,
  lastSavedTime = null,
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
    <header className="app-wizard-header" role="banner">
      <div className="app-wizard-header-container">
        {/* Left: Brand + Application Identifier */}
        <div className="app-wizard-header-brand">
          <BrandMark size="sm" />
          <span className="app-wizard-brand-divider" aria-hidden="true" />
          <div className="app-wizard-context">
            <span className="app-wizard-app-badge">Partner Onboarding</span>
            <span className="app-wizard-app-title">Restaurant Application</span>
          </div>
        </div>

        {/* Right: Step Counter + Actions */}
        <div className="app-wizard-header-actions">
          {/* Polished Step Pill */}
          <div className="app-wizard-step-pill" aria-live="polite">
            <span className="step-pill-label">Step</span>
            <span className="step-pill-numbers">
              <strong>{currentStep}</strong>
              <span className="step-pill-separator">/</span>
              <span>{totalSteps}</span>
            </span>
          </div>

          <div className="app-wizard-buttons-group">
            {formattedSavedTime && !savingDraft && (
              <span className="app-wizard-saved-time" title={`Draft saved at ${formattedSavedTime}`}>
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
              className={`app-wizard-save-btn ${isDraftSaved ? 'btn-draft-saved' : ''}`}
              title="Save current application progress to draft"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              <span>{isDraftSaved ? 'Draft Saved ✓' : savingDraft ? 'Saving...' : 'Save Progress'}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onExit}
              className="app-wizard-exit-btn"
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
    </header>
  );
}

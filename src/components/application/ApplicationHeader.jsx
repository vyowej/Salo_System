import BrandMark from '../common/BrandMark';
import Button from '../common/Button';
import './ApplicationHeader.css';

function formatSavedTime(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * Shared Top Header Bar for Restaurant Partner and Rider Partner Applications.
 */
export default function ApplicationHeader({
  title = 'Restaurant Application',
  badge = 'Partner Onboarding',
  currentStep = 1,
  totalSteps = 8,
  currentStepLabel = '',
  onSaveDraft,
  onExit,
  isDraftSaved = false,
  savingDraft = false,
  lastSavedTime = null,
  saveError = null,
}) {
  const formattedSavedTime = formatSavedTime(lastSavedTime);
  const progressPercent =
    totalSteps > 1 ? Math.round(((currentStep - 1) / (totalSteps - 1)) * 100) : 0;

  return (
    <header className="salo-app-header" role="banner">
      <div className="salo-app-header-container">
        {/* Left: Brand + Application Context */}
        <div className="salo-app-header-brand">
          <BrandMark size="sm" />
          <span className="salo-app-brand-divider" aria-hidden="true" />
          <div className="salo-app-context">
            <span className="salo-app-badge">{badge}</span>
            <h1 className="salo-app-title">{title}</h1>
          </div>
        </div>

        {/* Right: Step Pill + Actions */}
        <div className="salo-app-header-actions">
          <div className="salo-app-step-pill" aria-live="polite">
            <span className="salo-step-pill-label">Step</span>
            <span className="salo-step-pill-numbers">
              <strong>{currentStep}</strong>
              <span className="salo-step-pill-sep">/</span>
              <span>{totalSteps}</span>
            </span>
            {currentStepLabel && (
              <span className="salo-step-pill-name">· {currentStepLabel}</span>
            )}
          </div>

          <div className="salo-app-buttons-group">
            {formattedSavedTime && !savingDraft && (
              <span
                className="salo-app-saved-time"
                title={`Last saved at ${formattedSavedTime}`}
              >
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
              className={`salo-app-save-btn ${isDraftSaved ? 'is-saved' : ''} ${saveError ? 'is-error' : ''}`}
              title="Save current application progress to draft"
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
              className="salo-app-exit-btn"
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

      {/* Subtle Integrated Progress Bar */}
      <div className="salo-app-header-progress-track" aria-hidden="true">
        <div
          className="salo-app-header-progress-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {saveError && (
        <div className="salo-app-header-error-banner" role="alert">
          <span>⚠️ {saveError}</span>
        </div>
      )}
    </header>
  );
}

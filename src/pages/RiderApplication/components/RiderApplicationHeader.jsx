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
}) {
  return (
    <header className="rider-wizard-header" role="banner">
      <div className="rider-wizard-header-container">
        <div className="rider-wizard-header-brand">
          <BrandMark size="sm" />
        </div>

        <div className="rider-wizard-header-actions">
          <div className="rider-wizard-step-counter" aria-live="polite">
            <span className="counter-label">Step</span>
            <span className="counter-numbers">
              <strong>{currentStep}</strong> / {totalSteps}
            </span>
          </div>

          <div className="rider-wizard-buttons-group">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSaveDraft}
              loading={savingDraft}
              title="Save current application progress"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              <span>{isDraftSaved ? 'Draft Saved ✓' : 'Save Progress'}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onExit}
              className="rider-wizard-exit-btn"
              title="Exit application"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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

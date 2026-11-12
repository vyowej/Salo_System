import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import './ExitConfirmModal.css';

export default function ExitConfirmModal({
  isOpen,
  onClose,
  onSaveAndExit,
  onExitWithoutSaving,
  isSaving = false,
}) {
  return (
    <Modal
      open={isOpen}
      isOpen={isOpen}
      onClose={onClose}
      title="Exit Rider Application?"
      size="sm"
    >
      <div className="rider-exit-modal-body">
        <div className="rider-exit-icon-wrap" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <div className="rider-exit-text">
          <h4 className="rider-exit-heading">You have unsaved changes</h4>
          <p className="rider-exit-subtext">
            Would you like to save your draft before leaving? You can resume your application from where you left off at any time.
          </p>
        </div>

        <div className="rider-exit-options-stack">
          <Button
            type="button"
            variant="primary"
            fullWidth
            onClick={onSaveAndExit}
            loading={isSaving}
            disabled={isSaving}
          >
            Save draft and exit
          </Button>

          <Button
            type="button"
            variant="danger-outline"
            fullWidth
            onClick={onExitWithoutSaving}
            disabled={isSaving}
          >
            Exit without saving
          </Button>

          <Button
            type="button"
            variant="ghost"
            fullWidth
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

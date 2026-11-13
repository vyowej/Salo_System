import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import './ExitConfirmModal.css';

export default function ExitConfirmModal({
  isOpen,
  open,
  onClose,
  onSaveAndExit,
  onExitWithoutSaving,
  isSaving = false,
}) {
  const showModal = Boolean(open ?? isOpen);

  return (
    <Modal
      open={showModal}
      isOpen={showModal}
      onClose={onClose}
      title="Exit Partner Application?"
      size="sm"
    >
      <div className="wizard-exit-modal-body">
        <div className="wizard-exit-icon-wrap" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <div className="wizard-exit-text">
          <h4 className="wizard-exit-heading">You have an application in progress</h4>
          <p className="wizard-exit-subtext">
            Would you like to save your draft before leaving? You can resume your restaurant application anytime from where you left off.
          </p>
        </div>

        <div className="wizard-exit-options-stack">
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

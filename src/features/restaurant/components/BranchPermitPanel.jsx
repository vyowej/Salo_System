import { useState } from 'react';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import ownerService from '../../../services/ownerService';
import { useAuth } from '../../../hooks/useAuth';
import { BRANCH_PERMIT_COPY } from '../content/branchContent';
import {
  buildSubmitBranchPermitPayload,
  getBranchPermitMeta,
  isBranchPermitEditable,
  mapAddBranchBackendErrors,
  validateBranchPermitInput,
} from '../utils/branchWorkspaceUtils';
import BranchPermitFields from './BranchPermitFields';
import './BranchPermitPanel.css';

export default function BranchPermitPanel({ branch }) {
  const { refreshUser } = useAuth();
  const [file, setFile] = useState(null);
  const [isRequiredLocally, setIsRequiredLocally] = useState(
    () => (branch?.isRequiredLocally !== undefined ? Boolean(branch.isRequiredLocally) : true),
  );
  const [exemptionReason, setExemptionReason] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [openingFile, setOpeningFile] = useState(false);

  if (!branch || branch.isMainBranch || !branch.permitStatus) {
    return null;
  }

  const permitStatus = branch.permitStatus;
  const meta = getBranchPermitMeta(permitStatus);
  const editable = isBranchPermitEditable(permitStatus);
  const hasSubmittedFile = Boolean(branch.permitUploadedAt && branch.isRequiredLocally !== false);

  const handleViewSubmitted = async () => {
    if (openingFile) return;
    setOpeningFile(true);
    setFormError('');
    try {
      const blob = await ownerService.fetchBranchPermitFileBlob(branch.restaurant_id);
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err) {
      setFormError(err?.message || BRANCH_PERMIT_COPY.fileLoadError);
    } finally {
      setOpeningFile(false);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const clientErrors = validateBranchPermitInput({
      mayors_permit: file,
      is_required_locally: isRequiredLocally,
      exemption_reason: exemptionReason,
    });
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setFormError(Object.values(clientErrors)[0]);
      return;
    }

    setSubmitting(true);
    setErrors({});
    setFormError('');
    setSuccessMsg('');
    try {
      const payload = buildSubmitBranchPermitPayload({
        mayors_permit: file,
        is_required_locally: isRequiredLocally,
        exemption_reason: exemptionReason,
      });
      await ownerService.submitBranchPermit(branch.restaurant_id, payload);
      setFile(null);
      setExemptionReason('');
      setSuccessMsg(BRANCH_PERMIT_COPY.updateSuccessMessage);
      if (typeof refreshUser === 'function') {
        await refreshUser();
      }
    } catch (err) {
      const parsed = mapAddBranchBackendErrors(err);
      setErrors(parsed.fieldErrors);
      setFormError(parsed.formError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="branch-permit"
      className="owner-profile-card salo-branch-permit-panel"
      aria-labelledby="branch-permit-heading"
    >
      <div className="salo-branch-permit-panel__header">
        <div>
          <h2 id="branch-permit-heading">{BRANCH_PERMIT_COPY.panelTitle}</h2>
          {meta && (
            <p className="salo-branch-permit-panel__desc">{meta.description}</p>
          )}
        </div>
        <div className="salo-branch-permit-panel__header-actions">
          {meta && (
            <Badge variant={meta.variant} size="sm">
              {meta.label}
            </Badge>
          )}
          {hasSubmittedFile && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={openingFile}
              onClick={handleViewSubmitted}
            >
              {openingFile ? BRANCH_PERMIT_COPY.loadingFileLabel : BRANCH_PERMIT_COPY.viewSubmittedButton}
            </Button>
          )}
        </div>
      </div>

      {branch.permitReviewNote && (
        <div className="salo-branch-permit-panel__note" role="status">
          <strong>{BRANCH_PERMIT_COPY.adminNoteLabel}:</strong> {branch.permitReviewNote}
        </div>
      )}

      {successMsg && (
        <p className="owner-profile-success" role="status">
          ✓ {successMsg}
        </p>
      )}
      {formError && (
        <p className="owner-profile-error" role="alert">
          {formError}
        </p>
      )}

      {editable ? (
        <form onSubmit={handleSubmit} className="salo-branch-permit-panel__form">
          <BranchPermitFields
            idPrefix={`branch-permit-${branch.restaurant_id}`}
            file={file}
            isRequiredLocally={isRequiredLocally}
            exemptionReason={exemptionReason}
            errors={errors}
            disabled={submitting}
            onFileChange={(nextFile) => {
              setFile(nextFile);
              setErrors((prev) => ({ ...prev, mayors_permit: undefined }));
            }}
            onToggleNotRequired={(nextRequired) => {
              setIsRequiredLocally(nextRequired);
              setErrors({});
              setFormError('');
            }}
            onExemptionChange={(nextText) => {
              setExemptionReason(nextText);
              setErrors((prev) => ({ ...prev, exemption_reason: undefined }));
            }}
            onClientFileError={(msg) => setErrors((prev) => ({ ...prev, mayors_permit: msg || undefined }))}
          />
          <div className="salo-branch-permit-panel__submit">
            <Button type="submit" variant="primary" size="sm" loading={submitting}>
              {BRANCH_PERMIT_COPY.submitUpdateButton}
            </Button>
          </div>
        </form>
      ) : (
        <p className="salo-branch-permit-panel__readonly" role="status">
          {BRANCH_PERMIT_COPY.panelReadOnlyNotice}
        </p>
      )}
    </section>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import BranchPermitFields from '../../../features/restaurant/components/BranchPermitFields';
import { BRANCH_PERMIT_COPY } from '../../../features/restaurant/content/branchContent';
import {
  mapAddBranchBackendErrors,
  validateBranchPermitInput,
} from '../../../features/restaurant/utils/branchWorkspaceUtils';
import applicationService from '../../../services/applicationService';
import {
  buildApplicationBranchPermitPayload,
  formatBranchAddressSummary,
  getApplicationBranchPermitViewModel,
} from '../utils/branchHelpers';
import '../../../features/restaurant/components/BranchPermitPanel.css';

export default function ApplicationBranchPermitCard({
  applicationId,
  applicationStatus,
  branch,
  onPermitUpdated,
}) {
  const [conflict409, setConflict409] = useState(false);
  const vm = getApplicationBranchPermitViewModel(branch, applicationStatus, conflict409);

  const [file, setFile] = useState(null);
  const [isRequiredLocally, setIsRequiredLocally] = useState(vm.isRequiredLocally);
  const [exemptionReason, setExemptionReason] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [openingFile, setOpeningFile] = useState(false);

  const handleViewSubmitted = async () => {
    if (openingFile || !applicationId || !branch?.application_branch_id) return;
    // Open tab synchronously on click so popup blockers do not block it
    const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
    setOpeningFile(true);
    setFormError('');
    try {
      const blob = await applicationService.fetchApplicationBranchPermitFileBlob(
        applicationId,
        branch.application_branch_id,
      );
      const blobUrl = URL.createObjectURL(blob);
      if (popup && !popup.closed) {
        popup.location.href = blobUrl;
      } else {
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err) {
      if (popup && !popup.closed) popup.close();
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
      const payload = buildApplicationBranchPermitPayload({
        permitFile: file,
        permitRequiredLocally: isRequiredLocally,
        permitExemptionReason: exemptionReason,
      });
      await applicationService.submitApplicationBranchPermit(
        applicationId,
        branch.application_branch_id,
        payload,
      );
      setFile(null);
      setExemptionReason('');
      setSuccessMsg(BRANCH_PERMIT_COPY.updateSuccessMessage);
      const updatedApp = await applicationService.getCurrentRestaurantApplication().catch(() => null);
      if (updatedApp) {
        onPermitUpdated?.(updatedApp);
      }
    } catch (err) {
      if (err?.status === 409 && /restaurant\/branches/i.test(String(err?.message || ''))) {
        setConflict409(true);
        setFormError('');
      } else {
        const parsed = mapAddBranchBackendErrors(err);
        setErrors(parsed.fieldErrors);
        setFormError(parsed.formError);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '12px', border: '1px solid var(--border-secondary, #e5e7eb)', borderRadius: '8px', display: 'grid', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>{branch.branch_name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {formatBranchAddressSummary(branch.address)}
            {branch.address?.latitude != null && branch.address?.longitude != null && (
              <> • Pin: {Number(branch.address.latitude).toFixed(4)}, {Number(branch.address.longitude).toFixed(4)}</>
            )}
            {branch.contact_phone && <> • Phone: {branch.contact_phone}</>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Badge variant={vm.badgeVariant} size="sm">{vm.badgeLabel}</Badge>
          {vm.hasFile && (
            <Button type="button" variant="outline" size="sm" loading={openingFile} onClick={handleViewSubmitted}>
              {openingFile ? BRANCH_PERMIT_COPY.loadingFileLabel : BRANCH_PERMIT_COPY.viewSubmittedButton}
            </Button>
          )}
        </div>
      </div>

      {vm.reviewNote && (
        <div className="salo-branch-permit-panel__note" role="status" style={{ marginBottom: 0 }}>
          <strong>{BRANCH_PERMIT_COPY.adminNoteLabel}:</strong> {vm.reviewNote}
        </div>
      )}

      {!vm.isRequiredLocally && vm.exemptionReason && (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          <strong>Local exemption:</strong> {vm.exemptionReason}
        </div>
      )}

      {successMsg && <p style={{ margin: 0, fontSize: '12px', color: '#15803d' }} role="status">✓ {successMsg}</p>}
      {formError && <p style={{ margin: 0, fontSize: '12px', color: 'var(--salo-error, #b91c1c)' }} role="alert">{formError}</p>}

      {vm.movedToOwnerWorkspace ? (
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }} role="status">
          This branch is active. Manage its permit in your{' '}
          <Link to="/owner/profile#branch-permit" style={{ fontWeight: 600, textDecoration: 'underline' }}>
            restaurant workspace
          </Link>.
        </p>
      ) : vm.editable ? (
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '8px', marginTop: '4px' }}>
          <BranchPermitFields
            idPrefix={`app-branch-permit-${branch.application_branch_id}`}
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
          <div>
            <Button type="submit" variant="primary" size="sm" loading={submitting}>
              {BRANCH_PERMIT_COPY.submitUpdateButton}
            </Button>
          </div>
        </form>
      ) : (
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
          {BRANCH_PERMIT_COPY.panelReadOnlyNotice}
        </p>
      )}
    </div>
  );
}

import { useRef } from 'react';
import Button from '../../../components/common/Button';
import { FormGroup, Label, HelperText, ErrorMessage, Textarea } from '../../../components/forms/FormElements';
import {
  BRANCH_PERMIT_ACCEPT_ATTR,
  BRANCH_PERMIT_COPY,
  BRANCH_PERMIT_EXEMPTION_MAX_CHARS,
} from '../content/branchContent';
import { formatPermitFileSize, validatePermitFile } from '../utils/branchWorkspaceUtils';

export default function BranchPermitFields({
  idPrefix = 'branch-permit',
  file = null,
  isRequiredLocally = true,
  exemptionReason = '',
  errors = {},
  disabled = false,
  onFileChange,
  onToggleNotRequired,
  onExemptionChange,
  onClientFileError,
}) {
  const inputRef = useRef(null);
  const notRequired = isRequiredLocally === false;
  const charCount = String(exemptionReason || '').trim().length;

  const handleFileSelect = (event) => {
    const selected = event.target.files?.[0] || null;
    if (!selected) return;
    const err = validatePermitFile(selected);
    if (err) {
      onClientFileError?.(err);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    onClientFileError?.('');
    onFileChange?.(selected);
  };

  const handleRemoveFile = () => {
    if (inputRef.current) inputRef.current.value = '';
    onClientFileError?.('');
    onFileChange?.(null);
  };

  return (
    <div className="salo-branch-permit-fields">
      <div className="salo-branch-permit-toggle-row">
        <label className="salo-branch-permit-toggle" htmlFor={`${idPrefix}-not-required`}>
          <input
            id={`${idPrefix}-not-required`}
            type="checkbox"
            checked={notRequired}
            disabled={disabled}
            onChange={(e) => onToggleNotRequired?.(!e.target.checked)}
          />
          <span>{BRANCH_PERMIT_COPY.notRequiredToggleLabel}</span>
        </label>
      </div>

      {!notRequired ? (
        <FormGroup>
          <Label htmlFor={`${idPrefix}-file`} required>
            {BRANCH_PERMIT_COPY.uploadLabel}
          </Label>
          <input
            ref={inputRef}
            id={`${idPrefix}-file`}
            type="file"
            accept={BRANCH_PERMIT_ACCEPT_ATTR}
            disabled={disabled}
            onChange={handleFileSelect}
            className="salo-branch-permit-file-input"
          />

          {file ? (
            <div className="salo-branch-permit-file-preview" role="status">
              <div className="salo-branch-permit-file-meta">
                <strong className="salo-branch-permit-file-name">{file.name}</strong>
                <span className="salo-branch-permit-file-size">{formatPermitFileSize(file.size)}</span>
              </div>
              <div className="salo-branch-permit-file-actions">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  onClick={() => inputRef.current?.click()}
                >
                  {BRANCH_PERMIT_COPY.replaceFileButton}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={handleRemoveFile}
                >
                  {BRANCH_PERMIT_COPY.removeFileButton}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() => inputRef.current?.click()}
              >
                {BRANCH_PERMIT_COPY.selectFileButton}
              </Button>
            </div>
          )}

          {errors.mayors_permit && <ErrorMessage>{errors.mayors_permit}</ErrorMessage>}
        </FormGroup>
      ) : (
        <FormGroup>
          <Label htmlFor={`${idPrefix}-exemption`} required>
            {BRANCH_PERMIT_COPY.exemptionLabel}
          </Label>
          <Textarea
            id={`${idPrefix}-exemption`}
            value={exemptionReason}
            disabled={disabled}
            maxLength={BRANCH_PERMIT_EXEMPTION_MAX_CHARS}
            rows={3}
            placeholder={BRANCH_PERMIT_COPY.exemptionPlaceholder}
            onChange={(e) => onExemptionChange?.(e.target.value)}
            error={errors.exemption_reason}
          />
          <HelperText>
            {BRANCH_PERMIT_COPY.exemptionHint} ({charCount}/{BRANCH_PERMIT_EXEMPTION_MAX_CHARS})
          </HelperText>
          {errors.exemption_reason && <ErrorMessage>{errors.exemption_reason}</ErrorMessage>}
        </FormGroup>
      )}
    </div>
  );
}

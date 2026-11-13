import { useMemo } from 'react';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import DocumentUploadCard from './DocumentUploadCard';
import { getDocumentClassification } from '../constants/documentRequirements';

export default function BusinessDocumentsStep({
  ownershipStructure,
  position,
  documents = {},
  onDocumentUpload,
  onDocumentRemove,
  onSkipSupporting,
  errors = {},
}) {
  const { mandatory, conditional, supporting } = useMemo(() => {
    return getDocumentClassification(ownershipStructure, position);
  }, [ownershipStructure, position]);

  const requiredCount = mandatory.length + conditional.length;
  const uploadedMandatoryCount = mandatory.filter((d) => documents[d.id]?.name).length;
  const uploadedConditionalCount = conditional.filter((d) => documents[d.id]?.name).length;
  const uploadedRequiredCount = uploadedMandatoryCount + uploadedConditionalCount;

  const uploadedSupportingCount = supporting.filter((d) => documents[d.id]?.name).length;

  return (
    <div className="wizard-step-container">
      <div className="wizard-step-header">
        <div className="wizard-step-header-with-badge">
          <div>
            <h2 className="wizard-step-heading">Business Documents & Permits</h2>
            <p className="wizard-step-subheading">
              Upload digital copies or clear photos of your establishment’s official registration and permits.
              Requirements below are tailored to your entity type (<strong>{ownershipStructure}</strong>) and representative role (<strong>{position}</strong>).
            </p>
          </div>
          <div className="wizard-docs-summary-badge">
            <span className="summary-label">Required Documents:</span>
            <Badge variant={uploadedRequiredCount >= requiredCount ? 'success' : 'warning'} size="md">
              {uploadedRequiredCount} / {requiredCount} Uploaded
            </Badge>
          </div>
        </div>
      </div>

      <div className="wizard-info-callout">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <div className="callout-content">
          <strong>Document Security:</strong> Uploaded documents and camera photos are encrypted and used exclusively for partner verification and compliance.
        </div>
      </div>

      <div className="wizard-doc-categories-stack">
        {/* Section 1: Required Documents (Mandatory Documents) */}
        <section className="wizard-doc-category-group" aria-labelledby="section-mandatory-title">
          <div className="wizard-doc-category-title-bar">
            <div>
              <h3 id="section-mandatory-title" className="wizard-doc-category-title">
                Required Documents
              </h3>
              <p className="wizard-doc-section-desc">
                Primary business verification documents required for all initial restaurant partner applications.
              </p>
            </div>
            <span className="wizard-doc-category-count">
              {uploadedMandatoryCount} of {mandatory.length} uploaded
            </span>
          </div>

          <div className="wizard-doc-cards-grid">
            {mandatory.map((doc) => (
              <DocumentUploadCard
                key={doc.id}
                docConfig={doc}
                currentDoc={documents[doc.id] || null}
                onUpload={onDocumentUpload}
                onRemove={onDocumentRemove}
                error={errors[doc.id]}
              />
            ))}
          </div>
        </section>

        {/* Section 2: Conditional Documents (Rendered ONLY when applicable) */}
        {conditional.length > 0 && (
          <section className="wizard-doc-category-group" aria-labelledby="section-conditional-title">
            <div className="wizard-doc-category-title-bar">
              <div>
                <h3 id="section-conditional-title" className="wizard-doc-category-title">
                  Conditional Documents
                </h3>
                <p className="wizard-doc-section-desc">
                  Applicable because you are applying as an authorized representative or manager.
                </p>
              </div>
              <span className="wizard-doc-category-count">
                {uploadedConditionalCount} of {conditional.length} uploaded
              </span>
            </div>

            <div className="wizard-doc-cards-grid">
              {conditional.map((doc) => (
                <DocumentUploadCard
                  key={doc.id}
                  docConfig={doc}
                  currentDoc={documents[doc.id] || null}
                  onUpload={onDocumentUpload}
                  onRemove={onDocumentRemove}
                  error={errors[doc.id]}
                />
              ))}
            </div>
          </section>
        )}

        {/* Section 3: Additional Supporting Documents (Optional Documents) */}
        <section className="wizard-doc-category-group" aria-labelledby="section-supporting-title">
          <div className="wizard-doc-category-title-bar wizard-doc-category-title-bar--supporting">
            <div className="wizard-doc-supporting-header-content">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 id="section-supporting-title" className="wizard-doc-category-title">
                  Additional Supporting Documents
                </h3>
                <Badge variant="neutral" size="sm">Optional</Badge>
              </div>
              <p className="wizard-doc-section-desc">
                These supporting documents can help with the verification of your restaurant. You may upload the documents you currently have available. SALO administrators may request additional documents if necessary during the review process.
              </p>
            </div>
            <div className="wizard-doc-supporting-actions">
              <span className="wizard-doc-category-count">
                {uploadedSupportingCount} of {supporting.length} uploaded (optional)
              </span>
              {onSkipSupporting && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onSkipSupporting}
                  title="Proceed to next step without uploading optional documents"
                >
                  Skip Supporting Documents →
                </Button>
              )}
            </div>
          </div>

          <div className="wizard-doc-cards-grid">
            {supporting.map((doc) => (
              <DocumentUploadCard
                key={doc.id}
                docConfig={doc}
                currentDoc={documents[doc.id] || null}
                onUpload={onDocumentUpload}
                onRemove={onDocumentRemove}
                error={errors[doc.id]}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

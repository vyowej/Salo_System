import { useMemo } from 'react';
import Badge from '../../../components/common/Badge';
import DocumentUploadCard from './DocumentUploadCard';
import { getRequiredDocuments } from '../constants/documentRequirements';

export default function BusinessDocumentsStep({
  ownershipStructure,
  position,
  documents = {},
  onDocumentUpload,
  onDocumentRemove,
  errors = {},
}) {
  const documentList = useMemo(() => {
    return getRequiredDocuments(ownershipStructure, position);
  }, [ownershipStructure, position]);

  // Group by category
  const categories = useMemo(() => {
    const map = {};
    documentList.forEach((doc) => {
      const cat = doc.category || 'General Documents';
      if (!map[cat]) map[cat] = [];
      map[cat].push(doc);
    });
    return Object.entries(map);
  }, [documentList]);

  const requiredCount = documentList.filter((d) => d.required).length;
  const uploadedRequiredCount = documentList.filter((d) => d.required && documents[d.id]?.name).length;

  return (
    <div className="wizard-step-container">
      <div className="wizard-step-header">
        <div className="wizard-step-header-with-badge">
          <div>
            <h2 className="wizard-step-heading">Business Registration & Permits</h2>
            <p className="wizard-step-subheading">
              Upload digital copies or clear photos of your establishment’s official registration, tax, and local permits.
              Requirements below are tailored to your entity type: <strong>{ownershipStructure}</strong>.
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
          <strong>Document Security & Privacy Notice:</strong> Files uploaded here are held in temporary memory for application preview only. No files are uploaded to external cloud servers or stored in persistent browser cookies.
        </div>
      </div>

      <div className="wizard-doc-categories-stack">
        {categories.map(([categoryName, docs]) => (
          <section key={categoryName} className="wizard-doc-category-group">
            <div className="wizard-doc-category-title-bar">
              <h3 className="wizard-doc-category-title">{categoryName}</h3>
              <span className="wizard-doc-category-count">
                {docs.filter((d) => documents[d.id]?.name).length} of {docs.length} uploaded
              </span>
            </div>

            <div className="wizard-doc-cards-grid">
              {docs.map((doc) => (
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
        ))}
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import Badge from '../../../components/common/Badge';
import RiderDocumentUploadCard from './RiderDocumentUploadCard';
import { getClearanceDocuments, RIDER_DOC_TYPES } from '../constants/riderDocumentMatrix';

export default function ClearanceDocumentsStep({
  documents = {},
  onDocumentUpload,
  onDocumentRemove,
  errors = {},
}) {
  const clearanceList = useMemo(() => getClearanceDocuments(), []);

  const hasPrimaryClearance = Boolean(
    documents[RIDER_DOC_TYPES.NBI_CLEARANCE]?.name ||
    documents[RIDER_DOC_TYPES.POLICE_CLEARANCE]?.name
  );

  return (
    <div className="rider-step-container">
      <div className="rider-step-header">
        <div className="rider-step-header-with-badge">
          <div>
            <h2 className="rider-step-heading">Background Clearances & Safety Verification</h2>
            <p className="rider-step-subheading">
              Upload an official NBI Clearance or National Police Clearance to ensure platform security, customer trust, and cash handling integrity.
            </p>
          </div>
          <div className="rider-docs-summary-badge">
            <span className="summary-label">Primary Clearance:</span>
            <Badge variant={hasPrimaryClearance ? 'success' : 'warning'} size="md">
              {hasPrimaryClearance ? '✓ Clearance Uploaded' : 'NBI or Police Required'}
            </Badge>
          </div>
        </div>
      </div>

      <div className="rider-info-callout">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <div className="callout-content">
          <strong>Clearance Policy:</strong> Applicants must provide at least <strong>one</strong> valid primary clearance (either NBI Clearance or National Police Clearance issued within the last 12 months). Barangay and medical certificates are optional but recommended.
        </div>
      </div>

      <div className="rider-upload-cards-stack">
        {clearanceList.map((doc) => (
          <RiderDocumentUploadCard
            key={doc.id}
            docConfig={{
              ...doc,
              required: doc.id === RIDER_DOC_TYPES.NBI_CLEARANCE || doc.id === RIDER_DOC_TYPES.POLICE_CLEARANCE
                ? !hasPrimaryClearance
                : false,
            }}
            currentDoc={documents[doc.id] || null}
            onUpload={onDocumentUpload}
            onRemove={onDocumentRemove}
            error={errors[doc.id] || (doc.id === RIDER_DOC_TYPES.NBI_CLEARANCE && errors.primaryClearance)}
          />
        ))}
      </div>
    </div>
  );
}

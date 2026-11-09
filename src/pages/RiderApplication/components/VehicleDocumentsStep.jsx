import { useMemo } from 'react';
import Badge from '../../../components/common/Badge';
import RiderDocumentUploadCard from './RiderDocumentUploadCard';
import { getVehicleDocuments } from '../constants/riderDocumentMatrix';

export default function VehicleDocumentsStep({
  deliveryMethod = 'motorcycle',
  ownership = 'Personally Owned',
  documents = {},
  onDocumentUpload,
  onDocumentRemove,
  errors = {},
}) {
  const docList = useMemo(() => {
    return getVehicleDocuments(deliveryMethod, ownership);
  }, [deliveryMethod, ownership]);

  if (deliveryMethod === 'walking') {
    return (
      <div className="rider-step-container">
        <div className="rider-step-header">
          <h2 className="rider-step-heading">Vehicle Documents & Licensing</h2>
          <p className="rider-step-subheading">
            Not applicable for Walking / Pedestrian Delivery.
          </p>
        </div>

        <div className="walker-docs-notice">
          <div className="notice-icon" aria-hidden="true">🚶</div>
          <div className="notice-copy">
            <h3 className="notice-title">No Driver’s License or Vehicle Registration Needed</h3>
            <p className="notice-desc">
              Because you are applying as a pedestrian walker courier, you do not need to provide a driver's license, LTO OR/CR, or motor vehicle insurance. You may proceed directly to the background clearances step.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const requiredCount = docList.filter((d) => d.required).length;
  const uploadedRequiredCount = docList.filter((d) => d.required && documents[d.id]?.name).length;

  return (
    <div className="rider-step-container">
      <div className="rider-step-header">
        <div className="rider-step-header-with-badge">
          <div>
            <h2 className="rider-step-heading">
              {deliveryMethod === 'motorcycle'
                ? 'Driver’s License & LTO Vehicle Documents'
                : `${deliveryMethod === 'bicycle' ? 'Bicycle' : 'E-Vehicle'} Equipment Photos & Proofs`}
            </h2>
            <p className="rider-step-subheading">
              Upload clear color photos of the required official documents for your{' '}
              <strong>{deliveryMethod}</strong>.
            </p>
          </div>
          <div className="rider-docs-summary-badge">
            <span className="summary-label">Required Documents:</span>
            <Badge variant={uploadedRequiredCount >= requiredCount ? 'success' : 'warning'} size="md">
              {uploadedRequiredCount} / {requiredCount} Uploaded
            </Badge>
          </div>
        </div>
      </div>

      <div className="rider-upload-cards-stack">
        {docList.map((doc) => (
          <RiderDocumentUploadCard
            key={doc.id}
            docConfig={doc}
            currentDoc={documents[doc.id] || null}
            onUpload={onDocumentUpload}
            onRemove={onDocumentRemove}
            error={errors[doc.id]}
          />
        ))}
      </div>
    </div>
  );
}

import './VehicleDocumentsStep.css';

export default function VehicleDocumentsStep({ vehicleTypes, vehicleType }) {
  const requiredDocuments = vehicleTypes.find((item) => item.label === vehicleType)?.requiredDocuments;

  return (
    <div className="rider-vehicle-documents-step">
      {requiredDocuments?.length ? requiredDocuments.map((document) => (
        <label key={document} className="rider-upload-field-inline">
          <span>{document}</span>
          <input type="file" accept="image/*,.pdf" />
        </label>
      )) : <p className="rider-form-hint">No documents required for this selected vehicle type.</p>}
    </div>
  );
}

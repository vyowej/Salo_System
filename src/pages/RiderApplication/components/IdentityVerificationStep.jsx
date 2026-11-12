import { Input, Select } from '../../../components/forms';
import RiderDocumentUploadCard from './RiderDocumentUploadCard';
import { GOVERNMENT_ID_OPTIONS } from '../constants/riderApplicationDefaults';
import { RIDER_DOC_CATALOG, RIDER_DOC_TYPES } from '../constants/riderDocumentMatrix';

export default function IdentityVerificationStep({
  data,
  onChange,
  errors = {},
}) {
  const handleChange = (field, value) => {
    onChange?.({
      ...data,
      [field]: value,
    });
  };

  const handleIdTypeChange = (newType) => {
    const isPhilId = newType === 'Philippine National ID (PhilID)';
    onChange?.({
      ...data,
      idType: newType,
      isPermanent: isPhilId ? true : data.isPermanent,
      expiryDate: isPhilId ? '' : data.expiryDate,
    });
  };

  const handlePermanentToggle = (checked) => {
    onChange?.({
      ...data,
      isPermanent: checked,
      expiryDate: checked ? '' : data.expiryDate,
    });
  };

  const handleUpload = (docField, fileData) => {
    onChange?.({
      ...data,
      [docField]: fileData,
    });
  };

  const handleRemove = (docField) => {
    onChange?.({
      ...data,
      [docField]: null,
    });
  };

  const isPermanentId = Boolean(data.isPermanent);

  return (
    <div className="rider-step-container">
      <div className="rider-step-header">
        <h2 className="rider-step-heading">Identity Verification Documents</h2>
        <p className="rider-step-subheading">
          Upload clear color copies of an official Philippine government-issued ID and a recent profile photo.
          These details are required for courier onboarding accreditation and safety compliance.
        </p>
      </div>

      <div className="rider-security-callout">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        <div className="callout-copy">
          <strong>Privacy & Document Security:</strong> Document images are held securely in your browser session for this application. No unencrypted files are transmitted to untrusted endpoints.
        </div>
      </div>

      <div className="rider-form-grid">
        <div className="grid-cols-2">
          <Select
            id="id-type"
            label="Government-Issued ID Type"
            value={data.idType || GOVERNMENT_ID_OPTIONS[0]}
            onChange={(e) => handleIdTypeChange(e.target.value)}
            required
            helper="Choose the primary ID you will present."
          >
            {GOVERNMENT_ID_OPTIONS.map((idOption) => (
              <option key={idOption} value={idOption}>
                {idOption}
              </option>
            ))}
          </Select>

          <Input
            id="id-number"
            label="Government ID Number"
            placeholder="e.g. 1234-5678-9012-3456"
            value={data.idNumber || ''}
            onChange={(e) => handleChange('idNumber', e.target.value)}
            error={errors.idNumber}
            required
            helper="Enter exactly as shown on your card."
          />
        </div>

        <div className="grid-cols-2">
          <div>
            <Input
              id="id-expiry"
              type="date"
              label="ID Expiration Date"
              value={isPermanentId ? '' : data.expiryDate || ''}
              onChange={(e) => handleChange('expiryDate', e.target.value)}
              disabled={isPermanentId}
              error={!isPermanentId ? errors.expiryDate : null}
              helper={
                isPermanentId
                  ? 'Marked as permanent / no expiry (e.g. PhilID / National ID).'
                  : 'Must be valid and unexpired.'
              }
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginTop: 'var(--space-2)' }}>
            <label className="rider-checkbox-inline" htmlFor="id-permanent-checkbox">
              <input
                id="id-permanent-checkbox"
                type="checkbox"
                checked={isPermanentId}
                onChange={(e) => handlePermanentToggle(e.target.checked)}
                className="rider-checkbox-input"
              />
              <span className="rider-checkbox-label-text">
                My ID has no expiration date (e.g. PhilID / National ID)
              </span>
            </label>
          </div>
        </div>

        {/* Upload Cards Grid */}
        <div className="rider-upload-cards-stack">
          <RiderDocumentUploadCard
            docConfig={{
              ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.GOV_ID_FRONT],
              required: true,
            }}
            currentDoc={data.frontPhoto}
            onUpload={(_id, fileData) => handleUpload('frontPhoto', fileData)}
            onRemove={() => handleRemove('frontPhoto')}
            error={errors.frontPhoto}
          />

          <RiderDocumentUploadCard
            docConfig={{
              ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.GOV_ID_BACK],
              required: data.idType !== 'Philippine Passport',
              description: data.idType === 'Philippine Passport'
                ? 'Optional for Passport (photo page is sufficient).'
                : RIDER_DOC_CATALOG[RIDER_DOC_TYPES.GOV_ID_BACK].description,
            }}
            currentDoc={data.backPhoto}
            onUpload={(_id, fileData) => handleUpload('backPhoto', fileData)}
            onRemove={() => handleRemove('backPhoto')}
            error={errors.backPhoto}
          />

          <RiderDocumentUploadCard
            docConfig={{
              ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.SELFIE_PHOTO],
              required: true,
            }}
            currentDoc={data.selfiePhoto}
            onUpload={(_id, fileData) => handleUpload('selfiePhoto', fileData)}
            onRemove={() => handleRemove('selfiePhoto')}
            error={errors.selfiePhoto}
          />
        </div>
      </div>
    </div>
  );
}

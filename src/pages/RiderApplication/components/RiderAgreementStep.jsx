import { useEffect, useRef } from 'react';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

const declarationFields = [
  'infoConfirmed',
  'documentsGenuine',
  'safetyPolicyAgreed',
  'termsAgreed',
];

export default function RiderAgreementStep({
  applicationData,
  onNavigateToStep,
  onDeclarationChange,
  onSubmitApplication,
  submitting = false,
  allRequiredValid = false,
}) {
  const agreeAllRef = useRef(null);
  const {
    personal = {},
    identity = {},
    deliveryMethod = 'motorcycle',
    vehicleInfo = {},
    vehicleDocuments = {},
    clearanceDocuments = {},
    emergency = {},
    payout = {},
    emailVerification = {},
    declarations = {},
  } = applicationData;

  const handleCheckboxChange = (field, checked) => {
    onDeclarationChange?.(field, checked);
  };

  const isAllDeclared = declarationFields.every((field) => Boolean(declarations[field]));
  const isPartiallyDeclared = !isAllDeclared && declarationFields.some((field) => Boolean(declarations[field]));

  const handleAgreeAllChange = (checked) => {
    onDeclarationChange?.(
      Object.fromEntries(declarationFields.map((field) => [field, checked])),
    );
  };

  useEffect(() => {
    if (agreeAllRef.current) {
      agreeAllRef.current.indeterminate = isPartiallyDeclared;
    }
  }, [isPartiallyDeclared]);

  const canSubmit = allRequiredValid && isAllDeclared && emailVerification.isVerified;

  const uploadedVehDocsCount = Object.keys(vehicleDocuments).filter((k) => vehicleDocuments[k]?.name).length;
  const uploadedClearancesCount = Object.keys(clearanceDocuments).filter((k) => clearanceDocuments[k]?.name).length;

  return (
    <div className="wizard-step-container">
      <div className="wizard-step-header">
        <h2 className="wizard-step-heading">Rider Agreement & Application Review</h2>
        <p className="wizard-step-subheading">
          Carefully review your application information, acknowledge the SALO Rider Partner Agreement, and submit for onboarding review.
        </p>
      </div>

      <div className="rider-review-sections-stack">
        {/* 1. Company & Verified Email (Step 1) */}
        <div className="rider-review-card">
          <div className="rider-review-header">
            <div className="rider-review-title-group">
              <span className="rider-review-num">1</span>
              <h3 className="rider-review-title">Company & Verified Email (OTP)</h3>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onNavigateToStep(1)}>
              Edit
            </Button>
          </div>
          <div className="rider-review-grid">
            <div className="rider-review-item">
              <span className="rider-review-label">Company / Fleet Operator</span>
              <span className="rider-review-val font-strong">
                {emailVerification.companyName || 'Independent Courier'}
              </span>
            </div>
            <div className="rider-review-item">
              <span className="rider-review-label">Verified Email Address</span>
              <span className="rider-review-val font-strong">
                {emailVerification.verifiedEmail || emailVerification.email || personal.email || '—'}
              </span>
            </div>
            <div className="rider-review-item">
              <span className="rider-review-label">OTP Verification Status</span>
              <span className="rider-review-val">
                {emailVerification.isVerified ? (
                  <Badge variant="success" size="sm">✓ Verified Authenticated</Badge>
                ) : (
                  <Badge variant="danger" size="sm">Verification Required</Badge>
                )}
              </span>
            </div>
            <div className="rider-review-item">
              <span className="rider-review-label">Verification Time</span>
              <span className="rider-review-val">
                {emailVerification.verifiedAt ? new Date(emailVerification.verifiedAt).toLocaleString() : 'Pending'}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Personal Information (Step 2) */}
        <div className="rider-review-card">
          <div className="rider-review-header">
            <div className="rider-review-title-group">
              <span className="rider-review-num">2</span>
              <h3 className="rider-review-title">Personal Credentials</h3>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onNavigateToStep(2)}>
              Edit
            </Button>
          </div>
          <div className="rider-review-grid">
            <div className="rider-review-item">
              <span className="rider-review-label">Full Legal Name</span>
              <span className="rider-review-val font-strong">
                {[personal.firstName, personal.middleName, personal.lastName, personal.suffix].filter(Boolean).join(' ') || '—'}
              </span>
            </div>
            <div className="rider-review-item">
              <span className="rider-review-label">Date of Birth</span>
              <span className="rider-review-val">{personal.dateOfBirth || '—'}</span>
            </div>
            <div className="rider-review-item">
              <span className="rider-review-label">Contact Phone</span>
              <span className="rider-review-val">{personal.phone || '—'}</span>
            </div>
            <div className="rider-review-item">
              <span className="rider-review-label">Gender</span>
              <span className="rider-review-val">{personal.gender || '—'}</span>
            </div>
            <div className="rider-review-item full-width">
              <span className="rider-review-label">Residential Address</span>
              <span className="rider-review-val">
                {[
                  personal.address?.street,
                  personal.address?.barangay ? `Brgy. ${personal.address.barangay}` : null,
                  personal.address?.city,
                  personal.address?.province,
                  personal.address?.postalCode,
                ].filter(Boolean).join(', ') || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Identity Verification (Step 3) */}
        <div className="rider-review-card">
          <div className="rider-review-header">
            <div className="rider-review-title-group">
              <span className="rider-review-num">3</span>
              <h3 className="rider-review-title">Identity Verification</h3>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onNavigateToStep(3)}>
              Edit
            </Button>
          </div>
          <div className="rider-review-grid">
            <div className="rider-review-item">
              <span className="rider-review-label">Government ID Type</span>
              <span className="rider-review-val">{identity.idType || '—'}</span>
            </div>
            <div className="rider-review-item">
              <span className="rider-review-label">ID Number</span>
              <span className="rider-review-val font-mono">{identity.idNumber || '—'}</span>
            </div>
            <div className="rider-review-item">
              <span className="rider-review-label">Expiry / Validity</span>
              <span className="rider-review-val">{identity.isPermanent ? 'Permanent (No Expiry)' : identity.expiryDate || '—'}</span>
            </div>
            <div className="rider-review-item">
              <span className="rider-review-label">Uploaded Photos</span>
              <span className="rider-review-val">
                {[
                  identity.frontPhoto ? 'Front ID' : null,
                  identity.backPhoto ? 'Back ID' : null,
                  identity.selfiePhoto ? 'Face Selfie' : null,
                ].filter(Boolean).join(', ') || 'None'}
              </span>
            </div>
          </div>
        </div>

        {/* 4. Delivery Method (Step 4) */}
        <div className="rider-review-card">
          <div className="rider-review-header">
            <div className="rider-review-title-group">
              <span className="rider-review-num">4</span>
              <h3 className="rider-review-title">Delivery Method</h3>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onNavigateToStep(4)}>
              Edit
            </Button>
          </div>
          <div className="rider-review-grid">
            <div className="rider-review-item">
              <span className="rider-review-label">Transport Mode</span>
              <span className="rider-review-val font-strong" style={{ textTransform: 'capitalize' }}>
                {deliveryMethod.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>

        {/* 5. Vehicle Information (Step 5) */}
        <div className="rider-review-card">
          <div className="rider-review-header">
            <div className="rider-review-title-group">
              <span className="rider-review-num">5</span>
              <h3 className="rider-review-title">Vehicle Specifications</h3>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onNavigateToStep(5)}>
              Edit
            </Button>
          </div>
          <div className="rider-review-grid">
            {deliveryMethod === 'motorcycle' && (
              <>
                <div className="rider-review-item">
                  <span className="rider-review-label">Brand & Model</span>
                  <span className="rider-review-val font-strong">
                    {vehicleInfo.motoBrand} {vehicleInfo.motoModel} ({vehicleInfo.motoYear})
                  </span>
                </div>
                <div className="rider-review-item">
                  <span className="rider-review-label">Plate / MV File Number</span>
                  <span className="rider-review-val font-mono">{vehicleInfo.plateNumber || '—'}</span>
                </div>
                <div className="rider-review-item">
                  <span className="rider-review-label">Ownership</span>
                  <span className="rider-review-val">{vehicleInfo.ownership}</span>
                </div>
                {vehicleInfo.ownership !== 'Personally Owned' && (
                  <div className="rider-review-item">
                    <span className="rider-review-label">Registered Owner</span>
                    <span className="rider-review-val">{vehicleInfo.ownerName || '—'} ({vehicleInfo.ownerRelationship || 'Owner'})</span>
                  </div>
                )}
              </>
            )}

            {deliveryMethod === 'bicycle' && (
              <>
                <div className="rider-review-item">
                  <span className="rider-review-label">Bicycle Type</span>
                  <span className="rider-review-val">{vehicleInfo.bikeType}</span>
                </div>
                <div className="rider-review-item">
                  <span className="rider-review-label">Make & Model</span>
                  <span className="rider-review-val">{vehicleInfo.bikeBrand} {vehicleInfo.bikeModel}</span>
                </div>
              </>
            )}

            {deliveryMethod === 'e_bike' && (
              <div className="rider-review-item">
                <span className="rider-review-label">E-bike Make & Wattage</span>
                <span className="rider-review-val">{vehicleInfo.ebikeBrand} {vehicleInfo.ebikeModel} ({vehicleInfo.ebikeWattage || 'Standard'})</span>
              </div>
            )}

            {deliveryMethod === 'e_scooter' && (
              <div className="rider-review-item">
                <span className="rider-review-label">E-scooter Make</span>
                <span className="rider-review-val">{vehicleInfo.escooterBrand} {vehicleInfo.escooterModel}</span>
              </div>
            )}

            {deliveryMethod === 'walking' && (
              <div className="rider-review-item full-width">
                <span className="rider-review-label">Courier Mode</span>
                <span className="rider-review-val">Walking Pedestrian Courier (Compact Hub Service)</span>
              </div>
            )}
          </div>
        </div>

        {/* 6. Vehicle Documents (Step 6) */}
        <div className="rider-review-card">
          <div className="rider-review-header">
            <div className="rider-review-title-group">
              <span className="rider-review-num">6</span>
              <h3 className="rider-review-title">Vehicle Documents & Licensing</h3>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onNavigateToStep(6)}>
              Edit
            </Button>
          </div>
          <div className="rider-review-grid">
            <div className="rider-review-item">
              <span className="rider-review-label">Vehicle Document Files Uploaded</span>
              <span className="rider-review-val font-strong">
                {deliveryMethod === 'walking' ? 'Exempt (No vehicle required)' : `${uploadedVehDocsCount} files attached`}
              </span>
            </div>
          </div>
        </div>

        {/* 7. Clearances (Step 7) */}
        <div className="rider-review-card">
          <div className="rider-review-header">
            <div className="rider-review-title-group">
              <span className="rider-review-num">7</span>
              <h3 className="rider-review-title">Background Clearances</h3>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onNavigateToStep(7)}>
              Edit
            </Button>
          </div>
          <div className="rider-review-grid">
            <div className="rider-review-item">
              <span className="rider-review-label">Clearance Files Uploaded</span>
              <span className="rider-review-val font-strong">
                {uploadedClearancesCount} documents provided
              </span>
            </div>
          </div>
        </div>

        {/* 8. Emergency Contact & Shift Preferences (Step 8) */}
        <div className="rider-review-card">
          <div className="rider-review-header">
            <div className="rider-review-title-group">
              <span className="rider-review-num">8</span>
              <h3 className="rider-review-title">Coverage & Shift Preferences</h3>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onNavigateToStep(8)}>
              Edit
            </Button>
          </div>
          <div className="rider-review-grid">
            <div className="rider-review-item">
              <span className="rider-review-label">Emergency Contact</span>
              <span className="rider-review-val font-strong">
                {emergency.contactName || '—'} ({emergency.relationship})
              </span>
            </div>
            <div className="rider-review-item">
              <span className="rider-review-label">Emergency Phone</span>
              <span className="rider-review-val">{emergency.phone || '—'}</span>
            </div>
            <div className="rider-review-item">
              <span className="rider-review-label">Preferred Dispatch City</span>
              <span className="rider-review-val font-strong">{emergency.preferredCity}</span>
            </div>
            <div className="rider-review-item">
              <span className="rider-review-label">Shift Availability</span>
              <span className="rider-review-val">
                {(emergency.preferredShifts || []).length} shifts selected • {(emergency.availableDays || []).length} days/week
              </span>
            </div>
          </div>
        </div>

        {/* 9. Payout Setup (Step 9) */}
        <div className="rider-review-card">
          <div className="rider-review-header">
            <div className="rider-review-title-group">
              <span className="rider-review-num">9</span>
              <h3 className="rider-review-title">Earnings & Payout Setup</h3>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onNavigateToStep(9)}>
              Edit
            </Button>
          </div>
          <div className="rider-review-grid">
            <div className="rider-review-item">
              <span className="rider-review-label">Account Holder</span>
              <span className="rider-review-val font-strong">{payout.accountHolder || '—'}</span>
            </div>
            <div className="rider-review-item">
              <span className="rider-review-label">Provider</span>
              <span className="rider-review-val">{payout.provider || '—'}</span>
            </div>
            <div className="rider-review-item">
              <span className="rider-review-label">Account Number</span>
              <span className="rider-review-val font-mono">
                {payout.accountNumber ? `•••• •••• ${payout.accountNumber.slice(-4)}` : '—'}
              </span>
            </div>
            <div className="rider-review-item">
              <span className="rider-review-label">Classification</span>
              <span className="rider-review-val">{payout.accountType}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Rider Agreement Section */}
      <div className="rider-agreement-card">
        <h3 className="agreement-heading">SALO Delivery Partner Code of Conduct & Responsibilities</h3>
        <div className="agreement-scroll-box">
          <h4>1. Road Safety & Protective Equipment</h4>
          <p>
            Riders must adhere strictly to Philippine traffic laws and ordinances. Motorcyclists, cyclists, and e-vehicle riders must wear an approved protective helmet at all times while on dispatch.
          </p>

          <h4>2. Thermal Bag & Food Integrity</h4>
          <p>
            Hot and cold restaurant orders must be stored securely inside an insulated SALO thermal delivery bag. Tamper-evident seals on food containers must remain untouched until delivered into customer hands.
          </p>

          <h4>3. Cash on Delivery (COD) Compliance</h4>
          <p>
            Riders collecting cash on delivery must accurately account for collected funds and remit balances through SALO’s designated electronic remittance channels within scheduled settlement windows.
          </p>

          <h4>4. Professional Etiquette & Customer Privacy</h4>
          <p>
            Riders represent SALO in diner neighborhoods and must treat restaurant staff and customers with courtesy. Customer phone numbers and home addresses must never be retained, shared, or contacted outside of active delivery operations.
          </p>
        </div>

        <div className="agreement-checkboxes-stack">
          <label className="agreement-check-row agreement-check-all">
            <input
              ref={agreeAllRef}
              type="checkbox"
              checked={isAllDeclared}
              onChange={(e) => handleAgreeAllChange(e.target.checked)}
              className="rider-checkbox-input"
              aria-controls="declaration-info-confirmed declaration-documents-genuine declaration-safety-policy declaration-terms"
            />
            <span className="agreement-check-text">Agree to all declarations</span>
          </label>

          <label className="agreement-check-row">
            <input
              id="declaration-info-confirmed"
              type="checkbox"
              checked={Boolean(declarations.infoConfirmed)}
              onChange={(e) => handleCheckboxChange('infoConfirmed', e.target.checked)}
              className="rider-checkbox-input"
            />
            <span className="agreement-check-text">
              I confirm that the personal, company, and vehicle information I provided is accurate and true.
            </span>
          </label>

          <label className="agreement-check-row">
            <input
              id="declaration-documents-genuine"
              type="checkbox"
              checked={Boolean(declarations.documentsGenuine)}
              onChange={(e) => handleCheckboxChange('documentsGenuine', e.target.checked)}
              className="rider-checkbox-input"
            />
            <span className="agreement-check-text">
              I confirm that the uploaded licenses, IDs, and clearances are genuine and legally valid.
            </span>
          </label>

          <label className="agreement-check-row">
            <input
              id="declaration-safety-policy"
              type="checkbox"
              checked={Boolean(declarations.safetyPolicyAgreed)}
              onChange={(e) => handleCheckboxChange('safetyPolicyAgreed', e.target.checked)}
              className="rider-checkbox-input"
            />
            <span className="agreement-check-text">
              I agree to adhere to SALO’s Rider Safety Policies, Food Handling Guidelines, and COD remittance rules.
            </span>
          </label>

          <label className="agreement-check-row">
            <input
              id="declaration-terms"
              type="checkbox"
              checked={Boolean(declarations.termsAgreed)}
              onChange={(e) => handleCheckboxChange('termsAgreed', e.target.checked)}
              className="rider-checkbox-input"
            />
            <span className="agreement-check-text">
              I agree to the applicable SALO Rider Partner Terms and Platform Privacy Notice.
            </span>
          </label>
        </div>

        {!canSubmit && (
          <div className="rider-validation-warning" role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>
              {!emailVerification.isVerified
                ? 'Please complete Step 1 (Company & Email OTP Verification) before submitting.'
                : !isAllDeclared
                ? 'Please check all four declaration boxes above to enable application submission.'
                : 'Please complete all required fields and documents.'}
            </span>
          </div>
        )}

        <div className="rider-submission-action-bar">
          <Button
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            onClick={onSubmitApplication}
            disabled={!canSubmit || submitting}
            loading={submitting}
          >
            Submit Rider Application
          </Button>
        </div>
      </div>
    </div>
  );
}

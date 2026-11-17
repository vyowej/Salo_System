import { useMemo, useEffect, useRef } from 'react';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import { getDocumentClassification } from '../constants/documentRequirements';

const REVIEW_DECLARATION_FIELDS = [
  'infoConfirmed',
  'authorizationConfirmed',
  'termsAgreed',
];

export default function ApplicationReviewStep({
  applicationData,
  onNavigateToStep,
  onDeclarationChange,
  onSubmitApplication,
  submitting = false,
  allRequiredValid = false,
}) {
  const {
    emailVerification = {},
    businessInfo = {},
    representative = {},
    documents = {},
    address = {},
    payout = {},
    configuration = {},
    review = {},
  } = applicationData;

  const docCategories = useMemo(() => {
    return getDocumentClassification(
      businessInfo.ownershipStructure || 'Sole Proprietorship',
      representative.position || 'Business Owner'
    );
  }, [businessInfo.ownershipStructure, representative.position]);

  const agreeAllRef = useRef(null);

  const handleCheckboxChange = (field, checked) => {
    onDeclarationChange?.({
      ...review,
      [field]: checked,
    });
  };

  const isAllDeclarationsConfirmed = REVIEW_DECLARATION_FIELDS.every((field) => Boolean(review[field]));
  const isPartiallyDeclared =
    !isAllDeclarationsConfirmed && REVIEW_DECLARATION_FIELDS.some((field) => Boolean(review[field]));

  const handleAgreeAllChange = (checked) => {
    onDeclarationChange?.({
      ...review,
      ...Object.fromEntries(REVIEW_DECLARATION_FIELDS.map((field) => [field, checked])),
    });
  };

  useEffect(() => {
    if (agreeAllRef.current) {
      agreeAllRef.current.indeterminate = isPartiallyDeclared;
    }
  }, [isPartiallyDeclared]);

  const isReadyToSubmit =
    isAllDeclarationsConfirmed && allRequiredValid && Boolean(emailVerification.isVerified) && !submitting;

  const menuItemsCount = (configuration.menuItems || []).length;

  return (
    <div className="wizard-step-container">
      <div className="wizard-step-header">
        <h2 className="wizard-step-heading">Review & Submit Application</h2>
        <p className="wizard-step-subheading">
          Review all entered restaurant details, uploaded documents, and merchant configuration before final submission.
          You may edit any section prior to submitting.
        </p>
      </div>

      <div className="review-sections-stack">
        {/* Section 1: Email Verification Status */}
        <div className="review-section-card">
          <div className="review-card-header">
            <div className="review-card-title-group">
              <span className="review-section-num">1</span>
              <h3 className="review-section-title">Email Verification Status</h3>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigateToStep(1)}
            >
              Edit
            </Button>
          </div>
          <div className="review-data-grid">
            <div className="review-item">
              <span className="review-label">Verified Contact Email</span>
              <span className="review-value font-strong">{emailVerification.verifiedEmail || emailVerification.email || '—'}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Verification Status</span>
              <span className="review-value">
                {emailVerification.isVerified ? (
                  <Badge variant="success" size="sm">✓ Verified Authenticated</Badge>
                ) : (
                  <Badge variant="danger" size="sm">Verification Required</Badge>
                )}
              </span>
            </div>
            {emailVerification.isSameAsAccount && (
              <div className="review-item full-width">
                <span className="review-label">Account Mapping</span>
                <span className="review-value">Linked directly to primary SALO account</span>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Business Information */}
        <div className="review-section-card">
          <div className="review-card-header">
            <div className="review-card-title-group">
              <span className="review-section-num">2</span>
              <h3 className="review-section-title">Business & Restaurant Information</h3>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigateToStep(2)}
            >
              Edit
            </Button>
          </div>
          <div className="review-data-grid">
            <div className="review-item">
              <span className="review-label">Restaurant Name</span>
              <span className="review-value font-strong">{businessInfo.restaurantName || '—'}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Registered Legal Name</span>
              <span className="review-value">{businessInfo.registeredName || 'Same as Restaurant Name'}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Business Type</span>
              <span className="review-value">{businessInfo.businessType || '—'}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Ownership Structure</span>
              <span className="review-value">{businessInfo.ownershipStructure || '—'}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Cuisine Category</span>
              <span className="review-value">{businessInfo.cuisineType || '—'}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Contact Number</span>
              <span className="review-value">{businessInfo.businessPhone || '—'}</span>
            </div>
            <div className="review-item full-width">
              <span className="review-label">Business Email</span>
              <span className="review-value">{businessInfo.businessEmail || '—'}</span>
            </div>
            {businessInfo.description && (
              <div className="review-item full-width">
                <span className="review-label">Description</span>
                <p className="review-text-block">{businessInfo.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Owner & Representative */}
        <div className="review-section-card">
          <div className="review-card-header">
            <div className="review-card-title-group">
              <span className="review-section-num">3</span>
              <h3 className="review-section-title">Owner / Authorized Representative</h3>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigateToStep(3)}
            >
              Edit
            </Button>
          </div>
          <div className="review-data-grid">
            <div className="review-item">
              <span className="review-label">Full Name</span>
              <span className="review-value font-strong">
                {[representative.firstName, representative.middleName, representative.lastName, representative.suffix].filter(Boolean).join(' ') || '—'}
              </span>
            </div>
            <div className="review-item">
              <span className="review-label">Position / Relationship</span>
              <span className="review-value">{representative.position || '—'}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Email Address</span>
              <span className="review-value">{representative.email || '—'}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Mobile Number</span>
              <span className="review-value">{representative.phone || '—'}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Date of Birth</span>
              <span className="review-value">{representative.dateOfBirth || '—'}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Authorization Certified</span>
              <span className="review-value">
                {representative.isAuthorized ? (
                  <Badge variant="success" size="sm">✓ Declared Authorized</Badge>
                ) : (
                  <Badge variant="danger" size="sm">Pending Declaration</Badge>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Section 4: Business Documents */}
        <div className="review-section-card">
          <div className="review-card-header">
            <div className="review-card-title-group">
              <span className="review-section-num">4</span>
              <h3 className="review-section-title">Business Documents & Permits</h3>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigateToStep(4)}
            >
              Edit
            </Button>
          </div>
          <div className="review-docs-list">
            <div style={{ fontSize: 'var(--text-xs, 12px)', fontWeight: 700, color: 'var(--text-secondary, #525252)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              Required Documents
            </div>
            {docCategories.mandatory.map((doc) => {
              const uploaded = documents[doc.id];
              return (
                <div key={doc.id} className="review-doc-row">
                  <div className="review-doc-left">
                    <span className="review-doc-icon" aria-hidden="true">📄</span>
                    <div>
                      <span className="review-doc-name">{doc.title}</span>
                      {uploaded?.name && <small style={{ display: 'block', color: 'var(--text-secondary, #525252)' }}>{uploaded.name}</small>}
                    </div>
                  </div>
                  {uploaded?.name ? (
                    <Badge variant="success" size="sm">Ready</Badge>
                  ) : (
                    <Badge variant="danger" size="sm">Required</Badge>
                  )}
                </div>
              );
            })}

            {docCategories.conditional.length > 0 && (
              <>
                <div style={{ fontSize: 'var(--text-xs, 12px)', fontWeight: 700, color: 'var(--text-secondary, #525252)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 6px' }}>
                  Conditional Documents
                </div>
                {docCategories.conditional.map((doc) => {
                  const uploaded = documents[doc.id];
                  return (
                    <div key={doc.id} className="review-doc-row">
                      <div className="review-doc-left">
                        <span className="review-doc-icon" aria-hidden="true">📄</span>
                        <div>
                          <span className="review-doc-name">{doc.title}</span>
                          {uploaded?.name && <small style={{ display: 'block', color: 'var(--text-secondary, #525252)' }}>{uploaded.name}</small>}
                        </div>
                      </div>
                      {uploaded?.name ? (
                        <Badge variant="success" size="sm">Ready</Badge>
                      ) : (
                        <Badge variant="danger" size="sm">Required</Badge>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {docCategories.supporting.length > 0 && (
              <>
                <div style={{ fontSize: 'var(--text-xs, 12px)', fontWeight: 700, color: 'var(--text-secondary, #525252)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 6px' }}>
                  Supporting Documents (Optional)
                </div>
                {docCategories.supporting.map((doc) => {
                  const uploaded = documents[doc.id];
                  return (
                    <div key={doc.id} className="review-doc-row">
                      <div className="review-doc-left">
                        <span className="review-doc-icon" aria-hidden="true">📄</span>
                        <div>
                          <span className="review-doc-name">{doc.title}</span>
                          {uploaded?.name && <small style={{ display: 'block', color: 'var(--text-secondary, #525252)' }}>{uploaded.name}</small>}
                        </div>
                      </div>
                      {uploaded?.name ? (
                        <Badge variant="success" size="sm">Attached</Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">Optional</Badge>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Section 5: Address & Location */}
        <div className="review-section-card">
          <div className="review-card-header">
            <div className="review-card-title-group">
              <span className="review-section-num">5</span>
              <h3 className="review-section-title">Business Address & Location Pin</h3>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigateToStep(5)}
            >
              Edit
            </Button>
          </div>
          <div className="review-data-grid">
            <div className="review-item full-width">
              <span className="review-label">Full Street Address</span>
              <span className="review-value font-strong">
                {[
                  address.street,
                  address.barangay ? `Brgy. ${address.barangay}` : null,
                  address.city,
                  address.province,
                  address.postalCode,
                ].filter(Boolean).join(', ') || '—'}
              </span>
            </div>
            <div className="review-item">
              <span className="review-label">Region</span>
              <span className="review-value">{address.region || '—'}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Map Pin Coordinates</span>
              <span className="review-value">
                {address.coordinates
                  ? `${address.coordinates.lat.toFixed(6)}° N, ${address.coordinates.lng.toFixed(6)}° E`
                  : 'Not pinned'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 6: Payout Information */}
        <div className="review-section-card">
          <div className="review-card-header">
            <div className="review-card-title-group">
              <span className="review-section-num">6</span>
              <h3 className="review-section-title">Bank & Payout Details</h3>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigateToStep(6)}
            >
              Edit
            </Button>
          </div>
          <div className="review-data-grid">
            <div className="review-item">
              <span className="review-label">Account Holder</span>
              <span className="review-value font-strong">{payout.accountHolder || '—'}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Bank Name</span>
              <span className="review-value">{payout.bankName || '—'}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Account Number</span>
              <span className="review-value font-mono">
                {payout.accountNumber
                  ? `•••• •••• ${payout.accountNumber.slice(-4)}`
                  : '—'}
              </span>
            </div>
            <div className="review-item">
              <span className="review-label">Account Type</span>
              <span className="review-value">{payout.accountType || '—'}</span>
            </div>
          </div>
        </div>

        {/* Section 7: Configuration & Initial Menu */}
        <div className="review-section-card">
          <div className="review-card-header">
            <div className="review-card-title-group">
              <span className="review-section-num">7</span>
              <h3 className="review-section-title">Services & Restaurant Setup</h3>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigateToStep(7)}
            >
              Edit
            </Button>
          </div>
          <div className="review-data-grid">
            <div className="review-item full-width">
              <span className="review-label">Activated Services</span>
              <div className="review-pill-tags">
                {configuration.services?.delivery && <Badge variant="info" size="sm">🛵 Delivery</Badge>}
                {configuration.services?.pickup && <Badge variant="info" size="sm">🛍️ Pickup</Badge>}
                {configuration.services?.dineIn && <Badge variant="info" size="sm">🍽️ Dine-in</Badge>}
                {configuration.services?.tableReservations && <Badge variant="info" size="sm">📅 Reservations</Badge>}
              </div>
            </div>
            <div className="review-item">
              <span className="review-label">Initial Menu Items</span>
              <span className="review-value">
                {menuItemsCount > 0 ? `${menuItemsCount} items configured` : 'None added (Optional)'}
              </span>
            </div>
            <div className="review-item">
              <span className="review-label">Branding Images</span>
              <span className="review-value">
                {configuration.logo ? '✓ Logo uploaded' : 'No logo'} • {configuration.coverPhoto ? '✓ Cover banner uploaded' : 'No banner'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Declarations & Submission Card (Standardized with Rider Agreement Interface) */}
      <div className="review-submission-box">
        <h3 className="submission-box-title">SALO Merchant Partner Terms & Legal Declarations</h3>
        <div className="agreement-scroll-box">
          <h4>1. Accuracy of Business & Permit Records</h4>
          <p>
            All business registration documents, government permits (DTI/SEC/CDA, Mayor’s Permit, BIR Form 2303, Sanitary & Fire Safety Permits), and bank settlement details submitted must be genuine, current, and legally valid.
          </p>

          <h4>2. Food Safety & Order Quality Standards</h4>
          <p>
            Partner kitchens must prepare, package, and seal orders in compliance with the Philippine Food Safety Act (RA 10611) and local sanitation ordinances, ensuring tamper-evident handoff to SALO delivery partners.
          </p>

          <h4>3. Settlements, Commission & Payouts</h4>
          <p>
            Approved restaurant partners receive automated sales remittances to their verified bank account via PESONet or InstaPay according to SALO’s published merchant settlement schedule and transparent commission rates.
          </p>

          <h4>4. Data Privacy & Customer Confidentiality</h4>
          <p>
            Customer order details and contact information provided through SALO must be used solely for fulfilling orders and reservations in compliance with the Data Privacy Act of 2012 (RA 10173).
          </p>
        </div>

        <div className="agreement-checkboxes-stack">
          <label className="agreement-check-row agreement-check-all">
            <input
              ref={agreeAllRef}
              type="checkbox"
              checked={isAllDeclarationsConfirmed}
              onChange={(e) => handleAgreeAllChange(e.target.checked)}
              className="wizard-checkbox-input"
              aria-controls="biz-decl-info biz-decl-auth biz-decl-terms"
            />
            <span className="agreement-check-text">Agree to all declarations</span>
          </label>

          <label className="agreement-check-row">
            <input
              id="biz-decl-info"
              type="checkbox"
              checked={Boolean(review.infoConfirmed)}
              onChange={(e) => handleCheckboxChange('infoConfirmed', e.target.checked)}
              className="wizard-checkbox-input"
            />
            <span className="agreement-check-text">
              <strong>Accuracy of Information:</strong> I confirm that all submitted restaurant information, uploaded business permits, and banking details are genuine, accurate, and up-to-date.
            </span>
          </label>

          <label className="agreement-check-row">
            <input
              id="biz-decl-auth"
              type="checkbox"
              checked={Boolean(review.authorizationConfirmed)}
              onChange={(e) => handleCheckboxChange('authorizationConfirmed', e.target.checked)}
              className="wizard-checkbox-input"
            />
            <span className="agreement-check-text">
              <strong>Authority to Bind Establishment:</strong> I certify that I am legally authorized to bind this restaurant to the SALO Merchant Terms and manage operational payouts.
            </span>
          </label>

          <label className="agreement-check-row">
            <input
              id="biz-decl-terms"
              type="checkbox"
              checked={Boolean(review.termsAgreed)}
              onChange={(e) => handleCheckboxChange('termsAgreed', e.target.checked)}
              className="wizard-checkbox-input"
            />
            <span className="agreement-check-text">
              <strong>Terms of Service & Food Safety Agreement:</strong> I agree to the SALO Merchant Partner Terms of Service, Food Safety guidelines (RA 10611), and Platform Privacy Notice (RA 10173).
            </span>
          </label>
        </div>

        {!isReadyToSubmit && (
          <div className="wizard-validation-warning" role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>
              {!emailVerification.isVerified
                ? 'Please complete Step 1 (Email Verification) before submitting.'
                : !isAllDeclarationsConfirmed
                ? 'Please accept all declarations above to enable application submission.'
                : 'Please complete all required fields and documents.'}
            </span>
          </div>
        )}

        <div className="submission-action-bar">
          <Button
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            onClick={onSubmitApplication}
            loading={submitting}
            disabled={!isReadyToSubmit}
          >
            {submitting ? 'Submitting Application...' : 'Submit Restaurant Application'}
          </Button>
        </div>
      </div>
    </div>
  );
}

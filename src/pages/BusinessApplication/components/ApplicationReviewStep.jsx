import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

export default function ApplicationReviewStep({
  applicationData,
  onNavigateToStep,
  onDeclarationChange,
  onSubmitApplication,
  submitting = false,
  allRequiredValid = false,
}) {
  const {
    businessInfo = {},
    representative = {},
    documents = {},
    address = {},
    payout = {},
    configuration = {},
    emailVerification = {},
    review = {},
  } = applicationData;

  const handleCheckboxChange = (field, checked) => {
    onDeclarationChange?.({
      ...review,
      [field]: checked,
    });
  };

  const isAllDeclared = review.infoConfirmed && review.authorizationConfirmed && review.termsAgreed;
  const canSubmit = allRequiredValid && isAllDeclared && emailVerification.isVerified;

  const uploadedDocCount = Object.keys(documents).filter((k) => documents[k]?.name).length;
  const menuItemsCount = (configuration.menuItems || []).length;

  return (
    <div className="wizard-step-container">
      <div className="wizard-step-header">
        <h2 className="wizard-step-heading">Application Review & Final Submission</h2>
        <p className="wizard-step-subheading">
          Review all entered restaurant details, uploaded documents, and merchant configuration before final submission.
          You may edit any section prior to submitting.
        </p>
      </div>

      <div className="review-sections-stack">
        {/* Section 1: Business Information */}
        <div className="review-section-card">
          <div className="review-card-header">
            <div className="review-card-title-group">
              <span className="review-section-num">1</span>
              <h3 className="review-section-title">Business & Restaurant Information</h3>
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

        {/* Section 2: Owner & Representative */}
        <div className="review-section-card">
          <div className="review-card-header">
            <div className="review-card-title-group">
              <span className="review-section-num">2</span>
              <h3 className="review-section-title">Owner / Authorized Representative</h3>
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

        {/* Section 3: Business Documents */}
        <div className="review-section-card">
          <div className="review-card-header">
            <div className="review-card-title-group">
              <span className="review-section-num">3</span>
              <h3 className="review-section-title">Business Documents & Permits</h3>
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
          <div className="review-docs-list">
            {uploadedDocCount > 0 ? (
              Object.entries(documents).map(([docId, doc]) => {
                if (!doc?.name) return null;
                return (
                  <div key={docId} className="review-doc-row">
                    <div className="review-doc-left">
                      <span className="review-doc-icon" aria-hidden="true">📄</span>
                      <span className="review-doc-name">{doc.name}</span>
                    </div>
                    <Badge variant="success" size="sm">Ready</Badge>
                  </div>
                );
              })
            ) : (
              <p className="review-empty-note">No documents uploaded yet.</p>
            )}
          </div>
        </div>

        {/* Section 4: Business Address */}
        <div className="review-section-card">
          <div className="review-card-header">
            <div className="review-card-title-group">
              <span className="review-section-num">4</span>
              <h3 className="review-section-title">Business Address & Location Pin</h3>
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

        {/* Section 5: Payout Information */}
        <div className="review-section-card">
          <div className="review-card-header">
            <div className="review-card-title-group">
              <span className="review-section-num">5</span>
              <h3 className="review-section-title">Bank & Payout Details</h3>
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

        {/* Section 6: Configuration & Initial Menu */}
        <div className="review-section-card">
          <div className="review-card-header">
            <div className="review-card-title-group">
              <span className="review-section-num">6</span>
              <h3 className="review-section-title">Services & Initial Menu Setup</h3>
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

        {/* Section 7: Verification Status */}
        <div className="review-section-card">
          <div className="review-card-header">
            <div className="review-card-title-group">
              <span className="review-section-num">7</span>
              <h3 className="review-section-title">Email Verification Status</h3>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigateToStep(7)}
            >
              Check
            </Button>
          </div>
          <div className="review-data-grid">
            <div className="review-item">
              <span className="review-label">Verified Contact Email</span>
              <span className="review-value font-strong">{emailVerification.verifiedEmail || representative.email || '—'}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Status</span>
              <span className="review-value">
                {emailVerification.isVerified ? (
                  <Badge variant="success" size="sm">✓ Verified Authenticated</Badge>
                ) : (
                  <Badge variant="danger" size="sm">Verification Required</Badge>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Declarations & Submission Card */}
      <div className="review-submission-box">
        <h3 className="submission-box-title">Legal Declarations & Merchant Agreement</h3>
        <p className="submission-box-subtitle">
          Please confirm all three statements to enable application submission:
        </p>

        <div className="submission-checkboxes-stack">
          <label className="submission-check-row">
            <input
              type="checkbox"
              checked={Boolean(review.infoConfirmed)}
              onChange={(e) => handleCheckboxChange('infoConfirmed', e.target.checked)}
              className="wizard-checkbox-input"
            />
            <span className="submission-check-text">
              I confirm that all information and documents provided in this application are genuine, true, and legally current.
            </span>
          </label>

          <label className="submission-check-row">
            <input
              type="checkbox"
              checked={Boolean(review.authorizationConfirmed)}
              onChange={(e) => handleCheckboxChange('authorizationConfirmed', e.target.checked)}
              className="wizard-checkbox-input"
            />
            <span className="submission-check-text">
              I confirm that I am authorized to bind the registered food establishment to SALO partner agreements and terms.
            </span>
          </label>

          <label className="submission-check-row">
            <input
              type="checkbox"
              checked={Boolean(review.termsAgreed)}
              onChange={(e) => handleCheckboxChange('termsAgreed', e.target.checked)}
              className="wizard-checkbox-input"
            />
            <span className="submission-check-text">
              I agree to the applicable SALO Merchant Partner Application Terms, 10% Platform Fee schedule, and Privacy Notice.
            </span>
          </label>
        </div>

        {!canSubmit && (
          <div className="submission-validation-warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>
              {!emailVerification.isVerified
                ? 'Please complete Step 7 (Email Verification) before submitting.'
                : !isAllDeclared
                ? 'Please check all three declaration boxes above to enable submission.'
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
            disabled={!canSubmit || submitting}
            loading={submitting}
          >
            Submit Application
          </Button>
        </div>
      </div>
    </div>
  );
}

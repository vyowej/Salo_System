import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

export default function ApplicationSuccess({
  referenceNumber,
  submissionDate,
  restaurantName,
  applicantEmail,
}) {
  const handleCopyRef = () => {
    navigator.clipboard?.writeText(referenceNumber);
    alert(`Copied reference number ${referenceNumber} to clipboard!`);
  };

  return (
    <div className="wizard-success-page" role="status">
      <div className="wizard-success-card">
        <div className="wizard-success-icon-badge" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <span className="wizard-success-eyebrow">Application Received</span>
        <h2 className="wizard-success-title">Thank You for Partnering with SALO!</h2>
        <p className="wizard-success-desc">
          Your restaurant partner application for <strong>{restaurantName || 'Your Restaurant'}</strong> has been submitted to SALO’s Merchant Onboarding Operations team.
        </p>

        {/* Reference & Status Receipt */}
        <div className="wizard-success-receipt">
          <div className="receipt-row">
            <span className="receipt-label">Application Reference Number:</span>
            <div className="receipt-ref-group">
              <strong className="receipt-ref-code">{referenceNumber}</strong>
              <Button type="button" variant="ghost" size="sm" onClick={handleCopyRef} title="Copy code">
                Copy
              </Button>
            </div>
          </div>

          <div className="receipt-row">
            <span className="receipt-label">Submission Date & Time:</span>
            <span className="receipt-value">{new Date(submissionDate).toLocaleString()}</span>
          </div>

          <div className="receipt-row">
            <span className="receipt-label">Initial Review Status:</span>
            <Badge variant="warning" size="md">
              Pending Review
            </Badge>
          </div>

          <div className="receipt-row">
            <span className="receipt-label">Contact Notification Email:</span>
            <span className="receipt-value">{applicantEmail || 'applicant@example.com'}</span>
          </div>
        </div>

        {/* Roadmap Next Steps */}
        <div className="wizard-success-roadmap">
          <h4 className="roadmap-heading">What happens next?</h4>
          <ol className="roadmap-steps-list">
            <li className="roadmap-step-item">
              <span className="roadmap-step-bullet">1</span>
              <div className="roadmap-step-copy">
                <strong>Intake & Permit Verification (24 – 48 Hours)</strong>
                <p>Our compliance team verifies your DTI/SEC registration, BIR TIN, and local Mayor's Permit.</p>
              </div>
            </li>
            <li className="roadmap-step-item">
              <span className="roadmap-step-bullet">2</span>
              <div className="roadmap-step-copy">
                <strong>Kitchen Onboarding & Dispatch Inspection</strong>
                <p>We review your location pin, dispatch instructions, and test settlement bank credentials.</p>
              </div>
            </li>
            <li className="roadmap-step-item">
              <span className="roadmap-step-bullet">3</span>
              <div className="roadmap-step-copy">
                <strong>Storefront Activation</strong>
                <p>Upon approval, log into the SALO Merchant Portal with your existing customer credentials to manage orders.</p>
              </div>
            </li>
          </ol>
        </div>

        <div className="wizard-mock-notice">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>
            <strong>Frontend Simulation:</strong> This application has been saved to your local browser session and synchronized with SALO demo admin services.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="wizard-success-actions">
          <Button
            as={Link}
            to="/business-application/status"
            variant="primary"
            size="lg"
          >
            Track Application Status
          </Button>

          <Button
            as={Link}
            to="/customer"
            variant="outline"
            size="lg"
          >
            Return to Customer Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

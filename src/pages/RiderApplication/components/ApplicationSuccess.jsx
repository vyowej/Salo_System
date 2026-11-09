import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

export default function ApplicationSuccess({
  referenceNumber,
  submissionDate,
  applicantName,
  deliveryMethod,
  applicantEmail,
}) {
  const handleCopyRef = () => {
    navigator.clipboard?.writeText(referenceNumber);
    alert(`Copied reference number ${referenceNumber} to clipboard!`);
  };

  return (
    <div className="rider-success-page" role="status">
      <div className="rider-success-card">
        <div className="rider-success-icon-badge" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <span className="rider-success-eyebrow">Application Received</span>
        <h2 className="rider-success-title">Thank You for Applying, {applicantName || 'Partner'}!</h2>
        <p className="rider-success-desc">
          Your delivery rider partner application has been submitted to the SALO Fleet Onboarding Operations team.
        </p>

        {/* Reference & Status Receipt */}
        <div className="rider-success-receipt">
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
            <span className="receipt-label">Delivery Transport Mode:</span>
            <span className="receipt-value" style={{ textTransform: 'capitalize' }}>
              {deliveryMethod.replace('_', ' ')}
            </span>
          </div>

          <div className="receipt-row">
            <span className="receipt-label">Initial Review Status:</span>
            <Badge variant="warning" size="md">
              Pending Review
            </Badge>
          </div>

          <div className="receipt-row">
            <span className="receipt-label">Registered Contact Email:</span>
            <span className="receipt-value">{applicantEmail || 'applicant@example.com'}</span>
          </div>
        </div>

        {/* Roadmap Next Steps */}
        <div className="rider-success-roadmap">
          <h4 className="roadmap-heading">What happens during review?</h4>
          <ol className="roadmap-steps-list">
            <li className="roadmap-step-item">
              <span className="roadmap-step-bullet">1</span>
              <div className="roadmap-step-copy">
                <strong>License & Background Clearance Check (24–48 Hours)</strong>
                <p>Our fleet safety team reviews your government ID, driver’s license, and NBI/Police clearances.</p>
              </div>
            </li>
            <li className="roadmap-step-item">
              <span className="roadmap-step-bullet">2</span>
              <div className="roadmap-step-copy">
                <strong>Safety Orientation & Digital Walkthrough</strong>
                <p>Upon initial approval, you will complete a quick mobile walkthrough covering live order acceptance and COD handling.</p>
              </div>
            </li>
            <li className="roadmap-step-item">
              <span className="roadmap-step-bullet">3</span>
              <div className="roadmap-step-copy">
                <strong>Gear Pickup & Rider Dispatch Activation</strong>
                <p>Pick up your insulated thermal delivery backpack at your nearest SALO Logistics Hub and start taking orders.</p>
              </div>
            </li>
          </ol>
        </div>

        <div className="rider-mock-notice">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>
            <strong>Frontend Demonstration:</strong> This submission was recorded in your current browser session and registered with SALO demo admin services.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="rider-success-actions">
          <Button
            as={Link}
            to="/rider-application/status"
            variant="primary"
            size="lg"
          >
            Track Rider Application Status
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

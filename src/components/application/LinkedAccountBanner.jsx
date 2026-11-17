import { Link } from 'react-router-dom';
import Badge from '../common/Badge';
import './LinkedAccountBanner.css';

/**
 * Displays the authenticated SALO account name and verified application email
 * at the top of Personal / Representative Information steps so applicants do not
 * have to re-enter existing account details or create conflicting identities.
 */
export default function LinkedAccountBanner({
  accountName = '',
  verifiedEmail = '',
  roleLabel = 'Applicant Name',
}) {
  if (!accountName && !verifiedEmail) return null;

  return (
    <div className="salo-linked-account-card" role="region" aria-label="Linked SALO Account Information">
      <div className="salo-linked-account-header">
        <div className="salo-linked-account-title-group">
          <span className="salo-linked-account-icon" aria-hidden="true">👤</span>
          <div>
            <h3 className="salo-linked-account-title">SALO Account Information</h3>
            <p className="salo-linked-account-subtitle">
              Automatically linked from your account and Step 1 verification.
            </p>
          </div>
        </div>
        <Badge variant="success" size="sm">Account Linked ✓</Badge>
      </div>

      <div className="salo-linked-account-grid">
        {accountName && (
          <div className="salo-linked-account-field">
            <span className="salo-linked-field-label">{roleLabel}</span>
            <span className="salo-linked-field-value">{accountName}</span>
          </div>
        )}
        {verifiedEmail && (
          <div className="salo-linked-account-field">
            <span className="salo-linked-field-label">Verified Application Email</span>
            <span className="salo-linked-field-value">{verifiedEmail}</span>
          </div>
        )}
      </div>

      {accountName && (
        <div className="salo-linked-account-footer">
          <span>Need to update your legal account name?</span>
          <Link to="/customer/profile" className="salo-linked-account-link">
            Edit in Account Settings →
          </Link>
        </div>
      )}
    </div>
  );
}

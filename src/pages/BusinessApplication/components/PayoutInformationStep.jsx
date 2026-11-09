import { useState } from 'react';
import { Input, Select, FormGroup, Label } from '../../../components/forms';
import DocumentUploadCard from './DocumentUploadCard';
import { PHILIPPINE_BANKS, ACCOUNT_TYPES } from '../constants/applicationDefaults';
import { DOCUMENT_CATALOG, DOCUMENT_TYPES } from '../constants/documentRequirements';

export default function PayoutInformationStep({
  data,
  onChange,
  errors = {},
}) {
  const [showAccountNumber, setShowAccountNumber] = useState(false);

  const handleFieldChange = (field, value) => {
    onChange?.({
      ...data,
      [field]: value,
    });
  };

  const handleProofUpload = (docId, fileData) => {
    onChange?.({
      ...data,
      proofDocument: fileData,
    });
  };

  const handleProofRemove = () => {
    onChange?.({
      ...data,
      proofDocument: null,
    });
  };

  const bankProofConfig = {
    ...DOCUMENT_CATALOG[DOCUMENT_TYPES.BANK_PROOF],
    required: false,
  };

  return (
    <div className="wizard-step-container">
      <div className="wizard-step-header">
        <h2 className="wizard-step-heading">Bank & Payout Information</h2>
        <p className="wizard-step-subheading">
          Register the bank account designated for your restaurant’s weekly sales remittances and order settlements.
        </p>
      </div>

      <div className="wizard-security-notice">
        <div className="security-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
        <div className="security-copy">
          <strong>Settlement Confidentiality & Security:</strong>
          <span>
            Payout details are utilized exclusively for weekly bank transfers via Philippine PESONet / InstaPay.
            As this is a frontend prototype, no banking APIs are queried and sensitive details are never stored in browser cookies or persistent storage.
          </span>
        </div>
      </div>

      <div className="wizard-form-grid">
        <div className="grid-cols-2">
          <Input
            id="payout-holder"
            label="Account Holder Name"
            placeholder="e.g. Barrio Fiesta Food Services Inc."
            value={data.accountHolder || ''}
            onChange={(e) => handleFieldChange('accountHolder', e.target.value)}
            error={errors.accountHolder}
            required
            helper="Must match the registered legal business name or registered proprietor."
          />

          <Select
            id="payout-bank"
            label="Bank Name"
            value={data.bankName || PHILIPPINE_BANKS[0]}
            onChange={(e) => handleFieldChange('bankName', e.target.value)}
            required
            helper="Select the authorized depository bank in the Philippines."
          >
            {PHILIPPINE_BANKS.map((bank) => (
              <option key={bank} value={bank}>
                {bank}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid-cols-2">
          <FormGroup>
            <div className="account-number-label-row">
              <Label htmlFor="payout-account-num" required>
                Bank Account Number
              </Label>
              <button
                type="button"
                className="btn-toggle-mask"
                onClick={() => setShowAccountNumber(!showAccountNumber)}
                aria-label={showAccountNumber ? 'Hide account number' : 'Show account number'}
              >
                {showAccountNumber ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                    <span>Hide</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span>Show</span>
                  </>
                )}
              </button>
            </div>
            <Input
              id="payout-account-num"
              type={showAccountNumber ? 'text' : 'password'}
              placeholder="e.g. 1029384756"
              value={data.accountNumber || ''}
              onChange={(e) => handleFieldChange('accountNumber', e.target.value.replace(/\D/g, '').slice(0, 18))}
              error={errors.accountNumber}
              required
              helper="10 to 16 digits without spaces or dashes."
            />
          </FormGroup>

          <Select
            id="payout-type"
            label="Account Type"
            value={data.accountType || ACCOUNT_TYPES[0]}
            onChange={(e) => handleFieldChange('accountType', e.target.value)}
            required
            helper="Savings or Current account."
          >
            {ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </div>

        {/* Optional Bank Proof Document */}
        <div className="payout-proof-section">
          <h4 className="payout-proof-heading">Proof of Account Ownership (Optional for Application)</h4>
          <p className="payout-proof-desc">
            Uploading a copy of your bank certificate, validated deposit slip, or header of your bank statement expedites disbursement activation.
          </p>
          <DocumentUploadCard
            docConfig={bankProofConfig}
            currentDoc={data.proofDocument}
            onUpload={handleProofUpload}
            onRemove={handleProofRemove}
            error={errors.proofDocument}
          />
        </div>
      </div>
    </div>
  );
}

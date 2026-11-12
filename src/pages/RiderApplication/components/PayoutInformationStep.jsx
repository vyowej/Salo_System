import { useState } from 'react';
import { Input, Select, FormGroup, Label } from '../../../components/forms';
import RiderDocumentUploadCard from './RiderDocumentUploadCard';
import {
  RIDER_PAYOUT_PROVIDERS,
  RIDER_PAYOUT_ACCOUNT_TYPES,
} from '../constants/riderApplicationDefaults';
import { RIDER_DOC_CATALOG, RIDER_DOC_TYPES } from '../constants/riderDocumentMatrix';
import './PayoutInformationStep.css';

export default function PayoutInformationStep({
  data,
  onChange,
  errors = {},
}) {
  const [showAccountNumber, setShowAccountNumber] = useState(false);

  const handleChange = (field, value) => {
    onChange?.({
      ...data,
      [field]: value,
    });
  };

  const handleProofUpload = (_id, fileData) => {
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

  return (
    <div className="rider-step-container rider-payout-step">
      <div className="rider-step-header">
        <h2 className="rider-step-heading">Rider Earnings & Payout Information</h2>
        <p className="rider-step-subheading">
          Configure your authorized bank account or e-wallet for weekly delivery fee payouts, fuel incentives, and tips.
        </p>
      </div>

      <div className="rider-security-callout rider-payout-security-callout">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        <div className="callout-copy">
          <strong>Settlement Confidentiality:</strong> Your payout account is used exclusively for electronic disbursements (via InstaPay or PESONet). No banking credentials or balance inquiries are performed in this frontend prototype.
        </div>
      </div>

      <div className="rider-form-grid rider-payout-form">
        <div className="grid-cols-2 rider-payout-fields">
          <Input
            id="payout-holder"
            label="Account Holder Full Name"
            placeholder="e.g. Juan Santos Dela Cruz"
            value={data.accountHolder || ''}
            onChange={(e) => handleChange('accountHolder', e.target.value)}
            error={errors.accountHolder}
            required
            helper="Must match your verified government identification."
          />

          <Select
            id="payout-provider"
            label="Payout Provider / Bank"
            value={data.provider || RIDER_PAYOUT_PROVIDERS[0]}
            onChange={(e) => handleChange('provider', e.target.value)}
            required
            helper="Choose your preferred e-wallet or depository bank."
          >
            {RIDER_PAYOUT_PROVIDERS.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid-cols-2 rider-payout-fields">
          <FormGroup>
            <div className="account-number-label-row rider-account-number-label-row">
              <Label htmlFor="payout-account-num" required>
                Account Number / Mobile Number
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
              placeholder="e.g. 09171234567 or 1029384756"
              value={data.accountNumber || ''}
              onChange={(e) => handleChange('accountNumber', e.target.value.replace(/\D/g, '').slice(0, 18))}
              error={errors.accountNumber}
              required
              helper="10 to 16 numeric digits without dashes."
            />
          </FormGroup>

          <Select
            id="payout-acc-type"
            label="Account Classification"
            value={data.accountType || RIDER_PAYOUT_ACCOUNT_TYPES[0]}
            onChange={(e) => handleChange('accountType', e.target.value)}
            required
          >
            {RIDER_PAYOUT_ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </div>

        {/* Optional Proof of Payout Ownership */}
        <div className="rider-subform-section rider-payout-proof">
          <h4 className="rider-subform-title">Proof of Account Ownership (Optional for Application)</h4>
          <p className="rider-subform-desc">
            Upload an e-wallet profile screenshot (showing your name & mobile number) or bank document header to accelerate disbursement setup.
          </p>
          <RiderDocumentUploadCard
            docConfig={{
              ...RIDER_DOC_CATALOG[RIDER_DOC_TYPES.PAYOUT_PROOF],
              required: false,
            }}
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

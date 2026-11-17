import { useEffect } from 'react';
import { Input, Select, ErrorMessage } from '../../../components/forms';
import LinkedAccountBanner from '../../../components/application/LinkedAccountBanner';
import { REPRESENTATIVE_POSITIONS } from '../constants/applicationDefaults';

function splitAccountName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

export default function RepresentativeInformationStep({
  data,
  onChange,
  verifiedEmail = '',
  errors = {},
  currentUser = null,
}) {
  const accountName = (currentUser?.name || '').trim();
  const hasAccountName = Boolean(accountName);

  const handleChange = (field, value) => {
    onChange?.({
      ...data,
      [field]: value,
    });
  };

  // Auto-populate name from authenticated SALO account and keep verified email synced
  useEffect(() => {
    const updates = {};
    if (accountName) {
      const { firstName, lastName } = splitAccountName(accountName);
      if (firstName && data.firstName !== firstName) updates.firstName = firstName;
      if (lastName && data.lastName !== lastName) updates.lastName = lastName;
    }
    if (verifiedEmail && data.email !== verifiedEmail) {
      updates.email = verifiedEmail;
    }
    if (Object.keys(updates).length > 0) {
      onChange?.({
        ...data,
        ...updates,
      });
    }
  }, [accountName, verifiedEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="wizard-step-container">
      <div className="wizard-step-header">
        <h2 className="wizard-step-heading">Owner & Authorized Representative</h2>
        <p className="wizard-step-subheading">
          Confirm the details of the authorized individual responsible for this restaurant partner application.
        </p>
      </div>

      <div className="wizard-form-grid">
        <LinkedAccountBanner
          accountName={accountName}
          verifiedEmail={verifiedEmail || data.email}
          roleLabel="Representative Name"
        />

        <div className="grid-cols-2">
          <Input
            id="rep-first-name"
            label="First Name"
            placeholder="e.g. Maria Clara"
            value={data.firstName || ''}
            onChange={(e) => handleChange('firstName', e.target.value)}
            error={errors.firstName}
            disabled={hasAccountName && Boolean(data.firstName)}
            helper={hasAccountName ? 'Populated from your SALO account.' : undefined}
            required
          />

          <Input
            id="rep-middle-name"
            label="Middle Name (Optional)"
            placeholder="e.g. Santos"
            value={data.middleName || ''}
            onChange={(e) => handleChange('middleName', e.target.value)}
          />
        </div>

        <div className="grid-cols-2">
          <Input
            id="rep-last-name"
            label="Last Name"
            placeholder="e.g. Dela Cruz"
            value={data.lastName || ''}
            onChange={(e) => handleChange('lastName', e.target.value)}
            error={errors.lastName}
            disabled={hasAccountName && Boolean(data.lastName)}
            helper={hasAccountName ? 'Populated from your SALO account.' : undefined}
            required
          />

          <Input
            id="rep-suffix"
            label="Suffix (Optional)"
            placeholder="e.g. Jr., III"
            value={data.suffix || ''}
            onChange={(e) => handleChange('suffix', e.target.value)}
          />
        </div>

        <div className="grid-cols-2">
          <Input
            id="rep-dob"
            type="date"
            label="Date of Birth"
            value={data.dateOfBirth || ''}
            onChange={(e) => handleChange('dateOfBirth', e.target.value)}
            error={errors.dateOfBirth}
            required
            helper="Applicants must be at least 18 years of age to enter merchant contracts."
          />

          <Select
            id="rep-position"
            label="Position / Relationship to Business"
            value={data.position || REPRESENTATIVE_POSITIONS[0]}
            onChange={(e) => handleChange('position', e.target.value)}
            required
            helper="If representative or manager, proof of authorization will be requested."
          >
            {REPRESENTATIVE_POSITIONS.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </Select>
        </div>

        <Input
          id="rep-phone"
          type="tel"
          label="Personal Mobile Number"
          placeholder="e.g. 0917-123-4567"
          value={data.phone || ''}
          onChange={(e) => handleChange('phone', e.target.value)}
          error={errors.phone}
          required
          helper="For two-factor merchant authentication and urgent notices."
        />

        {/* Legal Declaration */}
        <div className="wizard-checkbox-card">
          <label className="wizard-checkbox-label">
            <input
              type="checkbox"
              id="rep-authorized-decl"
              checked={Boolean(data.isAuthorized)}
              onChange={(e) => handleChange('isAuthorized', e.target.checked)}
              className="wizard-checkbox-input"
            />
            <span className="wizard-checkbox-text">
              <strong>Applicant Authorization Declaration:</strong> I certify that I am legally authorized
              by the business owner or governing board to submit this restaurant partner application, agree
              to terms, and manage merchant operations on SALO.
            </span>
          </label>
          {errors.isAuthorized && (
            <ErrorMessage>{errors.isAuthorized}</ErrorMessage>
          )}
        </div>
      </div>
    </div>
  );
}

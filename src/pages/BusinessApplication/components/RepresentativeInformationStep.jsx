import { useEffect, useState } from 'react';
import { Input, Select, ErrorMessage } from '../../../components/forms';
import { REPRESENTATIVE_POSITIONS } from '../constants/applicationDefaults';

export default function RepresentativeInformationStep({
  data,
  onChange,
  verifiedEmail = '',
  errors = {},
  currentUser = null,
}) {
  const [sameAsVerified, setSameAsVerified] = useState(
    Boolean(verifiedEmail && data.email === verifiedEmail)
  );

  const handleChange = (field, value) => {
    onChange?.({
      ...data,
      [field]: value,
    });
  };

  // Pre-fill from authenticated customer profile if representative info is empty
  useEffect(() => {
    if (currentUser && !data.firstName) {
      const nameParts = (currentUser.name || '').trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
      onChange?.({
        ...data,
        firstName: data.firstName || firstName,
        lastName: data.lastName || lastName,
        email: data.email || verifiedEmail || currentUser.email || '',
      });
    } else if (verifiedEmail && !data.email) {
      onChange?.({
        ...data,
        email: verifiedEmail,
      });
    }
  }, [currentUser, verifiedEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleSameEmail = (checked) => {
    setSameAsVerified(checked);
    if (checked && verifiedEmail) {
      handleChange('email', verifiedEmail);
    }
  };

  return (
    <div className="wizard-step-container">
      <div className="wizard-step-header">
        <h2 className="wizard-step-heading">Owner & Authorized Representative</h2>
        <p className="wizard-step-subheading">
          Enter the credentials of the authorized individual responsible for this application.
          The applicant does not need to be the sole registered owner, but must hold legal authorization.
        </p>
      </div>

      <div className="wizard-form-grid">
        <div className="grid-cols-2">
          <Input
            id="rep-first-name"
            label="First Name"
            placeholder="e.g. Maria Clara"
            value={data.firstName || ''}
            onChange={(e) => handleChange('firstName', e.target.value)}
            error={errors.firstName}
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

        <div className="grid-cols-2">
          <div>
            <Input
              id="rep-email"
              type="email"
              label="Personal / Representative Email"
              placeholder="e.g. mariaclara@example.com"
              value={data.email || ''}
              onChange={(e) => {
                setSameAsVerified(false);
                handleChange('email', e.target.value);
              }}
              error={errors.email}
              required
              helper={
                sameAsVerified
                  ? 'Same as verified business email.'
                  : 'Official merchant correspondence will be sent to this representative.'
              }
            />
            {verifiedEmail && (
              <label className="checkbox-inline-option">
                <input
                  type="checkbox"
                  checked={sameAsVerified}
                  onChange={(e) => handleToggleSameEmail(e.target.checked)}
                />
                <span>Same as verified business email ({verifiedEmail})</span>
              </label>
            )}
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
        </div>

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

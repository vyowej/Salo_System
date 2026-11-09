import { useState, useEffect } from 'react';
import { Input, Select } from '../../../components/forms';

const GENDER_OPTIONS = [
  'Prefer not to say',
  'Male',
  'Female',
  'Non-binary / Other',
];

export default function PersonalInformationStep({
  data,
  onChange,
  errors = {},
  currentUser = null,
}) {
  const [age, setAge] = useState(null);

  const handleChange = (field, value) => {
    onChange?.({
      ...data,
      [field]: value,
    });
  };

  const handleAddressChange = (addrField, value) => {
    onChange?.({
      ...data,
      address: {
        ...data.address,
        [addrField]: value,
      },
    });
  };

  // Prefill personal info from authenticated customer profile if available and not yet set
  useEffect(() => {
    if (currentUser && !data.firstName && !data.email) {
      const nameParts = (currentUser.name || '').trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
      onChange?.({
        ...data,
        firstName: data.firstName || firstName,
        lastName: data.lastName || lastName,
        email: data.email || currentUser.email || '',
        phone: data.phone || currentUser.phone || '',
      });
    }
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate age for instant feedback inside effect to preserve render purity
  useEffect(() => {
    if (data.dateOfBirth) {
      const dob = new Date(data.dateOfBirth);
      const diffMs = Date.now() - dob.getTime();
      const ageDt = new Date(diffMs);
      setAge(Math.abs(ageDt.getUTCFullYear() - 1970));
    } else {
      setAge(null);
    }
  }, [data.dateOfBirth]);

  return (
    <div className="wizard-step-container">
      <div className="wizard-step-header">
        <h2 className="wizard-step-heading">Personal & Contact Information</h2>
        <p className="wizard-step-subheading">
          Enter your legal personal credentials as they appear on your government-issued identity documents.
          As an existing SALO customer, your account profile is linked directly.
        </p>
      </div>

      {/* Age Requirement Callout */}
      <div className="rider-info-callout" role="note">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <div className="callout-content">
          <strong>Minimum Age Requirement:</strong> SALO delivery partners must be at least <strong>18 years of age</strong> to operate vehicles and enter courier agreements.
        </div>
      </div>

      <div className="rider-form-grid">
        <div className="grid-cols-2">
          <Input
            id="rider-first-name"
            label="First Name"
            placeholder="e.g. Juan"
            value={data.firstName || ''}
            onChange={(e) => handleChange('firstName', e.target.value)}
            error={errors.firstName}
            required
          />

          <Input
            id="rider-middle-name"
            label="Middle Name (Optional)"
            placeholder="e.g. Santos"
            value={data.middleName || ''}
            onChange={(e) => handleChange('middleName', e.target.value)}
          />
        </div>

        <div className="grid-cols-2">
          <Input
            id="rider-last-name"
            label="Last Name"
            placeholder="e.g. Dela Cruz"
            value={data.lastName || ''}
            onChange={(e) => handleChange('lastName', e.target.value)}
            error={errors.lastName}
            required
          />

          <Input
            id="rider-suffix"
            label="Suffix (Optional)"
            placeholder="e.g. Jr., III"
            value={data.suffix || ''}
            onChange={(e) => handleChange('suffix', e.target.value)}
          />
        </div>

        <div className="grid-cols-2">
          <div>
            <Input
              id="rider-dob"
              type="date"
              label="Date of Birth"
              value={data.dateOfBirth || ''}
              onChange={(e) => handleChange('dateOfBirth', e.target.value)}
              error={errors.dateOfBirth}
              required
              helper={
                age !== null && age < 18
                  ? '⚠️ You are currently under 18 years old and ineligible to apply as a rider.'
                  : age !== null
                  ? `Applicant age: ${age} years old.`
                  : 'Must be 18 years old or older.'
              }
            />
          </div>

          <Select
            id="rider-gender"
            label="Gender (Optional)"
            value={data.gender || GENDER_OPTIONS[0]}
            onChange={(e) => handleChange('gender', e.target.value)}
          >
            {GENDER_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid-cols-2">
          <Input
            id="rider-email"
            type="email"
            label="Email Address"
            placeholder="e.g. juandelacruz@example.com"
            value={data.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            error={errors.email}
            required
            helper={data.email ? 'Authenticated via Step 1 OTP ✓' : 'Contact email for courier dispatch.'}
          />

          <Input
            id="rider-phone"
            type="tel"
            label="Philippine Mobile Number"
            placeholder="e.g. 0917-123-4567"
            value={data.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
            error={errors.phone}
            required
            helper="Primary number for delivery dispatch and customer calls."
          />
        </div>

        {/* Residential Address Section */}
        <div className="rider-subform-section">
          <h3 className="rider-subform-title">Complete Residential Address</h3>
          <p className="rider-subform-desc">Where you currently reside. Used for zone routing and background clearances.</p>

          <div className="rider-form-grid" style={{ marginTop: 'var(--space-3)' }}>
            <Input
              id="rider-street"
              label="House / Unit / Building Number & Street"
              placeholder="e.g. Unit 2B, 45 Malakas St."
              value={data.address?.street || ''}
              onChange={(e) => handleAddressChange('street', e.target.value)}
              error={errors.street}
              required
            />

            <div className="grid-cols-2">
              <Input
                id="rider-barangay"
                label="Barangay"
                placeholder="e.g. Pinyahan"
                value={data.address?.barangay || ''}
                onChange={(e) => handleAddressChange('barangay', e.target.value)}
                error={errors.barangay}
                required
              />

              <Input
                id="rider-city"
                label="City / Municipality"
                placeholder="e.g. Quezon City"
                value={data.address?.city || ''}
                onChange={(e) => handleAddressChange('city', e.target.value)}
                error={errors.city}
                required
              />
            </div>

            <div className="grid-cols-2">
              <Input
                id="rider-province"
                label="Province / Region"
                placeholder="e.g. Metro Manila"
                value={data.address?.province || ''}
                onChange={(e) => handleAddressChange('province', e.target.value)}
                required
              />

              <Input
                id="rider-postal"
                label="Postal Code"
                placeholder="e.g. 1100"
                value={data.address?.postalCode || ''}
                onChange={(e) => handleAddressChange('postalCode', e.target.value.replace(/\D/g, '').slice(0, 4))}
                error={errors.postalCode}
                required
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

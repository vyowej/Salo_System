import { Input, Select } from '../../../components/forms';
import {
  EMERGENCY_RELATIONSHIPS,
  RIDER_SHIFTS,
  RIDER_DAYS_OF_WEEK,
} from '../constants/riderApplicationDefaults';
import './EmergencyContactStep.css';

export default function EmergencyContactStep({
  data,
  onChange,
  errors = {},
}) {
  const handleChange = (field, value) => {
    onChange?.({
      ...data,
      [field]: value,
    });
  };

  const handleShiftToggle = (shiftKey) => {
    const current = data.preferredShifts || [];
    const updated = current.includes(shiftKey)
      ? current.filter((k) => k !== shiftKey)
      : [...current, shiftKey];
    handleChange('preferredShifts', updated);
  };

  const handleDayToggle = (dayKey) => {
    const current = data.availableDays || [];
    const updated = current.includes(dayKey)
      ? current.filter((k) => k !== dayKey)
      : [...current, dayKey];
    handleChange('availableDays', updated);
  };

  return (
    <div className="rider-step-container rider-emergency-step">
      <div className="rider-step-header">
        <h2 className="rider-step-heading">Emergency Contact & Delivery Preferences</h2>
        <p className="rider-step-subheading">
          Provide trusted emergency contact details for on-road welfare support and configure your preferred delivery coverage zones and schedule.
        </p>
      </div>

      <div className="rider-form-grid">
        {/* Section 1: Emergency Contact */}
        <section className="rider-subform-section rider-emergency-section">
          <h3 className="rider-subform-title">Emergency Contact Details</h3>
          <p className="rider-subform-desc">
            Someone SALO Safety Support can immediately reach in case of an on-road accident, vehicle breakdown, or medical emergency.
          </p>

          <div className="rider-form-grid rider-emergency-fields">
            <div className="grid-cols-2">
              <Input
                id="em-name"
                label="Emergency Contact Full Name"
                placeholder="e.g. Maria Clara Dela Cruz"
                value={data.contactName || ''}
                onChange={(e) => handleChange('contactName', e.target.value)}
                error={errors.contactName}
                required
              />

              <Select
                id="em-relationship"
                label="Relationship to Applicant"
                value={data.relationship || EMERGENCY_RELATIONSHIPS[0]}
                onChange={(e) => handleChange('relationship', e.target.value)}
                required
              >
                {EMERGENCY_RELATIONSHIPS.map((rel) => (
                  <option key={rel} value={rel}>
                    {rel}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid-cols-2">
              <Input
                id="em-phone"
                type="tel"
                label="Emergency Mobile Number"
                placeholder="e.g. 0917-987-6543"
                value={data.phone || ''}
                onChange={(e) => handleChange('phone', e.target.value)}
                error={errors.phone}
                required
              />

              <Input
                id="em-alt-phone"
                type="tel"
                label="Alternative Contact Number (Optional)"
                placeholder="e.g. (02) 8-765-4321"
                value={data.altPhone || ''}
                onChange={(e) => handleChange('altPhone', e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Section 2: Delivery Preferences & Shifts */}
        <section className="rider-subform-section rider-emergency-section">
          <h3 className="rider-subform-title">Delivery Coverage & Working Schedule</h3>
          <p className="rider-subform-desc">
            Indicate the cities and neighborhoods where you prefer to receive delivery assignments.
          </p>

          <div className="rider-form-grid rider-emergency-fields">
            <div className="grid-cols-2">
              <Input
                id="pref-city"
                label="Preferred Base City / Municipality"
                placeholder="e.g. Quezon City, Makati City, Pasig City"
                value={data.preferredCity || ''}
                onChange={(e) => handleChange('preferredCity', e.target.value)}
                error={errors.preferredCity}
                required
                helper="Primary city where your shift begins."
              />

              <Input
                id="pref-hubs"
                label="Preferred Commercial Hubs / Dining Areas"
                placeholder="e.g. Tomas Morato, Eastwood City, BGC High St."
                value={data.preferredBarangayHubs || ''}
                onChange={(e) => handleChange('preferredBarangayHubs', e.target.value)}
                helper="Specific malls or street strips where you like waiting for orders."
              />
            </div>

            {/* Shift selections */}
            <fieldset className="rider-preference-group">
              <legend className="rider-pref-label">Preferred operating shifts <span>(select all that apply)</span></legend>
              <div className="rider-shifts-grid">
                {RIDER_SHIFTS.map((shift) => {
                  const isChecked = (data.preferredShifts || []).includes(shift.key);
                  return (
                    <label key={shift.key} className={`rider-shift-chip ${isChecked ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleShiftToggle(shift.key)}
                        className="rider-hidden-checkbox"
                      />
                      <span>{shift.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Days of week availability */}
            <fieldset className="rider-preference-group">
              <legend className="rider-pref-label">Weekly day availability</legend>
              <div className="rider-days-row">
                {RIDER_DAYS_OF_WEEK.map((day) => {
                  const isDayChecked = (data.availableDays || []).includes(day.key);
                  return (
                    <button
                      key={day.key}
                      type="button"
                      className={`rider-day-btn ${isDayChecked ? 'active' : ''}`}
                      aria-pressed={isDayChecked}
                      onClick={() => handleDayToggle(day.key)}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <p className="rider-field-disclaimer">
              * Note: Delivery assignment zones and shift availability are subject to actual SALO customer order volume and platform coverage.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

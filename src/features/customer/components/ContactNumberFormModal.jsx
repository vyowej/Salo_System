import { useEffect, useState } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import { Input } from '../../../components/forms';
import {
  isValidPhilippineMobile,
  normalizePhilippineMobile,
} from '../utils/checkoutAddressValidation';
import './ContactNumberFormModal.css';

const CONTACT_LABELS = ['Personal', 'Work', 'Other'];

function renderLabelIcon(label) {
  switch (label) {
    case 'Personal':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case 'Work':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </svg>
      );
    default:
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      );
  }
}

function buildInitialState(initialData, existingContacts = []) {
  if (initialData) {
    const rawLabel = String(initialData.label || 'Personal').trim();
    const isPreset = CONTACT_LABELS.includes(rawLabel);
    return {
      label: isPreset ? rawLabel : 'Other',
      customLabel: isPreset ? '' : rawLabel,
      phoneNumber: initialData.phoneNumber || '',
      isDefault: Boolean(initialData.isDefault),
    };
  }

  return {
    label: 'Personal',
    customLabel: '',
    phoneNumber: '',
    isDefault: existingContacts.length === 0,
  };
}

export default function ContactNumberFormModal({
  isOpen,
  onClose,
  onSave,
  initialData = null,
  existingContacts = [],
}) {
  const isEditing = Boolean(initialData?.id);
  const [formData, setFormData] = useState(() =>
    buildInitialState(initialData, existingContacts)
  );
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFormData(buildInitialState(initialData, existingContacts));
      setErrors({});
      setSubmitError('');
    }
  }, [isOpen, initialData, existingContacts]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');

    const nextErrors = {};
    const normalized = normalizePhilippineMobile(formData.phoneNumber);

    if (!normalized) {
      nextErrors.phoneNumber = 'Mobile number is required.';
    } else if (!isValidPhilippineMobile(normalized)) {
      nextErrors.phoneNumber = 'Enter a valid Philippine mobile number (e.g. 09171234567 or +639171234567).';
    } else {
      const duplicate = existingContacts.some(
        (item) =>
          item.id !== initialData?.id &&
          normalizePhilippineMobile(item.phoneNumber) === normalized
      );
      if (duplicate) {
        nextErrors.phoneNumber = 'This contact number is already saved.';
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const resolvedLabel =
      formData.label === 'Other' && formData.customLabel.trim()
        ? formData.customLabel.trim()
        : formData.label;

    try {
      await onSave?.({
        label: resolvedLabel,
        phoneNumber: normalized,
        isDefault: formData.isDefault,
      });
      onClose?.();
    } catch (err) {
      setSubmitError(err?.message || 'Unable to save contact number.');
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Contact Number' : 'Add Contact Number'}
      size="sm"
      footer={(
        <div className="salo-contact-form__footer">
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="salo-contact-number-form" variant="primary" size="md">
            {isEditing ? 'Save Changes' : 'Save Number'}
          </Button>
        </div>
      )}
    >
      <form
        id="salo-contact-number-form"
        className="salo-contact-form"
        onSubmit={handleSubmit}
        noValidate
      >
        {submitError && (
          <div className="salo-contact-form__alert" role="alert">
            {submitError}
          </div>
        )}

        <div className="salo-contact-form__group">
          <span className="salo-contact-form__label">
            Label <span className="salo-contact-form__required">*</span>
          </span>
          <div className="salo-contact-label-group" role="group" aria-label="Contact number label">
            {CONTACT_LABELS.map((option) => (
              <button
                key={option}
                type="button"
                className={`salo-contact-label-pill ${formData.label === option ? 'active' : ''}`}
                onClick={() => setFormData((prev) => ({ ...prev, label: option }))}
                aria-pressed={formData.label === option}
              >
                {renderLabelIcon(option)}
                <span>{option}</span>
              </button>
            ))}
          </div>
        </div>

        {formData.label === 'Other' && (
          <Input
            id="salo-contact-custom-label"
            label="Custom Label (optional)"
            placeholder="e.g. Home Landline, Family, Backup"
            maxLength={30}
            value={formData.customLabel}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, customLabel: e.target.value }))
            }
          />
        )}

        <Input
          id="salo-contact-phone-number"
          type="tel"
          label="Mobile Number"
          placeholder="e.g. 09171234567 or +639171234567"
          hint="Philippine mobile format (11 digits starting with 09, or +639)."
          value={formData.phoneNumber}
          onChange={(e) => {
            setFormData((prev) => ({ ...prev, phoneNumber: e.target.value }));
            if (errors.phoneNumber) {
              setErrors((prev) => ({ ...prev, phoneNumber: '' }));
            }
          }}
          error={errors.phoneNumber}
          required
        />

        <label className="salo-contact-form__default-toggle" htmlFor="salo-contact-is-default">
          <input
            id="salo-contact-is-default"
            type="checkbox"
            checked={formData.isDefault}
            disabled={isEditing && initialData?.isDefault && existingContacts.length <= 1}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, isDefault: e.target.checked }))
            }
          />
          <span className="salo-contact-form__default-copy">
            <span className="salo-contact-form__default-title">Set as default contact number</span>
            <span className="salo-contact-form__default-desc">
              Automatically selected for delivery updates at checkout.
            </span>
          </span>
        </label>
      </form>
    </Modal>
  );
}

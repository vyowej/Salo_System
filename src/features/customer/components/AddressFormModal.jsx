import { useState, useEffect, useRef, useCallback } from 'react';
import Button from '../../../components/common/Button';
import './AddressFormModal.css';

const PHILIPPINE_MOBILE_REGEX = /^(\+639|09)\d{9}$/;
const LABEL_OPTIONS = ['Home', 'Work', 'School', 'Other'];

export default function AddressFormModal({
  isOpen,
  onClose,
  onSave,
  initialData = null,
  existingAddresses = [],
  triggerRef = null,
}) {
  const isEditing = Boolean(initialData && initialData.id);
  const modalRef = useRef(null);
  const firstInputRef = useRef(null);

  const [formData, setFormData] = useState({
    label: 'Home',
    customLabel: '',
    recipientName: '',
    mobileNumber: '',
    street: '',
    barangay: '',
    city: '',
    province: '',
    postalCode: '',
    notes: '',
    isDefault: false,
    lat: null,
    lng: null,
  });

  const [errors, setErrors] = useState({});
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [locationStatus, setLocationStatus] = useState(null); // { type: 'success' | 'error', message: string }
  const [isLocating, setIsLocating] = useState(false);

  // Initialize or reset form when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      const isCustom = !LABEL_OPTIONS.slice(0, 3).includes(initialData.label);
      setFormData({
        label: isCustom ? 'Other' : initialData.label || 'Home',
        customLabel: isCustom ? initialData.label : initialData.customLabel || '',
        recipientName: initialData.recipientName || '',
        mobileNumber: initialData.mobileNumber || initialData.phone || '',
        street: initialData.street || '',
        barangay: initialData.barangay || '',
        city: initialData.city || '',
        province: initialData.province || '',
        postalCode: initialData.postalCode || '',
        notes: initialData.notes || '',
        isDefault: Boolean(initialData.isDefault),
        lat: initialData.lat ?? null,
        lng: initialData.lng ?? null,
      });
    } else {
      setFormData({
        label: 'Home',
        customLabel: '',
        recipientName: '',
        mobileNumber: '',
        street: '',
        barangay: '',
        city: '',
        province: '',
        postalCode: '',
        notes: '',
        isDefault: existingAddresses.length === 0,
        lat: null,
        lng: null,
      });
    }

    setErrors({});
    setDuplicateWarning(false);
    setLocationStatus(null);

    // Focus first focusable element after modal opens
    setTimeout(() => {
      if (firstInputRef.current) {
        firstInputRef.current.focus();
      }
    }, 50);
  }, [isOpen, initialData, existingAddresses.length]);

  const handleClose = useCallback(() => {
    onClose();
    if (triggerRef && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [onClose, triggerRef]);

  // Focus trap & Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose]);

  const handleFieldChange = (field, value) => {
    const nextFormData = { ...formData, [field]: value };
    setFormData(nextFormData);

    // Clear field-specific error if corrected
    if (errors[field]) {
      setErrors((prev) => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }

    // Check duplicate warning if street, barangay, or city changes
    if (['street', 'barangay', 'city'].includes(field)) {
      const s = (nextFormData.street || '').trim().toLowerCase();
      const b = (nextFormData.barangay || '').trim().toLowerCase();
      const c = (nextFormData.city || '').trim().toLowerCase();

      if (s && c) {
        const hasDup = existingAddresses.some((addr) => {
          if (initialData?.id && addr.id === initialData.id) return false;
          return (
            (addr.street || '').trim().toLowerCase() === s &&
            (addr.barangay || '').trim().toLowerCase() === b &&
            (addr.city || '').trim().toLowerCase() === c
          );
        });
        setDuplicateWarning(hasDup);
      } else {
        setDuplicateWarning(false);
      }
    }
  };

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus({
        type: 'error',
        message: 'Geolocation is not supported on this device or browser.',
      });
      return;
    }

    setIsLocating(true);
    setLocationStatus(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude, longitude } = position.coords;
        setFormData((prev) => ({
          ...prev,
          lat: latitude,
          lng: longitude,
        }));
        setLocationStatus({
          type: 'success',
          message: `Coordinates captured (${latitude.toFixed(4)}, ${longitude.toFixed(4)}).`,
        });
      },
      (error) => {
        setIsLocating(false);
        let message = 'Unable to retrieve location coordinates.';
        if (error.code === error.PERMISSION_DENIED) {
          message = 'Location access was denied. You can continue by entering your address manually.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = 'Location information is currently unavailable.';
        } else if (error.code === error.TIMEOUT) {
          message = 'Location request timed out. Please try again or fill fields manually.';
        }
        setLocationStatus({
          type: 'error',
          message,
        });
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const validate = () => {
    const nextErrors = {};

    if (!formData.recipientName.trim()) {
      nextErrors.recipientName = 'Recipient name is required.';
    }

    const cleanMobile = formData.mobileNumber.replace(/\s+/g, '');
    if (!cleanMobile) {
      nextErrors.mobileNumber = 'Mobile number is required.';
    } else if (!PHILIPPINE_MOBILE_REGEX.test(cleanMobile)) {
      nextErrors.mobileNumber = 'Please enter a valid Philippine mobile number (e.g. 09171234567 or +639171234567).';
    }

    if (!formData.street.trim()) {
      nextErrors.street = 'Street name, building, or unit details are required.';
    }

    if (!formData.barangay.trim()) {
      nextErrors.barangay = 'Barangay is required.';
    }

    if (!formData.city.trim()) {
      nextErrors.city = 'City or municipality is required.';
    }

    if (!formData.province.trim()) {
      nextErrors.province = 'Province is required.';
    }

    if (formData.label === 'Other' && !formData.customLabel.trim()) {
      nextErrors.customLabel = 'Please specify a name for this custom label.';
    }

    if (formData.notes && formData.notes.length > 200) {
      nextErrors.notes = 'Delivery notes must not exceed 200 characters.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    // Check soft limit for new addresses
    if (!isEditing && existingAddresses.length >= 10) {
      setErrors({
        general: 'Address limit reached (maximum 10 saved addresses). Please edit or delete an existing address.',
      });
      return;
    }

    const effectiveLabel = formData.label === 'Other'
      ? formData.customLabel.trim()
      : formData.label;

    const payload = {
      ...(initialData || {}),
      label: effectiveLabel,
      customLabel: formData.label === 'Other' ? formData.customLabel.trim() : '',
      recipientName: formData.recipientName.trim(),
      mobileNumber: formData.mobileNumber.trim(),
      phone: formData.mobileNumber.trim(),
      street: formData.street.trim(),
      barangay: formData.barangay.trim(),
      city: formData.city.trim(),
      province: formData.province.trim(),
      postalCode: formData.postalCode.trim(),
      notes: formData.notes.slice(0, 200).trim(),
      isDefault: Boolean(formData.isDefault),
      lat: formData.lat,
      lng: formData.lng,
    };

    onSave(payload);
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="salo-address-modal-backdrop"
      role="presentation"
      onClick={handleClose}
    >
      <div
        className="salo-address-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="address-modal-title"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="salo-address-modal-header">
          <h2 id="address-modal-title" className="salo-address-modal-title">
            {isEditing ? 'Edit Delivery Address' : 'Add New Delivery Address'}
          </h2>
          <button
            type="button"
            className="salo-address-modal-close"
            onClick={handleClose}
            aria-label="Close address form modal"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form id="salo-address-form" onSubmit={handleSubmit} className="salo-address-modal-body">
          {errors.general && (
            <div className="salo-address-warning" role="alert">
              {errors.general}
            </div>
          )}

          {duplicateWarning && (
            <div className="salo-address-warning" role="status">
              ⚠️ An address with this street, barangay, and city already exists. You can still save it if this is intended.
            </div>
          )}

          {/* Label selector */}
          <div className="salo-form-group">
            <span className="salo-form-label" id="label-group-label">
              Address Label <span className="required-indicator">*</span>
            </span>
            <div className="salo-address-label-group" role="radiogroup" aria-labelledby="label-group-label">
              {LABEL_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={formData.label === opt}
                  className={`salo-address-label-pill ${formData.label === opt ? 'active' : ''}`}
                  onClick={() => handleFieldChange('label', opt)}
                >
                  {opt === 'Home' && '🏠 '}
                  {opt === 'Work' && '💼 '}
                  {opt === 'School' && '🎓 '}
                  {opt === 'Other' && '📍 '}
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Label input if 'Other' selected */}
          {formData.label === 'Other' && (
            <div className="salo-form-group">
              <label htmlFor="addr-custom-label" className="salo-form-label">
                Custom Label Name <span className="required-indicator">*</span>
              </label>
              <input
                id="addr-custom-label"
                type="text"
                className={`salo-form-input ${errors.customLabel ? 'is-invalid' : ''}`}
                placeholder="e.g. Grandma's House, Studio, Beach Condo"
                value={formData.customLabel}
                onChange={(e) => handleFieldChange('customLabel', e.target.value)}
                aria-invalid={Boolean(errors.customLabel)}
                aria-describedby={errors.customLabel ? 'custom-label-error' : undefined}
                required
              />
              {errors.customLabel && (
                <span id="custom-label-error" className="salo-form-error" role="alert">
                  {errors.customLabel}
                </span>
              )}
            </div>
          )}

          {/* Recipient & Contact Number */}
          <div className="salo-form-grid-2">
            <div className="salo-form-group">
              <label htmlFor="addr-recipient" className="salo-form-label">
                Recipient Name <span className="required-indicator">*</span>
              </label>
              <input
                id="addr-recipient"
                ref={firstInputRef}
                type="text"
                className={`salo-form-input ${errors.recipientName ? 'is-invalid' : ''}`}
                placeholder="e.g. Cassandra Villafuerte"
                value={formData.recipientName}
                onChange={(e) => handleFieldChange('recipientName', e.target.value)}
                aria-invalid={Boolean(errors.recipientName)}
                aria-describedby={errors.recipientName ? 'recipient-error' : undefined}
                required
              />
              {errors.recipientName && (
                <span id="recipient-error" className="salo-form-error" role="alert">
                  {errors.recipientName}
                </span>
              )}
            </div>

            <div className="salo-form-group">
              <label htmlFor="addr-mobile" className="salo-form-label">
                Mobile Number <span className="required-indicator">*</span>
              </label>
              <input
                id="addr-mobile"
                type="tel"
                className={`salo-form-input ${errors.mobileNumber ? 'is-invalid' : ''}`}
                placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                value={formData.mobileNumber}
                onChange={(e) => handleFieldChange('mobileNumber', e.target.value)}
                aria-invalid={Boolean(errors.mobileNumber)}
                aria-describedby={errors.mobileNumber ? 'mobile-error' : undefined}
                required
              />
              {errors.mobileNumber && (
                <span id="mobile-error" className="salo-form-error" role="alert">
                  {errors.mobileNumber}
                </span>
              )}
            </div>
          </div>

          {/* Street, Unit, House # */}
          <div className="salo-form-group">
            <label htmlFor="addr-street" className="salo-form-label">
              Street Name / Building / House / Unit <span className="required-indicator">*</span>
            </label>
            <input
              id="addr-street"
              type="text"
              className={`salo-form-input ${errors.street ? 'is-invalid' : ''}`}
              placeholder="e.g. Unit 12B, Emerald Court, San Antonio / Lot 14 Block 2"
              value={formData.street}
              onChange={(e) => handleFieldChange('street', e.target.value)}
              aria-invalid={Boolean(errors.street)}
              aria-describedby={errors.street ? 'street-error' : undefined}
              required
            />
            {errors.street && (
              <span id="street-error" className="salo-form-error" role="alert">
                {errors.street}
              </span>
            )}
          </div>

          {/* Barangay & City */}
          <div className="salo-form-grid-2">
            <div className="salo-form-group">
              <label htmlFor="addr-barangay" className="salo-form-label">
                Barangay <span className="required-indicator">*</span>
              </label>
              <input
                id="addr-barangay"
                type="text"
                className={`salo-form-input ${errors.barangay ? 'is-invalid' : ''}`}
                placeholder="e.g. Tetuan / San Antonio"
                value={formData.barangay}
                onChange={(e) => handleFieldChange('barangay', e.target.value)}
                aria-invalid={Boolean(errors.barangay)}
                aria-describedby={errors.barangay ? 'barangay-error' : undefined}
                required
              />
              {errors.barangay && (
                <span id="barangay-error" className="salo-form-error" role="alert">
                  {errors.barangay}
                </span>
              )}
            </div>

            <div className="salo-form-group">
              <label htmlFor="addr-city" className="salo-form-label">
                City / Municipality <span className="required-indicator">*</span>
              </label>
              <input
                id="addr-city"
                type="text"
                className={`salo-form-input ${errors.city ? 'is-invalid' : ''}`}
                placeholder="e.g. Zamboanga City / Pasig City"
                value={formData.city}
                onChange={(e) => handleFieldChange('city', e.target.value)}
                aria-invalid={Boolean(errors.city)}
                aria-describedby={errors.city ? 'city-error' : undefined}
                required
              />
              {errors.city && (
                <span id="city-error" className="salo-form-error" role="alert">
                  {errors.city}
                </span>
              )}
            </div>
          </div>

          {/* Province & Postal Code */}
          <div className="salo-form-grid-2">
            <div className="salo-form-group">
              <label htmlFor="addr-province" className="salo-form-label">
                Province <span className="required-indicator">*</span>
              </label>
              <input
                id="addr-province"
                type="text"
                className={`salo-form-input ${errors.province ? 'is-invalid' : ''}`}
                placeholder="e.g. Zamboanga del Sur / Metro Manila"
                value={formData.province}
                onChange={(e) => handleFieldChange('province', e.target.value)}
                aria-invalid={Boolean(errors.province)}
                aria-describedby={errors.province ? 'province-error' : undefined}
                required
              />
              {errors.province && (
                <span id="province-error" className="salo-form-error" role="alert">
                  {errors.province}
                </span>
              )}
            </div>

            <div className="salo-form-group">
              <label htmlFor="addr-postal" className="salo-form-label">
                Postal Code <span style={{ color: 'var(--text-muted)' }}>(Optional)</span>
              </label>
              <input
                id="addr-postal"
                type="text"
                className="salo-form-input"
                placeholder="e.g. 7000 / 1600"
                value={formData.postalCode}
                onChange={(e) => handleFieldChange('postalCode', e.target.value)}
              />
            </div>
          </div>

          {/* Geolocation Button */}
          <div className="salo-form-group">
            <button
              type="button"
              className="salo-location-btn"
              onClick={handleUseLocation}
              disabled={isLocating}
            >
              <span>📍</span>
              <span>{isLocating ? 'Detecting coordinates...' : 'Use my current location (GPS coordinates)'}</span>
            </button>
            {locationStatus && (
              <span className={`salo-location-feedback ${locationStatus.type}`} role="status">
                {locationStatus.message}
              </span>
            )}
          </div>

          {/* Delivery Notes / Landmark */}
          <div className="salo-form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="addr-notes" className="salo-form-label">
                Landmark or Rider Instructions <span style={{ color: 'var(--text-muted)' }}>(Optional)</span>
              </label>
              <span style={{ fontSize: 11, color: formData.notes.length > 200 ? 'var(--salo-error)' : 'var(--text-muted)' }}>
                {formData.notes.length}/200
              </span>
            </div>
            <textarea
              id="addr-notes"
              className={`salo-form-textarea ${errors.notes ? 'is-invalid' : ''}`}
              placeholder="e.g. Gate with blue iron bars, ring the doorbell twice, near San Roque church"
              maxLength={200}
              value={formData.notes}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              aria-invalid={Boolean(errors.notes)}
              aria-describedby={errors.notes ? 'notes-error' : undefined}
            />
            {errors.notes && (
              <span id="notes-error" className="salo-form-error" role="alert">
                {errors.notes}
              </span>
            )}
          </div>

          {/* Set as Default Checkbox */}
          <label className="salo-checkbox-row">
            <input
              type="checkbox"
              className="salo-checkbox-input"
              checked={formData.isDefault}
              onChange={(e) => handleFieldChange('isDefault', e.target.checked)}
            />
            <span className="salo-checkbox-label">Set as default delivery address</span>
          </label>
        </form>

        {/* Modal Footer */}
        <div className="salo-address-modal-footer">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="salo-address-form"
            variant="primary"
            size="md"
          >
            {isEditing ? 'Save Changes' : 'Save Address'}
          </Button>
        </div>
      </div>
    </div>
  );
}



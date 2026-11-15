import { useState, useEffect, useRef, useCallback } from 'react';
import Button from '../../../components/common/Button';
import { LocationPicker } from '../../../components/location';
import locationApiService from '../../../services/locationApiService';
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
    houseNumber: '',
    barangay: '',
    city: '',
    province: '',
    postalCode: '',
    notes: '',
    isDefault: false,
    lat: null,
    lng: null,
    gpsAccuracy: null,
  });

  const [errors, setErrors] = useState({});
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [serviceAreaStatus, setServiceAreaStatus] = useState(null);

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
        houseNumber: initialData.houseNumber || initialData.house_number || '',
        barangay: initialData.barangay || '',
        city: initialData.city || '',
        province: initialData.province || '',
        postalCode: initialData.postalCode || '',
        notes: initialData.notes || '',
        isDefault: Boolean(initialData.isDefault),
        lat: initialData.lat ?? initialData.latitude ?? null,
        lng: initialData.lng ?? initialData.longitude ?? null,
        gpsAccuracy: initialData.gpsAccuracy ?? initialData.gps_accuracy ?? null,
      });
    } else {
      setFormData({
        label: 'Home',
        customLabel: '',
        recipientName: '',
        mobileNumber: '',
        street: '',
        houseNumber: '',
        barangay: '',
        city: '',
        province: '',
        postalCode: '',
        notes: '',
        isDefault: existingAddresses.length === 0,
        lat: null,
        lng: null,
        gpsAccuracy: null,
      });
    }

    setErrors({});
    setDuplicateWarning(false);
    setServiceAreaStatus(null);

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

  // Check SALO platform service area status when province + city are filled
  useEffect(() => {
    if (!isOpen || !formData.province?.trim() || !formData.city?.trim()) {
      setServiceAreaStatus(null);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await locationApiService.validateServiceArea({
          province: formData.province.trim(),
          city: formData.city.trim(),
          barangay: formData.barangay?.trim() || null,
        });
        if (!cancelled && res) {
          setServiceAreaStatus({
            supported: Boolean(res.supported),
            reason: res.reason,
          });
        }
      } catch {
        if (!cancelled) setServiceAreaStatus(null);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, formData.province, formData.city, formData.barangay]);

  const handleLocationPickerChange = (nextLoc) => {
    setFormData((prev) => ({
      ...prev,
      province: nextLoc.province ?? prev.province,
      city: nextLoc.city ?? prev.city,
      barangay: nextLoc.barangay ?? prev.barangay,
      street: nextLoc.street ?? prev.street,
      houseNumber: nextLoc.houseNumber ?? prev.houseNumber,
      postalCode: nextLoc.postalCode ?? prev.postalCode,
      notes: nextLoc.notes ?? prev.notes,
      lat: nextLoc.lat ?? prev.lat,
      lng: nextLoc.lng ?? prev.lng,
      gpsAccuracy: nextLoc.gpsAccuracy ?? prev.gpsAccuracy,
    }));
    setErrors((prev) => {
      const updated = { ...prev };
      delete updated.province;
      delete updated.city;
      delete updated.barangay;
      delete updated.street;
      return updated;
    });
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
      houseNumber: formData.houseNumber.trim(),
      barangay: formData.barangay.trim(),
      city: formData.city.trim(),
      province: formData.province.trim(),
      postalCode: formData.postalCode.trim(),
      notes: formData.notes.slice(0, 200).trim(),
      isDefault: Boolean(formData.isDefault),
      lat: formData.lat,
      lng: formData.lng,
      gpsAccuracy: formData.gpsAccuracy,
      isServiceAreaSupported: serviceAreaStatus ? serviceAreaStatus.supported : undefined,
      serviceAreaMessage: serviceAreaStatus ? serviceAreaStatus.reason : undefined,
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

          {/* Interactive Map, GPS, Searchable Philippine Address Fields & Confirmation */}
          <LocationPicker
            value={formData}
            onChange={handleLocationPickerChange}
            errors={errors}
            mapHeight={240}
            serviceAreaStatus={serviceAreaStatus}
            confirmLabel="Delivery Location Confirmation"
          />

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



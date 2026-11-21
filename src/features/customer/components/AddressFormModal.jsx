import { useState, useEffect, useRef, useCallback } from 'react';
import Button from '../../../components/common/Button';
import { LocationPicker } from '../../../components/location';
import locationApiService from '../../../services/locationApiService';
import './AddressFormModal.css';

const LABEL_OPTIONS = ['Home', 'Work', 'School', 'Other'];

function renderLabelIcon(label) {
  switch (label) {
    case 'Home':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z" />
        </svg>
      );
    case 'Work':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </svg>
      );
    case 'School':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 10L12 5 2 10l10 5 10-5z" />
          <path d="M6 12.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5" />
        </svg>
      );
    default:
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
  }
}

function buildInitialAddressState(initialData, existingAddresses = []) {
  if (initialData) {
    const hasCustomLabel = Boolean(initialData.label && !LABEL_OPTIONS.slice(0, 3).includes(initialData.label));
    return {
      label: hasCustomLabel ? 'Other' : initialData.label || 'Home',
      customLabel: hasCustomLabel ? initialData.label : initialData.customLabel || '',
      street: initialData.street || '',
      houseNumber: initialData.houseNumber || initialData.house_number || '',
      barangay: initialData.barangay || '',
      city: initialData.city || '',
      province: initialData.province || '',
      postalCode: initialData.postalCode || initialData.postal_code || '',
      notes: initialData.notes || initialData.landmark || '',
      isDefault: initialData.isDefault !== undefined ? Boolean(initialData.isDefault) : existingAddresses.length === 0,
      lat: initialData.lat ?? initialData.latitude ?? null,
      lng: initialData.lng ?? initialData.longitude ?? null,
      gpsAccuracy: initialData.gpsAccuracy ?? initialData.gps_accuracy ?? null,
    };
  }

  return {
    label: 'Home',
    customLabel: '',
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
  };
}

/**
 * Reusable Customer Address Form
 * Shared between the Addresses Page (via AddressFormModal) and Customer Onboarding Step 3.
 */
export function CustomerAddressForm({
  formId = 'salo-address-form',
  initialData = null,
  existingAddresses = [],
  onSave,
  firstInputRef: externalFirstInputRef = null,
  mapHeight = 240,
  hideDefaultToggle = false,
  externalError = '',
  className = '',
}) {
  const isEditing = Boolean(initialData && initialData.id);
  const internalFirstInputRef = useRef(null);
  const firstInputRef = externalFirstInputRef || internalFirstInputRef;

  const [formData, setFormData] = useState(() => buildInitialAddressState(initialData, existingAddresses));
  const [errors, setErrors] = useState({});
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [serviceAreaStatus, setServiceAreaStatus] = useState(null);

  useEffect(() => {
    setFormData(buildInitialAddressState(initialData, existingAddresses));
    setErrors({});
    setDuplicateWarning(false);
    setServiceAreaStatus(null);
  }, [initialData, existingAddresses]);

  const handleFieldChange = (field, value) => {
    const nextFormData = { ...formData, [field]: value };
    setFormData(nextFormData);

    if (errors[field]) {
      setErrors((prev) => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }

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

  useEffect(() => {
    if (!formData.province?.trim() || !formData.city?.trim()) {
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
  }, [formData.province, formData.city, formData.barangay]);

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
      street: formData.street.trim(),
      houseNumber: formData.houseNumber.trim(),
      barangay: formData.barangay.trim(),
      city: formData.city.trim(),
      province: formData.province.trim(),
      postalCode: formData.postalCode.trim(),
      notes: formData.notes.slice(0, 200).trim(),
      isDefault: existingAddresses.length === 0 ? true : Boolean(formData.isDefault),
      lat: formData.lat,
      lng: formData.lng,
      gpsAccuracy: formData.gpsAccuracy,
      isServiceAreaSupported: serviceAreaStatus ? serviceAreaStatus.supported : undefined,
      serviceAreaMessage: serviceAreaStatus ? serviceAreaStatus.reason : undefined,
    };

    onSave?.(payload);
  };

  const bannerError = externalError || errors.general;

  return (
    <form id={formId} onSubmit={handleSubmit} className={`salo-address-modal-body ${className}`.trim()} noValidate>
      {bannerError && (
        <div className="salo-address-warning" role="alert">
          {bannerError}
        </div>
      )}

      {duplicateWarning && (
        <div className="salo-address-warning" role="status">
          An address with this street, barangay, and city already exists. You can still save it if this is intended.
        </div>
      )}

      {/* Label selector */}
      <div className="salo-form-group">
        <span className="salo-form-label" id={`${formId}-label-group`}>
          Address Label <span className="required-indicator">*</span>
        </span>
        <div className="salo-address-label-group" role="radiogroup" aria-labelledby={`${formId}-label-group`}>
          {LABEL_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={formData.label === opt}
              className={`salo-address-label-pill ${formData.label === opt ? 'active' : ''}`}
              onClick={() => handleFieldChange('label', opt)}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {renderLabelIcon(opt)}
                <span>{opt}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Label input if 'Other' selected */}
      {formData.label === 'Other' && (
        <div className="salo-form-group">
          <label htmlFor={`${formId}-custom-label`} className="salo-form-label">
            Custom Label Name <span className="required-indicator">*</span>
          </label>
          <input
            id={`${formId}-custom-label`}
            type="text"
            className={`salo-form-input ${errors.customLabel ? 'is-invalid' : ''}`}
            placeholder="e.g. Grandma's House, Studio, Beach Condo"
            value={formData.customLabel}
            onChange={(e) => handleFieldChange('customLabel', e.target.value)}
            aria-invalid={Boolean(errors.customLabel)}
            aria-describedby={errors.customLabel ? `${formId}-custom-label-error` : undefined}
            required
          />
          {errors.customLabel && (
            <span id={`${formId}-custom-label-error`} className="salo-form-error" role="alert">
              {errors.customLabel}
            </span>
          )}
        </div>
      )}

      {/* Interactive Map, GPS, Searchable Philippine Address Fields & Confirmation */}
      <LocationPicker
        value={formData}
        onChange={handleLocationPickerChange}
        errors={errors}
        mapHeight={mapHeight}
        serviceAreaStatus={serviceAreaStatus}
        confirmLabel="Delivery Location Confirmation"
      />

      {/* Set as Default Checkbox */}
      {!hideDefaultToggle && (
        <label className="salo-checkbox-row">
          <input
            type="checkbox"
            className="salo-checkbox-input"
            checked={formData.isDefault}
            onChange={(e) => handleFieldChange('isDefault', e.target.checked)}
          />
          <span className="salo-checkbox-label">Set as default delivery address</span>
        </label>
      )}
    </form>
  );
}

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

  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = setTimeout(() => {
      firstInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const handleClose = useCallback(() => {
    onClose();
    if (triggerRef && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [onClose, triggerRef]);

  useEffect(() => {
    if (!isOpen) return undefined;

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
        } else if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose]);

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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <CustomerAddressForm
          formId="salo-address-form"
          initialData={initialData}
          existingAddresses={existingAddresses}
          firstInputRef={firstInputRef}
          onSave={(payload) => {
            onSave(payload);
            handleClose();
          }}
        />

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

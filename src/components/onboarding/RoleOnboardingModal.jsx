import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import BrandMark from '../common/BrandMark';
import Button from '../common/Button';
import { CustomerAddressForm } from '../../features/customer/components/AddressFormModal';
import accountService from '../../services/accountService';
import locationApiService from '../../services/locationApiService';
import addressService from '../../services/addressService';
import {
  ONBOARDING_CONTENT_BY_ROLE,
  SHARED_ONBOARDING_CONTENT,
  interpolateCopy,
} from '../../config/onboarding';
import {
  normalizeOnboardingRole,
  normalizePhilippineMobile,
  isValidPhilippineMobile,
  deriveRiderGoOnlineChecklist,
} from '../../services/onboardingService';
import './RoleOnboardingModal.css';

function renderStepIcon(iconName) {
  switch (iconName) {
    case 'phone':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      );
    case 'pin':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
    case 'clock':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case 'route':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="6" cy="19" r="3" />
          <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
          <circle cx="18" cy="5" r="3" />
        </svg>
      );
    case 'bell':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case 'shield':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'cash':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M6 12h.01M18 12h.01" />
        </svg>
      );
    case 'card':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      );
    case 'store':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case 'receipt':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case 'sliders':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      );
    case 'users':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    default:
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
  }
}

/**
 * Reusable Role-Based Onboarding Modal
 * Supports Customer, Rider, and Business / Restaurant Owner roles using role content configs.
 */
export function RoleOnboardingModal({
  open,
  role,
  user,
  onComplete,
  onSkip,
  updateUser,
  customerAddresses = [],
  riderDashboardData = null,
  businessChecklist = null,
}) {
  const navigate = useNavigate();
  const normalizedRole = normalizeOnboardingRole(role);
  const content = ONBOARDING_CONTENT_BY_ROLE[normalizedRole];
  const steps = content?.steps || [];

  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const primaryActionRef = useRef(null);
  const phoneInputRef = useRef(null);
  const addressFirstInputRef = useRef(null);
  const skipCancelBtnRef = useRef(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [confirmingSkip, setConfirmingSkip] = useState(false);
  const [anyStepSkipped, setAnyStepSkipped] = useState(false);

  // Customer Step 2 & 3 states
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [addressError, setAddressError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedPhoneValue, setSavedPhoneValue] = useState('');
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [addressSaved, setAddressSaved] = useState(false);

  // Rider Step 3 location permission state (passive read only; never prompts until button clicked)
  const [locationPermission, setLocationPermission] = useState('prompt');
  const [requestingLocation, setRequestingLocation] = useState(false);

  const currentStep = steps[stepIndex] || steps[0];
  const isFinishStep = currentStep?.kind === 'finish';
  const isAddressStep = currentStep?.kind === 'address';

  // Capture previously focused element when opening, and restore focus when closing
  useEffect(() => {
    if (!open) return undefined;

    if (typeof document !== 'undefined') {
      previousFocusRef.current = document.activeElement;
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = prevOverflow;
        if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
          try {
            previousFocusRef.current.focus();
          } catch {
            // Ignore if element is unmounted
          }
        }
      };
    }
    return undefined;
  }, [open]);

  // Reset modal internal state when opened for a role/user session
  const activeSessionKeyRef = useRef('');
  useEffect(() => {
    if (!open) {
      activeSessionKeyRef.current = '';
      return;
    }
    const sessionKey = `${normalizedRole}:${user?.user_id ?? user?.id ?? 'anon'}`;
    if (activeSessionKeyRef.current === sessionKey) {
      return;
    }
    activeSessionKeyRef.current = sessionKey;
    const initialPhone = user?.phone_number || user?.phone || '';
    setStepIndex(0);
    setConfirmingSkip(false);
    setAnyStepSkipped(false);
    setPhoneInput(initialPhone);
    setPhoneError('');
    setAddressError('');
    setSaving(false);
    setSavedPhoneValue(initialPhone);
    setPhoneSaved(false);
    setAddressSaved(false);
  }, [open, normalizedRole, user?.user_id, user?.id, user?.phone_number, user?.phone]);

  // Passive check of browser geolocation permission state on Rider Step 3 (never triggers prompt)
  useEffect(() => {
    if (!open || normalizedRole !== 'rider') return undefined;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationPermission('unsupported');
      return undefined;
    }
    if (!navigator.permissions || typeof navigator.permissions.query !== 'function') {
      return undefined;
    }

    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (!cancelled && status?.state) {
          setLocationPermission(status.state);
        }
      })
      .catch(() => {
        // Ignore if permissions API is restricted
      });

    return () => {
      cancelled = true;
    };
  }, [open, normalizedRole]);

  // Move focus appropriately on step change or skip confirmation toggle
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => {
      if (confirmingSkip) {
        skipCancelBtnRef.current?.focus();
        return;
      }
      if (currentStep?.kind === 'phone' && phoneInputRef.current) {
        phoneInputRef.current.focus();
        return;
      }
      if (currentStep?.kind === 'address' && addressFirstInputRef.current) {
        addressFirstInputRef.current.focus();
        return;
      }
      if (primaryActionRef.current) {
        primaryActionRef.current.focus();
        return;
      }
      dialogRef.current?.focus();
    }, 30);

    return () => clearTimeout(timer);
  }, [open, stepIndex, confirmingSkip, currentStep?.kind]);

  const requestWholeSkip = useCallback(() => {
    if (saving) return;
    if (isFinishStep) {
      onComplete?.();
      return;
    }
    setConfirmingSkip(true);
  }, [saving, isFinishStep, onComplete]);

  // Keyboard navigation: Escape triggers skip confirmation, Tab traps focus inside dialog
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        requestWholeSkip();
        return;
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === first || !dialogRef.current.contains(document.activeElement)) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last || !dialogRef.current.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, requestWholeSkip]);

  if (!open || !content || !currentStep) return null;

  const username =
    user?.username ||
    user?.first_name ||
    (user?.name ? String(user.name).split(/\s+/)[0] : '') ||
    currentStep.fallbackUsername ||
    '';

  const stepTitle = currentStep.titleTemplate
    ? interpolateCopy(currentStep.titleTemplate, { username })
    : currentStep.title;

  const progressText = interpolateCopy(SHARED_ONBOARDING_CONTENT.progressLabelTemplate, {
    current: stepIndex + 1,
    total: steps.length,
  });

  const handleConfirmWholeSkip = () => {
    setConfirmingSkip(false);
    onSkip?.();
  };

  const handleCancelWholeSkip = () => {
    setConfirmingSkip(false);
  };

  const handleStepSkip = () => {
    if (saving) return;
    setPhoneError('');
    setAddressError('');
    setAnyStepSkipped(true);
    setStepIndex((idx) => Math.min(steps.length - 1, idx + 1));
  };

  const handleBack = () => {
    if (saving || stepIndex <= 0) return;
    setPhoneError('');
    setAddressError('');
    setStepIndex((idx) => Math.max(0, idx - 1));
  };

  // Customer Step 2: Validate & Save Phone Number
  const handlePhoneSubmit = async (event) => {
    if (event) event.preventDefault();
    if (saving) return;

    setPhoneError('');
    if (!isValidPhilippineMobile(phoneInput)) {
      setPhoneError(currentStep.validationError);
      return;
    }

    const normalized = normalizePhilippineMobile(phoneInput);
    setSaving(true);
    try {
      const updatedUser = await accountService.updateProfile({
        phone_number: normalized,
      });
      updateUser?.(updatedUser || { phone_number: normalized, phone: normalized });
      setSavedPhoneValue(normalized);
      setPhoneSaved(true);
      setStepIndex((idx) => Math.min(steps.length - 1, idx + 1));
    } catch (err) {
      const backendMsg =
        err?.errors?.phone_number?.[0] ||
        err?.message ||
        currentStep.saveErrorFallback;
      setPhoneError(backendMsg);
    } finally {
      setSaving(false);
    }
  };

  // Customer Step 3: Save Default Delivery Address via Backend & Sync Local Adapter
  const handleAddressSave = async (addressPayload) => {
    if (saving) return;
    setAddressError('');
    setSaving(true);

    const normalizedRecipientPhone = normalizePhilippineMobile(
      addressPayload.mobileNumber || addressPayload.phone || savedPhoneValue || user?.phone_number || '',
    );

    try {
      await locationApiService.createCustomerAddress({
        label: addressPayload.label || 'Home',
        recipient_name: addressPayload.recipientName || user?.name || user?.username || '',
        recipient_phone: normalizedRecipientPhone || null,
        province: addressPayload.province,
        city: addressPayload.city,
        barangay: addressPayload.barangay,
        street: addressPayload.street,
        house_number: addressPayload.houseNumber || null,
        landmark: addressPayload.notes || null,
        postal_code: addressPayload.postalCode || null,
        latitude: addressPayload.lat ?? null,
        longitude: addressPayload.lng ?? null,
        gps_accuracy: addressPayload.gpsAccuracy ?? null,
        is_default: true,
      });

      await addressService.fetchAddresses();

      setAddressSaved(true);
      setStepIndex((idx) => Math.min(steps.length - 1, idx + 1));
    } catch (err) {
      const firstFieldErr = err?.errors
        ? Object.values(err.errors).flat()[0]
        : null;
      setAddressError(firstFieldErr || err?.message || currentStep.saveErrorFallback);
    } finally {
      setSaving(false);
    }
  };

  // Rider Step 3: Explicit user-triggered browser geolocation request
  const handleRequestRiderLocation = () => {
    if (requestingLocation) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationPermission('unsupported');
      return;
    }

    setRequestingLocation(true);
    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationPermission('granted');
        setRequestingLocation(false);
      },
      (geoError) => {
        if (geoError?.code === 1) {
          setLocationPermission('denied');
        } else {
          setLocationPermission('prompt');
        }
        setRequestingLocation(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  };

  // Final Finish Step CTA handler
  const handleFinishAction = () => {
    if (normalizedRole === 'customer' && anyStepSkipped && !phoneSaved && !addressSaved) {
      onSkip?.();
    } else {
      onComplete?.();
    }

    if (normalizedRole === 'rider' && content.dashboardPath) {
      navigate(content.dashboardPath);
    } else if (normalizedRole === 'business') {
      const targetHref = businessChecklist?.firstIncompleteHref || content.overviewPath || '/owner';
      navigate(targetHref);
    }
  };

  const handlePrimaryClick = () => {
    if (saving) return;
    if (currentStep.kind === 'phone') {
      handlePhoneSubmit();
      return;
    }
    if (currentStep.kind === 'finish') {
      handleFinishAction();
      return;
    }
    setStepIndex((idx) => Math.min(steps.length - 1, idx + 1));
  };

  const riderChecklistItems = normalizedRole === 'rider' && currentStep.kind === 'rider-checklist'
    ? deriveRiderGoOnlineChecklist(riderDashboardData, locationPermission, currentStep.requirements)
    : [];

  const businessChecklistItems = normalizedRole === 'business' && currentStep.kind === 'business-checklist'
    ? (businessChecklist?.items || [])
    : [];

  const customerSkippedAnything =
    normalizedRole === 'customer' && (anyStepSkipped || !phoneSaved || !addressSaved);

  const finishBodyText =
    normalizedRole === 'customer'
      ? (customerSkippedAnything ? currentStep.skippedBody : currentStep.completedBody)
      : (anyStepSkipped ? currentStep.skippedBody : currentStep.completedBody);

  const prefilledAddressInitialData = {
    label: 'Home',
    recipientName: user?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || '',
    mobileNumber: savedPhoneValue || user?.phone_number || user?.phone || '',
    isDefault: true,
  };

  const titleId = `salo-onboarding-title-${normalizedRole}-${currentStep.id}`;

  const modalContent = (
    <div
      className="salo-onboarding-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          requestWholeSkip();
        }
      }}
    >
      <div
        ref={dialogRef}
        className={`salo-onboarding-dialog ${isAddressStep ? 'salo-onboarding-dialog--wide' : ''}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {/* Topbar */}
        <div className="salo-onboarding-topbar">
          <div className="salo-onboarding-brand">
            <BrandMark size="sm" showText={false} />
            <span className={`salo-onboarding-role-pill salo-onboarding-role-pill--${normalizedRole}`}>
              {content.roleBadge}
            </span>
          </div>

          <div className="salo-onboarding-topbar-right">
            <span className="salo-onboarding-step-count" aria-live="polite">
              {progressText}
            </span>
            <button
              type="button"
              className="salo-onboarding-close"
              onClick={requestWholeSkip}
              aria-label={SHARED_ONBOARDING_CONTENT.closeAriaLabel}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Segmented Progress Indicator */}
        <div
          className="salo-onboarding-progress"
          role="progressbar"
          aria-label={SHARED_ONBOARDING_CONTENT.progressAriaLabel}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={stepIndex + 1}
        >
          {steps.map((s, idx) => (
            <span
              key={s.id}
              className={`salo-onboarding-progress-segment ${
                idx < stepIndex ? 'is-complete' : idx === stepIndex ? 'is-active' : ''
              }`.trim()}
            />
          ))}
        </div>

        {/* Body */}
        <div className="salo-onboarding-body">
          {confirmingSkip ? (
            <div className="salo-onboarding-skip-confirm" role="region" aria-labelledby={titleId}>
              <h2 id={titleId} className="salo-onboarding-title">
                {SHARED_ONBOARDING_CONTENT.skipConfirmation.title}
              </h2>
              <p className="salo-onboarding-skip-confirm-text">
                {SHARED_ONBOARDING_CONTENT.skipConfirmation.message}
              </p>
              <div className="salo-onboarding-skip-confirm-actions">
                <Button
                  ref={skipCancelBtnRef}
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleCancelWholeSkip}
                >
                  {SHARED_ONBOARDING_CONTENT.skipConfirmation.cancelButton}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleConfirmWholeSkip}
                >
                  {SHARED_ONBOARDING_CONTENT.skipConfirmation.confirmButton}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="salo-onboarding-step-head">
                {isFinishStep && (
                  <div className="salo-onboarding-finish-badge" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
                <h2 id={titleId} className="salo-onboarding-title">
                  {stepTitle}
                </h2>
                {(currentStep.body || currentStep.helper || isFinishStep) && (
                  <p className="salo-onboarding-subtitle">
                    {isFinishStep ? finishBodyText : (currentStep.body || currentStep.helper)}
                  </p>
                )}
              </div>

              {/* Welcome Highlights */}
              {currentStep.kind === 'welcome' && Array.isArray(currentStep.highlights) && (
                <ul className="salo-onboarding-points">
                  {currentStep.highlights.map((item) => (
                    <li key={item.id} className="salo-onboarding-point-item">
                      <span className="salo-onboarding-point-icon">
                        {renderStepIcon(item.icon)}
                      </span>
                      <div className="salo-onboarding-point-copy">
                        <strong>{item.title}</strong>
                        <p>{item.description}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Icon-led Points Step (Rider Step 2 & 4, Business Step 3) */}
              {currentStep.kind === 'points' && Array.isArray(currentStep.points) && (
                <ul className="salo-onboarding-points">
                  {currentStep.points.map((point) => (
                    <li key={point.id} className="salo-onboarding-point-item">
                      <span className="salo-onboarding-point-icon">
                        {renderStepIcon(point.icon)}
                      </span>
                      <div className="salo-onboarding-point-copy">
                        <strong>{point.title}</strong>
                        <p>{point.description}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Customer Step 2: Phone Number */}
              {currentStep.kind === 'phone' && (
                <form id="salo-onboarding-phone-form" onSubmit={handlePhoneSubmit} noValidate>
                  <div className="salo-onboarding-field-group">
                    <label htmlFor="salo-onboarding-phone-input" className="salo-onboarding-label">
                      {currentStep.fieldLabel}
                    </label>
                    <input
                      id="salo-onboarding-phone-input"
                      ref={phoneInputRef}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      className={`salo-onboarding-input ${phoneError ? 'is-invalid' : ''}`.trim()}
                      placeholder={currentStep.fieldPlaceholder}
                      value={phoneInput}
                      disabled={saving}
                      onChange={(e) => {
                        setPhoneInput(e.target.value);
                        if (phoneError) setPhoneError('');
                      }}
                      aria-invalid={Boolean(phoneError)}
                      aria-describedby={phoneError ? 'salo-onboarding-phone-error' : 'salo-onboarding-phone-hint'}
                    />
                    <p id="salo-onboarding-phone-hint" className="salo-onboarding-hint">
                      {currentStep.fieldHint}
                    </p>
                    {phoneError && (
                      <p id="salo-onboarding-phone-error" className="salo-onboarding-error" role="alert">
                        {phoneError}
                      </p>
                    )}
                  </div>
                </form>
              )}

              {/* Customer Step 3: Reused Delivery Address Form */}
              {currentStep.kind === 'address' && (
                <div className="salo-onboarding-address-wrap">
                  <CustomerAddressForm
                    formId="salo-onboarding-address-form"
                    initialData={prefilledAddressInitialData}
                    existingAddresses={customerAddresses}
                    firstInputRef={addressFirstInputRef}
                    onSave={handleAddressSave}
                    mapHeight={210}
                    hideDefaultToggle
                    externalError={addressError}
                  />
                </div>
              )}

              {/* Rider Step 3: Before You Go Online Checklist */}
              {currentStep.kind === 'rider-checklist' && (
                <ul className="salo-onboarding-checklist">
                  {riderChecklistItems.map((item) => (
                    <li
                      key={item.id}
                      className={`salo-onboarding-checklist-item ${item.done ? 'is-done' : ''}`.trim()}
                    >
                      <div className="salo-onboarding-checklist-main">
                        <span
                          className={`salo-onboarding-status-dot ${item.done ? 'is-done' : ''}`.trim()}
                          aria-hidden="true"
                        >
                          {item.done ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <circle cx="12" cy="12" r="5" />
                            </svg>
                          )}
                        </span>
                        <div className="salo-onboarding-checklist-text">
                          <strong>{item.label}</strong>
                          <span>{item.detail}</span>
                        </div>
                      </div>

                      {item.isLocationAction && item.permissionState !== 'unsupported' && (
                        <Button
                          type="button"
                          variant={item.done ? 'secondary' : 'outline'}
                          size="sm"
                          disabled={item.done || requestingLocation}
                          onClick={handleRequestRiderLocation}
                        >
                          {requestingLocation
                            ? currentStep.requirements.locationPermission.requestingLabel
                            : item.done
                              ? currentStep.requirements.locationPermission.grantedButtonLabel
                              : currentStep.requirements.locationPermission.requestButtonLabel}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Business Step 2: Derived Restaurant Setup Checklist */}
              {currentStep.kind === 'business-checklist' && (
                <ul className="salo-onboarding-checklist">
                  {businessChecklistItems.map((item) => (
                    <li
                      key={item.id}
                      className={`salo-onboarding-checklist-item ${item.done ? 'is-done' : ''}`.trim()}
                    >
                      <div className="salo-onboarding-checklist-main">
                        <span
                          className={`salo-onboarding-status-dot ${item.done ? 'is-done' : ''}`.trim()}
                          aria-hidden="true"
                        >
                          {item.done ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <circle cx="12" cy="12" r="5" />
                            </svg>
                          )}
                        </span>
                        <div className="salo-onboarding-checklist-text">
                          <strong>{item.label}</strong>
                          <span>{item.description}</span>
                        </div>
                      </div>

                      <Link
                        to={item.href}
                        className="salo-onboarding-checklist-link"
                        onClick={() => {
                          onComplete?.();
                        }}
                      >
                        <span>
                          {item.done
                            ? SHARED_ONBOARDING_CONTENT.statusLabels.completed
                            : item.ctaLabel}
                        </span>
                        <span aria-hidden="true">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!confirmingSkip && (
          <div className="salo-onboarding-footer">
            <div className="salo-onboarding-footer-left">
              {currentStep.backButton && stepIndex > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={handleBack}
                >
                  {currentStep.backButton}
                </Button>
              )}

              {currentStep.wholeSkipButton && (
                <button
                  type="button"
                  className="salo-onboarding-text-btn"
                  disabled={saving}
                  onClick={requestWholeSkip}
                >
                  {currentStep.wholeSkipButton}
                </button>
              )}
            </div>

            <div className="salo-onboarding-footer-right">
              {currentStep.stepSkipButton && (
                <button
                  type="button"
                  className="salo-onboarding-text-btn"
                  disabled={saving}
                  onClick={handleStepSkip}
                >
                  {currentStep.stepSkipButton}
                </button>
              )}

              {isAddressStep ? (
                <Button
                  ref={primaryActionRef}
                  type="submit"
                  form="salo-onboarding-address-form"
                  variant="primary"
                  size="md"
                  loading={saving}
                  disabled={saving}
                >
                  {currentStep.primaryButton}
                </Button>
              ) : (
                <Button
                  ref={primaryActionRef}
                  type="button"
                  variant="primary"
                  size="md"
                  loading={saving}
                  disabled={saving}
                  onClick={handlePrimaryClick}
                >
                  {currentStep.primaryButton}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}

export default RoleOnboardingModal;

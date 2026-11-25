import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/common/Button';
import ApplicationHeader from './components/ApplicationHeader';
import ApplicationProgress from './components/ApplicationProgress';
import EmailVerificationStep from './components/EmailVerificationStep';
import BusinessInformationStep from './components/BusinessInformationStep';
import RepresentativeInformationStep from './components/RepresentativeInformationStep';
import BusinessDocumentsStep from './components/BusinessDocumentsStep';
import BusinessAddressStep from './components/BusinessAddressStep';
import PayoutInformationStep from './components/PayoutInformationStep';
import RestaurantConfigurationStep from './components/RestaurantConfigurationStep';
import ApplicationReviewStep from './components/ApplicationReviewStep';
import ApplicationSuccess from './components/ApplicationSuccess';
import ExitConfirmModal from './components/ExitConfirmModal';
import {
  INITIAL_APPLICATION_STATE,
  WIZARD_STEPS,
  validateRestaurantServices,
} from './constants/applicationDefaults';
import { getRequiredDocuments } from './constants/documentRequirements';
import applicationService from '../../services/applicationService';
import { resolveUploadableFile, mapAccountTypeToEnum } from '../../services/formDataHelper';
import {
  appendBranchPayloadToFormData,
  executeTwoStepApplicationSubmit,
  resolveActiveApplicationConflictRedirect,
  validateAddressStep,
} from './utils/branchHelpers';
import {
  getMissingBusinessApplicationRequirements,
  hasUploadedEntry,
} from './utils/applicationValidation';
import {
  savePartnerDraft,
  loadPartnerDraftMetadata,
  restorePartnerDraftFiles,
  clearPartnerDraft,
  isPartnerDraftOwnedByUser,
} from './services/partnerDraftStorage';
import './BusinessApplicationPage.css';

export default function BusinessApplicationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [initialDraft] = useState(() => loadPartnerDraftMetadata(user));

  // Wizard Step State
  const initialStepParam = parseInt(searchParams.get('step') || '1', 10);
  const [currentStep, setCurrentStep] = useState(() => {
    if (initialStepParam >= 1 && initialStepParam <= 8) return initialStepParam;
    return initialDraft?._currentStep >= 1 && initialDraft?._currentStep <= 8
      ? initialDraft._currentStep
      : 1;
  });

  // Form State
  const [formData, setFormData] = useState(() => {
    if (initialDraft) {
      return {
        ...INITIAL_APPLICATION_STATE,
        ...initialDraft,
        address: {
          ...INITIAL_APPLICATION_STATE.address,
          ...(initialDraft.address || {}),
        },
        documents: initialDraft.documents || {},
      };
    }
    return INITIAL_APPLICATION_STATE;
  });

  const [completedSteps, setCompletedSteps] = useState(() =>
    Array.isArray(initialDraft?._completedSteps) && initialDraft._completedSteps.length > 0
      ? initialDraft._completedSteps
      : formData?.emailVerification?.isVerified ? [1] : []
  );

  const [validationErrors, setValidationErrors] = useState({});
  const [isDraftSaved, setIsDraftSaved] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState(() => initialDraft?._savedAt || null);
  const [isDirty, setIsDirty] = useState(false);
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);
  const [submittedData, setSubmittedData] = useState(null);
  const [savedApplication, setSavedApplication] = useState(null);
  const [branchUploadProgress, setBranchUploadProgress] = useState({});

  const updateUserFormData = useCallback((updater) => {
    setFormData(updater);
    setIsDirty(true);
    setIsDraftSaved(false);
  }, []);

  // Discard stale draft if user resolves/changes and doesn't match draft owner; otherwise restore files
  useEffect(() => {
    if (!user) return;
    const ownerUserId = user.id ?? user.user_id ?? null;
    if (initialDraft && !isPartnerDraftOwnedByUser(initialDraft, user)) {
      clearPartnerDraft(ownerUserId).catch(() => {});
      setFormData(INITIAL_APPLICATION_STATE);
      setCurrentStep(1);
      setCompletedSteps([]);
      setLastSavedTime(null);
      setIsDraftSaved(false);
      setIsDirty(false);
      return;
    }
    let active = true;
    restorePartnerDraftFiles(initialDraft || formData, ownerUserId)
      .then((restored) => {
        if (!active || !restored) return;
        setFormData((prev) => ({
          ...prev,
          documents: { ...(restored.documents || {}), ...(prev.documents || {}) },
          payout: {
            ...prev.payout,
            proofDocument: prev.payout?.proofDocument || restored.payout?.proofDocument || null,
          },
          configuration: {
            ...prev.configuration,
            logo: prev.configuration?.logo?.file ? prev.configuration.logo : (restored.configuration?.logo || prev.configuration?.logo),
            coverPhoto: prev.configuration?.coverPhoto?.file ? prev.configuration.coverPhoto : (restored.configuration?.coverPhoto || prev.configuration?.coverPhoto),
            menuItems: (prev.configuration?.menuItems || []).map((item, idx) => {
              const restoredItem = restored.configuration?.menuItems?.[idx];
              if (item.photoFile || !restoredItem?.photoFile) return item;
              return { ...item, photoUrl: restoredItem.photoUrl, photoName: restoredItem.photoName, photoFile: restoredItem.photoFile };
            }),
          },
          address: {
            ...prev.address,
            branches: (prev.address?.branches || []).map((branch, idx) => {
              const restoredBranch = restored.address?.branches?.[idx];
              if (branch.permitFile || !restoredBranch?.permitFile) return branch;
              return { ...branch, permitFile: restoredBranch.permitFile, hadPendingPermitFile: false };
            }),
          },
        }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync email & company name to businessInfo if verified
  useEffect(() => {
    if (formData.emailVerification?.isVerified) {
      setCompletedSteps((prev) => (prev.includes(1) ? prev : [...prev, 1]));
    } else {
      setCompletedSteps((prev) => prev.filter((s) => s !== 1));
    }
    if (formData.emailVerification?.isVerified && formData.emailVerification?.verifiedEmail) {
      const verified = formData.emailVerification.verifiedEmail;
      const compName = formData.emailVerification.companyName?.trim() || '';
      setFormData((prev) => ({
        ...prev,
        businessInfo: {
          ...prev.businessInfo,
          businessEmail: verified,
          restaurantName: (!prev.businessInfo.restaurantName && compName)
            ? compName
            : prev.businessInfo.restaurantName,
        },
      }));
    }
  }, [
    formData.emailVerification?.isVerified,
    formData.emailVerification?.verifiedEmail,
    formData.emailVerification?.isSameAsAccount,
    formData.emailVerification?.companyName,
    formData.businessInfo.businessEmail,
    formData.businessInfo.restaurantName,
  ]);

  // Sync draft state + files to persistent storage
  const saveDraftLocally = useCallback(async () => {
    if (savingDraft) return false;
    setSavingDraft(true);
    try {
      const result = await savePartnerDraft({
        formData,
        currentStep,
        completedSteps,
        ownerUserId: user?.id ?? user?.user_id ?? null,
        ownerEmail: user?.email ?? null,
      });
      setIsDraftSaved(true);
      setIsDirty(false);
      setLastSavedTime(result.savedAt);
      setTimeout(() => setIsDraftSaved(false), 3000);
      return true;
    } catch (e) {
      console.warn('Unable to save partner application draft', e);
      return false;
    } finally {
      setSavingDraft(false);
    }
  }, [formData, currentStep, completedSteps, savingDraft, user]);

  // Step Validation Functions
  const validateStep = (stepNumber) => {
    const errors = {};

    if (stepNumber === 1) {
      if (!formData.emailVerification?.isVerified) {
        errors.verification = 'Please verify your email address with the 6-digit code to continue.';
      }
    }

    if (stepNumber === 2) {
      if (!formData.businessInfo.restaurantName?.trim()) {
        errors.restaurantName = 'Please enter your restaurant or business name.';
      }
      if (!formData.businessInfo.businessPhone?.trim()) {
        errors.businessPhone = 'Please provide a business contact number.';
      }
    }

    if (stepNumber === 3) {
      if (!formData.representative.firstName?.trim()) {
        errors.firstName = 'First name is required.';
      }
      if (!formData.representative.lastName?.trim()) {
        errors.lastName = 'Last name is required.';
      }
      if (!formData.representative.dateOfBirth) {
        errors.dateOfBirth = 'Date of birth is required.';
      } else {
        const birthYear = new Date(formData.representative.dateOfBirth).getFullYear();
        const currentYear = new Date().getFullYear();
        if (currentYear - birthYear < 18) {
          errors.dateOfBirth = 'Applicant must be at least 18 years of age.';
        }
      }
      if (!formData.representative.phone?.trim()) {
        errors.phone = 'Mobile contact number is required.';
      }
      if (!formData.representative.isAuthorized) {
        errors.isAuthorized = 'You must declare that you are authorized to submit this application.';
      }
    }

    if (stepNumber === 4) {
      const requiredDocs = getRequiredDocuments(
        formData.businessInfo.ownershipStructure,
        formData.representative.position
      ).filter((d) => d.required);

      for (const reqDoc of requiredDocs) {
        if (!hasUploadedEntry(formData.documents[reqDoc.id])) {
          errors[reqDoc.id] = `${reqDoc.title} is required.`;
        }
      }
    }

    if (stepNumber === 5) {
      Object.assign(errors, validateAddressStep(formData.address));
    }

    if (stepNumber === 6) {
      if (!formData.payout.accountHolder?.trim()) {
        errors.accountHolder = 'Account holder name is required.';
      }
      if (!formData.payout.accountNumber?.trim()) {
        errors.accountNumber = 'Bank account number is required.';
      } else if (formData.payout.accountNumber.length < 8) {
        errors.accountNumber = 'Account number must be at least 8 digits.';
      }
    }

    if (stepNumber === 7) {
      const serviceError = validateRestaurantServices(formData.configuration.services);
      if (serviceError) {
        errors.services = serviceError;
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = () => {
    if (!validateStep(currentStep)) {
      window.scrollTo({ top: 120, behavior: 'smooth' });
      return;
    }

    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps((prev) => [...prev, currentStep]);
    }

    if (currentStep < 8) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleDirectStepJump = (targetStep) => {
    if (targetStep > 1 && !formData.emailVerification?.isVerified) {
      setValidationErrors((prev) => ({
        ...prev,
        verification: 'Please verify your email address with the 6-digit code before proceeding.',
      }));
      setCurrentStep(1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setCurrentStep(targetStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Document Upload Handlers
  const handleDocumentUpload = (docId, fileData) => {
    updateUserFormData((prev) => ({
      ...prev,
      documents: {
        ...prev.documents,
        [docId]: fileData,
      },
    }));
    setValidationErrors((prev) => ({ ...prev, [docId]: null }));
  };

  const handleDocumentRemove = (docId) => {
    updateUserFormData((prev) => {
      const nextDocs = { ...prev.documents };
      delete nextDocs[docId];
      return { ...prev, documents: nextDocs };
    });
  };

  // Final Application Submission (Two-step: metadata first, then per-branch permit files)
  const handleSubmitApplication = async () => {
    if (submitting || submitInFlightRef.current) return;
    submitInFlightRef.current = true;

    const verifiedEmail = (
      formData.emailVerification?.isVerified ? formData.emailVerification?.verifiedEmail : ''
    )?.trim();

    if (!verifiedEmail) {
      setValidationErrors((prev) => ({
        ...prev,
        verification: 'Please verify your email address with the 6-digit code before submitting.',
        submit: 'Email verification is required before submitting your application.',
      }));
      setCurrentStep(1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      submitInFlightRef.current = false;
      return;
    }

    setSubmitting(true);
    setValidationErrors((prev) => ({ ...prev, submit: undefined }));

    try {
      const fd = new FormData();
      if (!savedApplication) {
        const mapBusinessType = (val) => {
          const map = {
            Restaurant: 'restaurant',
            'Café': 'cafe',
            Cafe: 'cafe',
            Bakery: 'bakery',
            'Fast Food': 'fast_food',
            'Food Stall': 'food_stall',
            'Food Kiosk': 'food_kiosk',
            'Cloud Kitchen': 'cloud_kitchen',
          };
          return map[val] || 'other';
        };

        const mapOwnership = (val) => {
          const map = {
            'Sole Proprietorship': 'sole_proprietorship',
            Partnership: 'partnership',
            Corporation: 'corporation',
            Cooperative: 'cooperative',
          };
          return map[val] || 'other';
        };

        const mapPosition = (val) => {
          const map = {
            'Business Owner': 'business_owner',
            'Co-owner': 'co_owner',
            'Authorized Representative': 'authorized_representative',
            Manager: 'manager',
          };
          return map[val] || 'business_owner';
        };

        fd.append('restaurant_name', formData.businessInfo.restaurantName || '');
        if (formData.businessInfo.registeredName) {
          fd.append('registered_name', formData.businessInfo.registeredName);
        }
        fd.append('business_type', mapBusinessType(formData.businessInfo.businessType));
        fd.append('ownership_structure', mapOwnership(formData.businessInfo.ownershipStructure));
        if (formData.businessInfo.description) {
          fd.append('description', formData.businessInfo.description);
        }
        fd.append('business_phone', formData.businessInfo.businessPhone || formData.representative.phone || '');
        fd.append('business_email', verifiedEmail);

        if (formData.businessInfo.cuisineType) {
          fd.append('categories[]', formData.businessInfo.cuisineType);
        }

        fd.append('applicant_position', mapPosition(formData.representative.position));
        fd.append('legal_first_name', formData.representative.firstName || user?.first_name || '');
        if (formData.representative.middleName) {
          fd.append('legal_middle_name', formData.representative.middleName);
        }
        fd.append('legal_last_name', formData.representative.lastName || user?.last_name || '');
        if (formData.representative.suffix) {
          fd.append('legal_suffix', formData.representative.suffix);
        }
        fd.append('date_of_birth', formData.representative.dateOfBirth || '');
        fd.append('contact_phone', formData.representative.phone || '');
        fd.append('contact_email', verifiedEmail);

        fd.append('province', formData.address.province || 'Metro Manila');
        fd.append('city', formData.address.city || 'Quezon City');
        fd.append('barangay', formData.address.barangay || 'South Triangle');
        if (formData.address.street) fd.append('street', formData.address.street);
        if (formData.address.postalCode) fd.append('postal_code', formData.address.postalCode);
        if (formData.address.additionalDetails) fd.append('landmark', formData.address.additionalDetails);
        if (formData.address.mapPinned && formData.address.coordinates?.lat != null) fd.append('latitude', String(formData.address.coordinates.lat));
        if (formData.address.mapPinned && formData.address.coordinates?.lng != null) fd.append('longitude', String(formData.address.coordinates.lng));
        appendBranchPayloadToFormData(fd, formData.address);

        const services = formData.configuration?.services || {};
        fd.append('offers_delivery', services.delivery ? '1' : '0');
        fd.append('offers_pickup', services.pickup ? '1' : '0');
        fd.append('offers_dine_in', services.dineIn ? '1' : '0');
        fd.append('accepts_reservations', services.tableReservations ? '1' : '0');

        const dayIndexMap = {
          sunday: 0,
          monday: 1,
          tuesday: 2,
          wednesday: 3,
          thursday: 4,
          friday: 5,
          saturday: 6,
        };
        const opHours = formData.configuration?.operatingHours || {};
        Object.entries(opHours).forEach(([dayKey, cfg], idx) => {
          if (dayIndexMap[dayKey] === undefined) return;
          fd.append(`operating_hours[${idx}][day_of_week]`, String(dayIndexMap[dayKey]));
          fd.append(`operating_hours[${idx}][opening_time]`, `${cfg.openTime || '09:00'}:00`);
          fd.append(`operating_hours[${idx}][closing_time]`, `${cfg.closeTime || '21:00'}:00`);
          fd.append(`operating_hours[${idx}][is_closed]`, cfg.isOpen === false ? '1' : '0');
        });

        fd.append('payout_provider', formData.payout.bankName || 'BPI');
        fd.append('payout_account_type', mapAccountTypeToEnum(formData.payout.accountType));
        fd.append('payout_account_holder_name', formData.payout.accountHolder || '');
        fd.append('payout_account_number', formData.payout.accountNumber || '');
        fd.append('terms_accepted', '1');
        fd.append('terms_version', 'v1.0');

        const logoFile = resolveUploadableFile(formData.configuration?.logo, 'logo.png');
        if (logoFile) fd.append('logo_image', logoFile);

        const coverFile = resolveUploadableFile(formData.configuration?.coverPhoto, 'cover.jpg');
        if (coverFile) fd.append('cover_image', coverFile);

        const menuItems = formData.configuration?.menuItems || [];
        menuItems.forEach((item, idx) => {
          fd.append(`menu_items[${idx}][name]`, item.name || '');
          if (item.description) fd.append(`menu_items[${idx}][description]`, item.description);
          if (item.category) fd.append(`menu_items[${idx}][category]`, item.category);
          fd.append(`menu_items[${idx}][price]`, String(item.price ?? 0));
          fd.append(`menu_items[${idx}][available]`, item.available !== false ? '1' : '0');
          const photoFile = resolveUploadableFile(item.photoFile || item.photoUrl, `menu_item_${idx}.jpg`);
          if (photoFile) {
            fd.append(`menu_item_photos[${idx}]`, photoFile);
          }
        });

        Object.entries(formData.documents || {}).forEach(([docId, entry]) => {
          const file = resolveUploadableFile(entry, `${docId}.pdf`);
          if (file) {
            fd.append(`documents[${docId}]`, file);
          }
        });

        if (formData.payout?.proofDocument) {
          const proofFile = resolveUploadableFile(formData.payout.proofDocument, 'bank_proof.pdf');
          if (proofFile) {
            fd.append('documents[bank_proof]', proofFile);
          }
        }
      }

      const result = await executeTwoStepApplicationSubmit({
        applicationFormData: fd,
        branches: formData.address?.hasBranches ? (formData.address?.branches || []) : [],
        existingApplication: savedApplication,
        previousProgress: branchUploadProgress,
        submitApplication: (payload) => applicationService.submitRestaurantApplication(payload),
        submitBranchPermit: (appId, branchId, payload) => (
          applicationService.submitApplicationBranchPermit(appId, branchId, payload)
        ),
        onProgress: (nextProgress) => setBranchUploadProgress(nextProgress),
      });

      setSavedApplication(result.application);
      setIsDirty(false);
      await clearPartnerDraft(user?.id ?? user?.user_id ?? null).catch(() => {});

      if (result.hasFailure) {
        setValidationErrors((prev) => ({
          ...prev,
          submit: 'Your application was saved, but one or more branch permit uploads failed. Retry the failed branch below or continue to your application status page.',
        }));
        return;
      }

      setSubmittedData({
        referenceNumber: result.application?.reference_number,
        submissionDate: result.application?.submitted_at || new Date().toISOString(),
        restaurantName: result.application?.restaurant_name || formData.businessInfo.restaurantName,
        applicantEmail: result.application?.contact_email || verifiedEmail,
      });

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      const conflictRedirect = resolveActiveApplicationConflictRedirect(error);
      if (conflictRedirect) {
        await clearPartnerDraft(user?.id ?? user?.user_id ?? null).catch(() => {});
        navigate(conflictRedirect.to, {
          replace: true,
          state: {
            notice: conflictRedirect.notice,
            existingApplicationId: conflictRedirect.existingApplicationId,
          },
        });
        return;
      }

      const fieldErrors = {};
      if (error?.errors && typeof error.errors === 'object') {
        Object.entries(error.errors).forEach(([key, msgs]) => {
          const firstMsg = Array.isArray(msgs) ? msgs[0] : String(msgs);
          if (firstMsg) {
            fieldErrors[key] = firstMsg;
            if (key === 'main_branch_name') {
              fieldErrors.mainBranchName = firstMsg;
            }
            const branchNameMatch = key.match(/^branches\.(\d+)\.branch_name$/);
            if (branchNameMatch) {
              fieldErrors[`branches.${branchNameMatch[1]}.branchName`] = firstMsg;
            }
            const branchPostalMatch = key.match(/^branches\.(\d+)\.postal_code$/);
            if (branchPostalMatch) {
              fieldErrors[`branches.${branchPostalMatch[1]}.postalCode`] = firstMsg;
            }
            if (key.startsWith('documents.')) {
              fieldErrors[key.replace('documents.', '')] = firstMsg;
            }
          }
        });
      }
      const firstFieldMsg = Object.values(fieldErrors)[0];
      setValidationErrors((prev) => ({
        ...prev,
        ...fieldErrors,
        submit: firstFieldMsg || error?.message || 'Unable to submit application. Please review your details and try again.',
      }));
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handleHeaderExit = () => {
    if (!isDirty) {
      navigate('/customer/partner');
    } else {
      setExitModalOpen(true);
    }
  };

  const handleExitConfirm = () => {
    setExitModalOpen(false);
    navigate('/customer/partner');
  };

  const missingRequirements = getMissingBusinessApplicationRequirements(formData);
  const areAllRequiredStepsValid = () => missingRequirements.length === 0;

  return (
    <div className="business-app-page">
      {/* Top Header */}
      <ApplicationHeader
        currentStep={currentStep}
        totalSteps={WIZARD_STEPS.length}
        onSaveDraft={saveDraftLocally}
        onExit={handleHeaderExit}
        isDraftSaved={isDraftSaved}
        savingDraft={savingDraft}
        lastSavedTime={lastSavedTime}
      />

      {/* If already submitted in current flow, display Success Receipt */}
      {submittedData ? (
        <ApplicationSuccess
          referenceNumber={submittedData.referenceNumber}
          submissionDate={submittedData.submissionDate}
          restaurantName={submittedData.restaurantName}
          applicantEmail={submittedData.applicantEmail}
          onResetApplication={() => {
            setSubmittedData(null);
            setCurrentStep(1);
          }}
        />
      ) : (
        <>
          {/* Progress Bar / Stepper */}
          <ApplicationProgress
            currentStep={currentStep}
            completedSteps={completedSteps}
            onStepClick={handleDirectStepJump}
          />

          {/* Main Wizard Step Content Area */}
          <main className="wizard-main-content">
            <div className="wizard-step-body">
              {currentStep === 1 && (
                <EmailVerificationStep
                  data={formData.emailVerification}
                  onChange={(next) => {
                    updateUserFormData((prev) => ({
                      ...prev,
                      emailVerification: next,
                      businessInfo: {
                        ...prev.businessInfo,
                        businessEmail: next.verifiedEmail || next.email || prev.businessInfo.businessEmail,
                      },
                    }));
                    if (next.isVerified) {
                      setValidationErrors((prev) => ({ ...prev, verification: null, email: null }));
                    }
                  }}
                  currentUser={user}
                  errors={validationErrors}
                />
              )}

              {currentStep === 2 && (
                <BusinessInformationStep
                  data={formData.businessInfo}
                  onChange={(next) => updateUserFormData((prev) => ({ ...prev, businessInfo: next }))}
                  verifiedEmail={formData.emailVerification?.verifiedEmail || formData.emailVerification?.email || ''}
                  errors={validationErrors}
                />
              )}

              {currentStep === 3 && (
                <RepresentativeInformationStep
                  data={formData.representative}
                  onChange={(next) => updateUserFormData((prev) => ({ ...prev, representative: next }))}
                  verifiedEmail={formData.emailVerification?.verifiedEmail || formData.emailVerification?.email || ''}
                  errors={validationErrors}
                  currentUser={user}
                />
              )}

              {currentStep === 4 && (
                <BusinessDocumentsStep
                  ownershipStructure={formData.businessInfo.ownershipStructure}
                  position={formData.representative.position}
                  documents={formData.documents}
                  onDocumentUpload={handleDocumentUpload}
                  onDocumentRemove={handleDocumentRemove}
                  onSkipSupporting={handleNextStep}
                  errors={validationErrors}
                />
              )}

              {currentStep === 5 && (
                <BusinessAddressStep
                  data={formData.address}
                  onChange={(next) => updateUserFormData((prev) => ({ ...prev, address: next }))}
                  errors={validationErrors}
                />
              )}

              {currentStep === 6 && (
                <PayoutInformationStep
                  data={formData.payout}
                  onChange={(next) => updateUserFormData((prev) => ({ ...prev, payout: next }))}
                  errors={validationErrors}
                />
              )}

              {currentStep === 7 && (
                <RestaurantConfigurationStep
                  data={formData.configuration}
                  onChange={(next) => updateUserFormData((prev) => ({ ...prev, configuration: next }))}
                  errors={validationErrors}
                />
              )}

              {currentStep === 8 && (
                <ApplicationReviewStep
                  applicationData={formData}
                  onNavigateToStep={handleDirectStepJump}
                  onDeclarationChange={(next) => updateUserFormData((prev) => ({ ...prev, review: next }))}
                  onSubmitApplication={handleSubmitApplication}
                  submitting={submitting}
                  allRequiredValid={areAllRequiredStepsValid()}
                  missingRequirements={missingRequirements}
                />
              )}

              {Object.keys(branchUploadProgress).length > 0 && (
                <div className="wizard-branch-upload-progress" role="status" style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border-primary, #e5e7eb)', background: 'var(--surface-primary, #ffffff)' }}>
                  <strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>Branch Permit Uploads</strong>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {Object.values(branchUploadProgress).map((item) => (
                      <div key={item.applicationBranchId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, gap: 8 }}>
                        <span>{item.branchName}</span>
                        <span>
                          {item.status === 'uploading' && 'Uploading...'}
                          {item.status === 'uploaded' && 'Uploaded'}
                          {item.status === 'failed' && `Failed: ${item.error || 'Upload error'}`}
                        </span>
                      </div>
                    ))}
                  </div>
                  {savedApplication && Object.values(branchUploadProgress).some((item) => item.status === 'failed') && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <Button type="button" variant="primary" size="sm" onClick={handleSubmitApplication} disabled={submitting}>
                        Retry Failed Uploads
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => navigate('/business-application/status')}>
                        Continue to Application Status
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {validationErrors.submit && (
                <div className="wizard-error-banner" role="alert" style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                  {validationErrors.submit}
                </div>
              )}

              {/* Wizard Bottom Navigation Buttons */}
              <div className="wizard-navigation-bar">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={handlePrevStep}
                  disabled={currentStep === 1}
                >
                  ← Back
                </Button>

                {currentStep < 8 ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={handleNextStep}
                  >
                    {currentStep === 1 && !formData.emailVerification?.isVerified
                      ? 'Verify OTP to Continue →'
                      : 'Continue →'}
                  </Button>
                ) : null}
              </div>
            </div>
          </main>
        </>
      )}

      {/* Styled Exit Confirmation Modal matching Rider Application */}
      <ExitConfirmModal
        isOpen={exitModalOpen}
        open={exitModalOpen}
        onClose={() => setExitModalOpen(false)}
        onSaveAndExit={async () => {
          const ok = await saveDraftLocally();
          if (ok) handleExitConfirm();
        }}
        onExitWithoutSaving={handleExitConfirm}
        isSaving={savingDraft}
      />
    </div>
  );
}

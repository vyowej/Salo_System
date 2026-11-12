import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/common/Button';
import RiderApplicationHeader from './components/RiderApplicationHeader';
import RiderApplicationProgress from './components/RiderApplicationProgress';
import EmailVerificationStep from './components/EmailVerificationStep';
import PersonalInformationStep from './components/PersonalInformationStep';
import IdentityVerificationStep from './components/IdentityVerificationStep';
import DeliveryMethodStep from './components/DeliveryMethodStep';
import VehicleInformationStep from './components/VehicleInformationStep';
import VehicleDocumentsStep from './components/VehicleDocumentsStep';
import ClearanceDocumentsStep from './components/ClearanceDocumentsStep';
import EmergencyContactStep from './components/EmergencyContactStep';
import PayoutInformationStep from './components/PayoutInformationStep';
import RiderAgreementStep from './components/RiderAgreementStep';
import ApplicationSuccess from './components/ApplicationSuccess';
import ExitConfirmModal from './components/ExitConfirmModal';
import {
  INITIAL_RIDER_APPLICATION_STATE,
  RIDER_APPLICATION_STEPS,
} from './constants/riderApplicationDefaults';
import { getVehicleDocuments, RIDER_DOC_TYPES } from './constants/riderDocumentMatrix';
import {
  saveRiderDraft,
  loadRiderDraft,
  clearRiderDraft,
} from './services/riderDraftStorage';
import adminService from '../../services/adminService';
import './RiderApplicationPage.css';

const STORAGE_RIDER_APPS_KEY = 'salo_rider_applications';

export default function RiderApplicationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // Load existing draft from persistent storage on mount
  const [initialDraft] = useState(() => {
    try {
      return loadRiderDraft();
    } catch {
      return null;
    }
  });

  // Wizard Step State: query param takes precedence, then saved draft step, default to 1
  const [currentStep, setCurrentStep] = useState(() => {
    const stepQuery = parseInt(searchParams.get('step') || '', 10);
    if (stepQuery >= 1 && stepQuery <= 10) return stepQuery;
    if (initialDraft && initialDraft.currentStep >= 1 && initialDraft.currentStep <= 10) {
      return initialDraft.currentStep;
    }
    return 1;
  });

  const [completedSteps, setCompletedSteps] = useState(() => {
    if (initialDraft && Array.isArray(initialDraft.completedSteps) && initialDraft.completedSteps.length > 0) {
      return initialDraft.completedSteps;
    }
    return [1];
  });

  // Form State initialized from persistent draft if available (including photos and files)
  const [formData, setFormData] = useState(() => {
    if (initialDraft && initialDraft.formData) {
      return {
        ...INITIAL_RIDER_APPLICATION_STATE,
        ...initialDraft.formData,
        identity: {
          ...INITIAL_RIDER_APPLICATION_STATE.identity,
          ...(initialDraft.formData.identity || {}),
        },
        vehicleInfo: {
          ...INITIAL_RIDER_APPLICATION_STATE.vehicleInfo,
          ...(initialDraft.formData.vehicleInfo || {}),
        },
        personal: {
          ...INITIAL_RIDER_APPLICATION_STATE.personal,
          ...(initialDraft.formData.personal || {}),
          address: {
            ...INITIAL_RIDER_APPLICATION_STATE.personal.address,
            ...(initialDraft.formData.personal?.address || {}),
          },
        },
        emergency: {
          ...INITIAL_RIDER_APPLICATION_STATE.emergency,
          ...(initialDraft.formData.emergency || {}),
        },
        payout: {
          ...INITIAL_RIDER_APPLICATION_STATE.payout,
          ...(initialDraft.formData.payout || {}),
        },
        declarations: {
          ...INITIAL_RIDER_APPLICATION_STATE.declarations,
          ...(initialDraft.formData.declarations || {}),
        },
        vehicleDocuments: initialDraft.formData.vehicleDocuments || {},
        clearanceDocuments: initialDraft.formData.clearanceDocuments || {},
      };
    }
    return INITIAL_RIDER_APPLICATION_STATE;
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [isDraftSaved, setIsDraftSaved] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState(() => initialDraft?.savedAt || null);
  const [saveError, setSaveError] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedData, setSubmittedData] = useState(null);

  // Sync step from query param if changed externally
  useEffect(() => {
    const stepQuery = parseInt(searchParams.get('step') || '', 10);
    if (stepQuery >= 1 && stepQuery <= 10 && stepQuery !== currentStep) {
      setCurrentStep(stepQuery);
    }
  }, [searchParams, currentStep]);

  // Guard against accidental page reload or tab closure when unsaved changes exist
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  // Save Draft locally to persistent storage (preserving all fields, documents, and photos)
  const saveDraftLocally = useCallback(async () => {
    if (savingDraft) return false;
    setSavingDraft(true);
    setSaveError(null);

    try {
      const result = await saveRiderDraft({
        formData,
        currentStep,
        completedSteps,
      });

      setIsDraftSaved(true);
      setLastSavedTime(result.savedAt);
      setIsDirty(false);

      setTimeout(() => {
        setIsDraftSaved(false);
      }, 3500);

      return true;
    } catch (e) {
      console.warn('Unable to save draft to storage', e);
      setSaveError(e.message || 'Failed to save draft. Storage quota may be exceeded.');
      return false;
    } finally {
      setSavingDraft(false);
    }
  }, [formData, currentStep, completedSteps, savingDraft]);

  // Step Validation Functions
  const validateStep = (stepNumber) => {
    const errors = {};

    // Step 1: Company & Email OTP Verification (Mandatory Gate)
    if (stepNumber === 1) {
      const email = (formData.emailVerification?.email || '').trim();
      if (!email || !email.includes('@') || !email.includes('.')) {
        errors.email = 'Please provide a valid company or rider contact email address.';
      }
      if (!formData.emailVerification?.isVerified) {
        errors.verification = 'You must receive and verify the 6-digit email OTP before proceeding to Step 2.';
      }
    }

    // Step 2: Personal & Contact Information
    if (stepNumber === 2) {
      if (!formData.personal.firstName?.trim()) {
        errors.firstName = 'First name is required.';
      }
      if (!formData.personal.lastName?.trim()) {
        errors.lastName = 'Last name is required.';
      }
      if (!formData.personal.dateOfBirth) {
        errors.dateOfBirth = 'Date of birth is required.';
      } else {
        const birthDate = new Date(formData.personal.dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        if (age < 18) {
          errors.dateOfBirth = 'You must be at least 18 years old to apply as a SALO delivery rider.';
        }
      }
      if (!formData.personal.phone?.trim()) {
        errors.phone = 'Mobile contact number is required.';
      }
      if (!formData.personal.address?.street?.trim()) {
        errors.street = 'Street address is required.';
      }
      if (!formData.personal.address?.postalCode?.trim()) {
        errors.postalCode = 'Postal code is required.';
      }
    }

    // Step 3: Identity Verification
    if (stepNumber === 3) {
      if (!formData.identity.idNumber?.trim()) {
        errors.idNumber = 'Government ID number is required.';
      }
      if (!formData.identity.isPermanent && !formData.identity.expiryDate) {
        errors.expiryDate = 'ID expiration date is required (or mark as permanent).';
      }
      if (!formData.identity.frontPhoto) {
        errors.frontPhoto = 'Front image of your government ID is required.';
      }
      if (!formData.identity.selfiePhoto) {
        errors.selfiePhoto = 'A clear verification selfie photo is required.';
      }
    }

    // Step 4: Delivery Method
    if (stepNumber === 4) {
      if (!formData.deliveryMethod) {
        errors.deliveryMethod = 'Please choose your primary delivery vehicle/method.';
      }
    }

    // Step 5: Vehicle Information
    if (stepNumber === 5) {
      const method = formData.deliveryMethod;
      if (method === 'motorcycle') {
        if (!formData.vehicleInfo.motoBrand?.trim()) {
          errors.motoBrand = 'Motorcycle brand/make is required.';
        }
        if (!formData.vehicleInfo.motoModel?.trim()) {
          errors.motoModel = 'Motorcycle model is required.';
        }
        if (!formData.vehicleInfo.plateNumber?.trim()) {
          errors.plateNumber = 'License plate or MV file number is required.';
        }
        if (
          formData.vehicleInfo.ownership !== 'Personally Owned' &&
          !formData.vehicleInfo.ownerName?.trim()
        ) {
          errors.ownerName = 'Registered owner name is required for borrowed/rented vehicles.';
        }
      } else if (method === 'bicycle') {
        if (!formData.vehicleInfo.bikeBrand?.trim()) {
          errors.bikeBrand = 'Bicycle brand / make is required.';
        }
      } else if (method === 'e_bike') {
        if (!formData.vehicleInfo.ebikeBrand?.trim()) {
          errors.ebikeBrand = 'E-bike brand is required.';
        }
      } else if (method === 'e_scooter') {
        if (!formData.vehicleInfo.escooterBrand?.trim()) {
          errors.escooterBrand = 'E-scooter brand is required.';
        }
      }
    }

    // Step 6: Vehicle Documents
    if (stepNumber === 6) {
      const requiredDocs = getVehicleDocuments(
        formData.deliveryMethod,
        formData.vehicleInfo.ownership
      ).filter((d) => d.required);

      for (const reqDoc of requiredDocs) {
        const hasDoc = Boolean(
          formData.vehicleDocuments[reqDoc.id]?.name ||
          formData.vehicleDocuments[reqDoc.id]?.dataUrl ||
          formData.vehicleDocuments[reqDoc.id]?.previewUrl
        );
        if (!hasDoc) {
          errors[reqDoc.id] = `${reqDoc.title} is required for ${formData.deliveryMethod.replace('_', ' ')} delivery.`;
        }
      }
    }

    // Step 7: Clearances
    if (stepNumber === 7) {
      const hasNbi = Boolean(
        formData.clearanceDocuments[RIDER_DOC_TYPES.NBI_CLEARANCE]?.name ||
        formData.clearanceDocuments[RIDER_DOC_TYPES.NBI_CLEARANCE]?.dataUrl
      );
      const hasPolice = Boolean(
        formData.clearanceDocuments[RIDER_DOC_TYPES.POLICE_CLEARANCE]?.name ||
        formData.clearanceDocuments[RIDER_DOC_TYPES.POLICE_CLEARANCE]?.dataUrl
      );
      if (!hasNbi && !hasPolice) {
        errors.primaryClearance = 'Either an NBI Clearance or a Police Clearance is required.';
      }
    }

    // Step 8: Emergency & Preferences
    if (stepNumber === 8) {
      if (!formData.emergency.contactName?.trim()) {
        errors.contactName = 'Emergency contact person is required.';
      }
      if (!formData.emergency.phone?.trim()) {
        errors.phone = 'Emergency contact phone number is required.';
      }
      if (!formData.emergency.preferredCity?.trim()) {
        errors.preferredCity = 'Please select your primary delivery city/zone.';
      }
    }

    // Step 9: Payout
    if (stepNumber === 9) {
      if (!formData.payout.accountHolder?.trim()) {
        errors.accountHolder = 'Account holder name is required.';
      }
      if (!formData.payout.accountNumber?.trim()) {
        errors.accountNumber = 'Account or mobile number is required.';
      } else if (formData.payout.accountNumber.length < 8) {
        errors.accountNumber = 'Account number must be at least 8 digits.';
      }
    }

    // Step 10: Agreement & Declarations
    if (stepNumber === 10) {
      if (!formData.declarations.infoConfirmed) {
        errors.infoConfirmed = 'You must certify that all provided information is accurate.';
      }
      if (!formData.declarations.documentsGenuine) {
        errors.documentsGenuine = 'You must confirm that all uploaded documents are genuine.';
      }
      if (!formData.declarations.safetyPolicyAgreed) {
        errors.safetyPolicyAgreed = 'You must agree to SALO road safety and equipment standards.';
      }
      if (!formData.declarations.termsAgreed) {
        errors.termsAgreed = 'You must accept the SALO Independent Rider Agreement.';
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

    if (currentStep < 10) {
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
    // Cannot skip forward past Step 1 without OTP verification
    if (targetStep > 1 && !formData.emailVerification?.isVerified) {
      setValidationErrors((prev) => ({
        ...prev,
        verification: 'Please complete email OTP verification before proceeding.',
      }));
      setCurrentStep(1);
      return;
    }

    setCurrentStep(targetStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Updaters for state — each marks form dirty
  const handleEmailVerificationChange = (nextVerification) => {
    setIsDirty(true);
    setFormData((prev) => ({
      ...prev,
      emailVerification: nextVerification,
      personal: {
        ...prev.personal,
        email: nextVerification.verifiedEmail || nextVerification.email || prev.personal.email,
      },
    }));
    if (nextVerification.isVerified) {
      setCompletedSteps((prev) => (prev.includes(1) ? prev : [...prev, 1]));
    }
    setValidationErrors((prev) => ({
      ...prev,
      verification: null,
      email: null,
    }));
  };

  const handlePersonalChange = (nextPersonal) => {
    setIsDirty(true);
    setFormData((prev) => ({ ...prev, personal: nextPersonal }));
    setValidationErrors((prev) => ({
      ...prev,
      firstName: null,
      lastName: null,
      dateOfBirth: null,
      phone: null,
      street: null,
      postalCode: null,
    }));
  };

  const handleIdentityChange = (nextIdentity) => {
    setIsDirty(true);
    setFormData((prev) => ({ ...prev, identity: nextIdentity }));
    setValidationErrors((prev) => ({
      ...prev,
      idNumber: null,
      expiryDate: null,
      frontPhoto: null,
      selfiePhoto: null,
    }));
  };

  const handleSelectDeliveryMethod = (methodKey) => {
    setIsDirty(true);
    setFormData((prev) => ({ ...prev, deliveryMethod: methodKey }));
    setValidationErrors((prev) => ({ ...prev, deliveryMethod: null }));
  };

  const handleVehicleInfoChange = (nextVehicleInfo) => {
    setIsDirty(true);
    setFormData((prev) => ({ ...prev, vehicleInfo: nextVehicleInfo }));
    setValidationErrors((prev) => ({
      ...prev,
      motoBrand: null,
      motoModel: null,
      plateNumber: null,
      ownerName: null,
      bikeBrand: null,
      ebikeBrand: null,
      escooterBrand: null,
    }));
  };

  const handleVehicleDocumentUpload = (docId, fileData) => {
    setIsDirty(true);
    setFormData((prev) => ({
      ...prev,
      vehicleDocuments: {
        ...prev.vehicleDocuments,
        [docId]: fileData,
      },
    }));
    setValidationErrors((prev) => ({ ...prev, [docId]: null }));
  };

  const handleVehicleDocumentRemove = (docId) => {
    setIsDirty(true);
    setFormData((prev) => {
      const nextDocs = { ...prev.vehicleDocuments };
      delete nextDocs[docId];
      return { ...prev, vehicleDocuments: nextDocs };
    });
  };

  const handleClearanceUpload = (docId, fileData) => {
    setIsDirty(true);
    setFormData((prev) => ({
      ...prev,
      clearanceDocuments: {
        ...prev.clearanceDocuments,
        [docId]: fileData,
      },
    }));
    setValidationErrors((prev) => ({
      ...prev,
      [docId]: null,
      primaryClearance: null,
    }));
  };

  const handleClearanceRemove = (docId) => {
    setIsDirty(true);
    setFormData((prev) => {
      const nextDocs = { ...prev.clearanceDocuments };
      delete nextDocs[docId];
      return { ...prev, clearanceDocuments: nextDocs };
    });
  };

  const handleEmergencyChange = (nextEmergency) => {
    setIsDirty(true);
    setFormData((prev) => ({ ...prev, emergency: nextEmergency }));
    setValidationErrors((prev) => ({
      ...prev,
      contactName: null,
      phone: null,
      preferredCity: null,
    }));
  };

  const handlePayoutChange = (nextPayout) => {
    setIsDirty(true);
    setFormData((prev) => ({ ...prev, payout: nextPayout }));
    setValidationErrors((prev) => ({
      ...prev,
      accountHolder: null,
      accountNumber: null,
    }));
  };

  // Robust declaration handler supporting both (field, checked) and object signature
  const handleDeclarationChange = (arg1, arg2) => {
    setIsDirty(true);
    if (typeof arg1 === 'object' && arg1 !== null) {
      setFormData((prev) => ({
        ...prev,
        declarations: {
          ...prev.declarations,
          ...arg1,
        },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        declarations: {
          ...prev.declarations,
          [arg1]: arg2,
        },
      }));
      setValidationErrors((prev) => ({ ...prev, [arg1]: null }));
    }
  };

  // Final Application Submission (Mock)
  const handleSubmitApplication = () => {
    if (!validateStep(10)) {
      window.scrollTo({ top: 100, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);

    setTimeout(() => {
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const generatedRef = `SALO-RIDER-${dateStr}-${randomSuffix}`;
      const submissionIso = today.toISOString();

      const fullName = `${formData.personal.firstName} ${formData.personal.lastName}`.trim();
      const verifiedEmail =
        formData.emailVerification.verifiedEmail ||
        formData.emailVerification.email ||
        formData.personal.email;

      const newRiderSubmission = {
        id: `rider-${Date.now()}`,
        referenceNumber: generatedRef,
        name: fullName,
        username: (formData.personal.firstName || 'rider').toLowerCase() + randomSuffix,
        email: verifiedEmail,
        companyName: formData.emailVerification.companyName || '',
        phone: formData.personal.phone,
        status: 'Pending Verification',
        applicationStatus: 'Pending Review',
        verificationStatus: 'Pending',
        vehicle: `${formData.deliveryMethod.replace('_', ' ').toUpperCase()} · ${formData.vehicleInfo.motoBrand || formData.vehicleInfo.bikeBrand || formData.vehicleInfo.ebikeBrand || 'Standard'}`,
        licenseNumber: formData.identity.idNumber || 'N/A',
        zone: formData.emergency.preferredCity || 'Quezon City',
        rating: 5.0,
        completedDeliveries: 0,
        earningsTotal: 0,
        submittedAt: submissionIso,
        deliveryMethod: formData.deliveryMethod,
        emailVerification: formData.emailVerification,
        personal: {
          ...formData.personal,
          email: verifiedEmail,
        },
        payout: {
          accountHolder: formData.payout.accountHolder,
          provider: formData.payout.provider,
          accountNumber: formData.payout.accountNumber,
        },
      };

      // 1. Sync to Admin riders list (so AdminRidersPage sees the new applicant)
      try {
        const currentRiders = adminService.getRiders();
        localStorage.setItem(
          'salo_admin_riders',
          JSON.stringify([newRiderSubmission, ...currentRiders])
        );
      } catch (e) {
        console.warn('Could not sync rider to admin storage', e);
      }

      // 2. Save to local storage for customer rider application status tracking
      try {
        const stored = localStorage.getItem(STORAGE_RIDER_APPS_KEY);
        const existing = stored ? JSON.parse(stored) : [];
        const nextList = [newRiderSubmission, ...existing];
        localStorage.setItem(STORAGE_RIDER_APPS_KEY, JSON.stringify(nextList));
      } catch (e) {
        console.warn('Could not save rider application to customer storage', e);
      }

      // Clear draft upon successful submission
      clearRiderDraft();
      setIsDirty(false);

      setSubmittedData({
        referenceNumber: generatedRef,
        submissionDate: submissionIso,
        applicantName: fullName,
        applicantEmail: verifiedEmail,
        deliveryMethod: formData.deliveryMethod,
      });

      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 1200);
  };

  // Exit button logic: exit immediately if clean, prompt 3-option modal if dirty
  const handleHeaderExit = () => {
    if (!isDirty) {
      navigate('/rider');
    } else {
      setExitModalOpen(true);
    }
  };

  // 3-Option Modal actions
  const handleSaveAndExit = async () => {
    const success = await saveDraftLocally();
    if (success) {
      setExitModalOpen(false);
      navigate('/rider');
    }
  };

  const handleExitWithoutSaving = () => {
    setExitModalOpen(false);
    navigate('/rider');
  };

  const handleCancelExit = () => {
    setExitModalOpen(false);
  };

  // Check if all essential previous steps are valid for review step
  const areAllRequiredStepsValid = () => {
    return (
      Boolean(formData.emailVerification.isVerified) &&
      Boolean(formData.personal.firstName) &&
      Boolean(formData.personal.lastName) &&
      Boolean(formData.identity.idNumber) &&
      Boolean(formData.deliveryMethod) &&
      Boolean(formData.emergency.contactName) &&
      Boolean(formData.payout.accountHolder)
    );
  };

  const hasVehicleDataEntered = Boolean(
    formData.vehicleInfo.motoBrand ||
    formData.vehicleInfo.bikeBrand ||
    formData.vehicleInfo.ebikeBrand ||
    formData.vehicleInfo.escooterBrand
  );

  return (
    <div className="rider-app-page">
      {/* Top Application Header */}
      <RiderApplicationHeader
        currentStep={currentStep}
        totalSteps={RIDER_APPLICATION_STEPS.length}
        onSaveDraft={saveDraftLocally}
        onExit={handleHeaderExit}
        isDraftSaved={isDraftSaved}
        savingDraft={savingDraft}
        lastSavedTime={lastSavedTime}
        saveError={saveError}
      />

      {/* Success Receipt View after Submission */}
      {submittedData ? (
        <ApplicationSuccess
          referenceNumber={submittedData.referenceNumber}
          submissionDate={submittedData.submissionDate}
          applicantName={submittedData.applicantName}
          applicantEmail={submittedData.applicantEmail}
          deliveryMethod={submittedData.deliveryMethod}
          onResetApplication={() => {
            setSubmittedData(null);
            setCurrentStep(1);
          }}
        />
      ) : (
        <>
          {/* Stepper Progress Bar */}
          <RiderApplicationProgress
            currentStep={currentStep}
            completedSteps={completedSteps}
            onStepClick={handleDirectStepJump}
          />

          {/* Main Form Body */}
          <main className="wizard-main-content">
            <div className="wizard-step-body animate-step-in" key={currentStep}>
              {currentStep === 1 && (
                <EmailVerificationStep
                  data={formData.emailVerification}
                  onChange={handleEmailVerificationChange}
                  errors={validationErrors}
                  currentUser={user}
                />
              )}

              {currentStep === 2 && (
                <PersonalInformationStep
                  data={formData.personal}
                  onChange={handlePersonalChange}
                  errors={validationErrors}
                  currentUser={user}
                />
              )}

              {currentStep === 3 && (
                <IdentityVerificationStep
                  data={formData.identity}
                  onChange={handleIdentityChange}
                  errors={validationErrors}
                />
              )}

              {currentStep === 4 && (
                <DeliveryMethodStep
                  selectedMethod={formData.deliveryMethod}
                  hasExistingVehicleData={hasVehicleDataEntered}
                  onSelectMethod={handleSelectDeliveryMethod}
                />
              )}

              {currentStep === 5 && (
                <VehicleInformationStep
                  deliveryMethod={formData.deliveryMethod}
                  data={formData.vehicleInfo}
                  onChange={handleVehicleInfoChange}
                  errors={validationErrors}
                />
              )}

              {currentStep === 6 && (
                <VehicleDocumentsStep
                  deliveryMethod={formData.deliveryMethod}
                  ownership={formData.vehicleInfo.ownership}
                  documents={formData.vehicleDocuments}
                  onDocumentUpload={handleVehicleDocumentUpload}
                  onDocumentRemove={handleVehicleDocumentRemove}
                  errors={validationErrors}
                />
              )}

              {currentStep === 7 && (
                <ClearanceDocumentsStep
                  documents={formData.clearanceDocuments}
                  onDocumentUpload={handleClearanceUpload}
                  onDocumentRemove={handleClearanceRemove}
                  errors={validationErrors}
                />
              )}

              {currentStep === 8 && (
                <EmergencyContactStep
                  data={formData.emergency}
                  onChange={handleEmergencyChange}
                  errors={validationErrors}
                />
              )}

              {currentStep === 9 && (
                <PayoutInformationStep
                  data={formData.payout}
                  onChange={handlePayoutChange}
                  errors={validationErrors}
                />
              )}

              {currentStep === 10 && (
                <RiderAgreementStep
                  applicationData={formData}
                  onNavigateToStep={handleDirectStepJump}
                  onDeclarationChange={handleDeclarationChange}
                  onSubmitApplication={handleSubmitApplication}
                  submitting={submitting}
                  allRequiredValid={areAllRequiredStepsValid()}
                  errors={validationErrors}
                />
              )}

              {/* Wizard Footer Navigation (Steps 1–9) */}
              {currentStep < 10 && (
                <div className="wizard-step-footer">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePrevStep}
                    disabled={currentStep === 1}
                  >
                    ← Back
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleNextStep}
                  >
                    {currentStep === 1 && !formData.emailVerification?.isVerified
                      ? 'Verify OTP to Continue →'
                      : 'Continue →'}
                  </Button>
                </div>
              )}
            </div>
          </main>
        </>
      )}

      {/* 3-Option Confirmation Modal Before Leaving Unsaved Application */}
      <ExitConfirmModal
        isOpen={exitModalOpen}
        onClose={handleCancelExit}
        onSaveAndExit={handleSaveAndExit}
        onExitWithoutSaving={handleExitWithoutSaving}
        isSaving={savingDraft}
      />
    </div>
  );
}

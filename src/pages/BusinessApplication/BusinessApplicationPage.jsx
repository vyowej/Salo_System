import { useState, useCallback, useEffect } from 'react';
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
} from './constants/applicationDefaults';
import { getRequiredDocuments } from './constants/documentRequirements';
import { adminService } from '../../services/adminService';
import './BusinessApplicationPage.css';

const SESSION_DRAFT_KEY = 'salo_partner_app_draft';
const STORAGE_PARTNER_APPS_KEY = 'salo_partner_applications';

export default function BusinessApplicationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // Wizard Step State
  const initialStepParam = parseInt(searchParams.get('step') || '1', 10);
  const [currentStep, setCurrentStep] = useState(
    initialStepParam >= 1 && initialStepParam <= 8 ? initialStepParam : 1
  );
  const [completedSteps, setCompletedSteps] = useState([1]);

  // Form State
  const [formData, setFormData] = useState(() => {
    try {
      const savedDraft = sessionStorage.getItem(SESSION_DRAFT_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        return {
          ...INITIAL_APPLICATION_STATE,
          ...parsed,
          documents: {}, // Browser File objects cannot be persisted in JSON; keep clean
        };
      }
    } catch {
      // fallback to initial
    }
    return INITIAL_APPLICATION_STATE;
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [isDraftSaved, setIsDraftSaved] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedData, setSubmittedData] = useState(null);

  // Sync email & company name to businessInfo if verified
  useEffect(() => {
    if (formData.emailVerification?.isVerified && formData.emailVerification?.verifiedEmail) {
      const verified = formData.emailVerification.verifiedEmail;
      const compName = formData.emailVerification.companyName?.trim() || '';
      setFormData((prev) => ({
        ...prev,
        businessInfo: {
          ...prev.businessInfo,
          businessEmail: (!prev.businessInfo.businessEmail || prev.emailVerification?.isSameAsAccount)
            ? verified
            : prev.businessInfo.businessEmail,
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

  // Sync draft state to sessionStorage (without File objects)
  const saveDraftLocally = useCallback(() => {
    setSavingDraft(true);
    try {
      const serializableData = {
        ...formData,
        documents: {},
        payout: {
          ...formData.payout,
          accountNumber: formData.payout.accountNumber ? `••••${formData.payout.accountNumber.slice(-4)}` : '',
          proofDocument: null,
        },
        configuration: {
          ...formData.configuration,
          logo: formData.configuration.logo ? { name: formData.configuration.logo.name } : null,
          coverPhoto: formData.configuration.coverPhoto ? { name: formData.configuration.coverPhoto.name } : null,
        },
      };
      sessionStorage.setItem(SESSION_DRAFT_KEY, JSON.stringify(serializableData));
      setIsDraftSaved(true);
      setLastSavedTime(new Date().toISOString());
      setTimeout(() => setIsDraftSaved(false), 3000);
    } catch (e) {
      console.warn('Unable to save draft to sessionStorage', e);
    } finally {
      setSavingDraft(false);
    }
  }, [formData]);

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
      if (!formData.businessInfo.businessEmail?.trim()) {
        errors.businessEmail = 'Please provide an official business email address.';
      } else if (!formData.businessInfo.businessEmail.includes('@')) {
        errors.businessEmail = 'Please enter a valid email address.';
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
      if (!formData.representative.email?.trim() || !formData.representative.email.includes('@')) {
        errors.email = 'Valid personal email is required.';
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
        if (!formData.documents[reqDoc.id]?.name && !formData.documents[reqDoc.id]?.dataUrl) {
          errors[reqDoc.id] = `${reqDoc.title} is required.`;
        }
      }
    }

    if (stepNumber === 5) {
      if (!formData.address.street?.trim()) {
        errors.street = 'Street or building address is required.';
      }
      if (!formData.address.postalCode?.trim()) {
        errors.postalCode = 'Postal code is required.';
      }
      if (!formData.address.barangay?.trim()) {
        errors.barangay = 'Barangay is required.';
      }
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
      const hasAnyService = Object.values(formData.configuration.services || {}).some(Boolean);
      if (!hasAnyService) {
        errors.services = 'Please select at least one restaurant service (Delivery, Pickup, or Table Reservations).';
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
    setCurrentStep(targetStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Document Upload Handlers
  const handleDocumentUpload = (docId, fileData) => {
    setFormData((prev) => ({
      ...prev,
      documents: {
        ...prev.documents,
        [docId]: fileData,
      },
    }));
    setValidationErrors((prev) => ({ ...prev, [docId]: null }));
  };

  const handleDocumentRemove = (docId) => {
    setFormData((prev) => {
      const nextDocs = { ...prev.documents };
      delete nextDocs[docId];
      return { ...prev, documents: nextDocs };
    });
  };

  // Final Application Submission (Mock)
  const handleSubmitApplication = () => {
    setSubmitting(true);

    setTimeout(() => {
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const generatedRef = `SALO-APP-${dateStr}-${randomSuffix}`;
      const submissionIso = today.toISOString();

      const newApplication = {
        id: generatedRef,
        referenceNumber: generatedRef,
        name: formData.businessInfo.restaurantName,
        restaurantName: formData.businessInfo.restaurantName,
        businessType: formData.businessInfo.businessType,
        ownershipStructure: formData.businessInfo.ownershipStructure,
        cuisine: formData.businessInfo.cuisineType,
        ownerName: `${formData.representative.firstName} ${formData.representative.lastName}`,
        ownerEmail: formData.representative.email || formData.emailVerification.verifiedEmail,
        phone: formData.businessInfo.businessPhone,
        address: `${formData.address.street}, Brgy. ${formData.address.barangay}, ${formData.address.city}`,
        zone: formData.address.city,
        status: 'Submitted',
        applicationStatus: 'Submitted',
        verificationStatus: 'Pending',
        operatingStatus: 'Pending Activation',
        submittedAt: submissionIso,
        joinedDate: submissionIso.split('T')[0],
        documents: Object.keys(formData.documents).map((docId) => ({
          id: docId,
          name: formData.documents[docId]?.name || docId,
          type: formData.documents[docId]?.type,
          size: formData.documents[docId]?.size,
          uploadedAt: formData.documents[docId]?.uploadedAt || submissionIso,
          verificationStatus: 'Pending Review',
        })),
        requestedDocuments: [],
        applicationHistory: [
          {
            id: `hist-${Date.now()}`,
            title: 'Application Submitted',
            description: `Application received for ${formData.businessInfo.restaurantName} (${formData.businessInfo.ownershipStructure}). Initial mandatory documents queued for compliance review.`,
            time: submissionIso,
          },
        ],
      };

      // Push to adminService so Admin sees it in AdminRestaurantsPage!
      try {
        const currentRests = adminService.getRestaurants();
        adminService.saveRestaurants?.([newApplication, ...currentRests]) ||
          adminService.updateRestaurantStatus(newApplication.id, 'Submitted', newApplication);
      } catch (e) {
        console.warn('Could not sync to adminService', e);
      }

      // Save to localStorage for customer partner application tracking
      try {
        const stored = localStorage.getItem(STORAGE_PARTNER_APPS_KEY);
        const existing = stored ? JSON.parse(stored) : {};
        existing.restaurant = {
          id: generatedRef,
          name: newApplication.restaurantName,
          status: 'Submitted',
          applicationStatus: 'Submitted',
          submittedAt: newApplication.joinedDate,
          referenceNumber: generatedRef,
          businessInfo: formData.businessInfo,
          representative: formData.representative,
          documents: formData.documents,
          requestedDocuments: [],
        };
        localStorage.setItem(STORAGE_PARTNER_APPS_KEY, JSON.stringify(existing));
      } catch (e) {
        console.warn('Could not save partner application to storage', e);
      }

      setSubmittedData({
        referenceNumber: generatedRef,
        submissionDate: submissionIso,
        restaurantName: newApplication.restaurantName,
        applicantEmail: newApplication.ownerEmail,
      });

      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 1200);
  };

  const handleExitConfirm = () => {
    setExitModalOpen(false);
    navigate('/customer/partner');
  };

  // Check if all prior steps are valid for review submit
  const areAllRequiredStepsValid = () => {
    return (
      Boolean(formData.emailVerification?.isVerified) &&
      Boolean(formData.businessInfo.restaurantName) &&
      Boolean(formData.representative.firstName) &&
      Boolean(formData.address.street) &&
      Boolean(formData.payout.accountHolder)
    );
  };

  return (
    <div className="business-app-page">
      {/* Top Header */}
      <ApplicationHeader
        currentStep={currentStep}
        totalSteps={WIZARD_STEPS.length}
        onSaveDraft={saveDraftLocally}
        onExit={() => setExitModalOpen(true)}
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
                    setFormData((prev) => ({
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
                  onChange={(next) => setFormData((prev) => ({ ...prev, businessInfo: next }))}
                  verifiedEmail={formData.emailVerification?.verifiedEmail || formData.emailVerification?.email || ''}
                  errors={validationErrors}
                />
              )}

              {currentStep === 3 && (
                <RepresentativeInformationStep
                  data={formData.representative}
                  onChange={(next) => setFormData((prev) => ({ ...prev, representative: next }))}
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
                  onChange={(next) => setFormData((prev) => ({ ...prev, address: next }))}
                  errors={validationErrors}
                />
              )}

              {currentStep === 6 && (
                <PayoutInformationStep
                  data={formData.payout}
                  onChange={(next) => setFormData((prev) => ({ ...prev, payout: next }))}
                  errors={validationErrors}
                />
              )}

              {currentStep === 7 && (
                <RestaurantConfigurationStep
                  data={formData.configuration}
                  onChange={(next) => setFormData((prev) => ({ ...prev, configuration: next }))}
                  errors={validationErrors}
                />
              )}

              {currentStep === 8 && (
                <ApplicationReviewStep
                  applicationData={formData}
                  onNavigateToStep={handleDirectStepJump}
                  onDeclarationChange={(next) => setFormData((prev) => ({ ...prev, review: next }))}
                  onSubmitApplication={handleSubmitApplication}
                  submitting={submitting}
                  allRequiredValid={areAllRequiredStepsValid()}
                />
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
                    Continue →
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
        onSaveAndExit={() => {
          saveDraftLocally();
          handleExitConfirm();
        }}
        onExitWithoutSaving={handleExitConfirm}
        isSaving={savingDraft}
      />
    </div>
  );
}

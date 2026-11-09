import { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import ApplicationHeader from './components/ApplicationHeader';
import ApplicationProgress from './components/ApplicationProgress';
import BusinessInformationStep from './components/BusinessInformationStep';
import RepresentativeInformationStep from './components/RepresentativeInformationStep';
import BusinessDocumentsStep from './components/BusinessDocumentsStep';
import BusinessAddressStep from './components/BusinessAddressStep';
import PayoutInformationStep from './components/PayoutInformationStep';
import RestaurantConfigurationStep from './components/RestaurantConfigurationStep';
import EmailVerificationStep from './components/EmailVerificationStep';
import ApplicationReviewStep from './components/ApplicationReviewStep';
import ApplicationSuccess from './components/ApplicationSuccess';
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
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedData, setSubmittedData] = useState(null);

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

    if (stepNumber === 2) {
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

    if (stepNumber === 3) {
      const requiredDocs = getRequiredDocuments(
        formData.businessInfo.ownershipStructure,
        formData.representative.position
      ).filter((d) => d.required);

      for (const reqDoc of requiredDocs) {
        if (!formData.documents[reqDoc.id]?.name) {
          errors[reqDoc.id] = `${reqDoc.title} is required.`;
        }
      }
    }

    if (stepNumber === 4) {
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

    if (stepNumber === 5) {
      if (!formData.payout.accountHolder?.trim()) {
        errors.accountHolder = 'Account holder name is required.';
      }
      if (!formData.payout.accountNumber?.trim()) {
        errors.accountNumber = 'Bank account number is required.';
      } else if (formData.payout.accountNumber.length < 8) {
        errors.accountNumber = 'Account number must be at least 8 digits.';
      }
    }

    if (stepNumber === 6) {
      const hasAnyService = Object.values(formData.configuration.services || {}).some(Boolean);
      if (!hasAnyService) {
        errors.services = 'Please select at least one restaurant service (Delivery, Pickup, Dine-in, or Reservations).';
      }
    }

    if (stepNumber === 7) {
      if (!formData.emailVerification.isVerified) {
        errors.verification = 'Please verify your email address to proceed.';
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

  // Email Verification Handlers
  const handleVerifySuccess = (verificationMeta) => {
    setFormData((prev) => ({
      ...prev,
      emailVerification: verificationMeta,
    }));
    setCompletedSteps((prev) => [...prev, 7]);
    setValidationErrors((prev) => ({ ...prev, verification: null }));
  };

  const handleEmailChange = (newEmail) => {
    setFormData((prev) => ({
      ...prev,
      representative: {
        ...prev.representative,
        email: newEmail,
      },
      emailVerification: {
        isVerified: false,
        verifiedEmail: '',
        verifiedAt: null,
      },
    }));
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
        referenceNumber: generatedRef,
        restaurantName: formData.businessInfo.restaurantName,
        cuisine: formData.businessInfo.cuisineType,
        ownerName: `${formData.representative.firstName} ${formData.representative.lastName}`,
        ownerEmail: formData.representative.email,
        phone: formData.businessInfo.businessPhone,
        address: `${formData.address.street}, Brgy. ${formData.address.barangay}, ${formData.address.city}`,
        status: 'Pending Review',
        submittedAt: submissionIso,
        joinedDate: submissionIso.split('T')[0],
        dtiNumber: formData.documents?.dti_certificate?.name ? 'Verified File' : 'Submitted Online',
      };

      // Push to adminService so Admin sees it in AdminRestaurantsPage!
      try {
        const currentRests = adminService.getRestaurants();
        adminService.saveRestaurants([newApplication, ...currentRests]);
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
          status: 'Pending Review',
          submittedAt: newApplication.joinedDate,
          referenceNumber: generatedRef,
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
                <BusinessInformationStep
                  data={formData.businessInfo}
                  onChange={(next) => setFormData((prev) => ({ ...prev, businessInfo: next }))}
                  errors={validationErrors}
                />
              )}

              {currentStep === 2 && (
                <RepresentativeInformationStep
                  data={formData.representative}
                  onChange={(next) => setFormData((prev) => ({ ...prev, representative: next }))}
                  errors={validationErrors}
                  currentUser={user}
                />
              )}

              {currentStep === 3 && (
                <BusinessDocumentsStep
                  ownershipStructure={formData.businessInfo.ownershipStructure}
                  position={formData.representative.position}
                  documents={formData.documents}
                  onDocumentUpload={handleDocumentUpload}
                  onDocumentRemove={handleDocumentRemove}
                  errors={validationErrors}
                />
              )}

              {currentStep === 4 && (
                <BusinessAddressStep
                  data={formData.address}
                  onChange={(next) => setFormData((prev) => ({ ...prev, address: next }))}
                  errors={validationErrors}
                />
              )}

              {currentStep === 5 && (
                <PayoutInformationStep
                  data={formData.payout}
                  onChange={(next) => setFormData((prev) => ({ ...prev, payout: next }))}
                  errors={validationErrors}
                />
              )}

              {currentStep === 6 && (
                <RestaurantConfigurationStep
                  data={formData.configuration}
                  onChange={(next) => setFormData((prev) => ({ ...prev, configuration: next }))}
                  errors={validationErrors}
                />
              )}

              {currentStep === 7 && (
                <EmailVerificationStep
                  targetEmail={formData.representative.email || formData.businessInfo.businessEmail}
                  verificationState={formData.emailVerification}
                  onVerifySuccess={handleVerifySuccess}
                  onEmailChange={handleEmailChange}
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

      {/* Exit Confirmation Modal */}
      <Modal
        open={exitModalOpen}
        onClose={() => setExitModalOpen(false)}
        title="Leave Partner Application?"
        size="sm"
      >
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '0 0 var(--space-4)' }}>
          You have an application in progress. You can save your draft to continue later, or discard your current session.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              saveDraftLocally();
              handleExitConfirm();
            }}
          >
            Save Draft & Exit
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleExitConfirm}
          >
            Discard
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => setExitModalOpen(false)}
          >
            Stay on Page
          </Button>
        </div>
      </Modal>
    </div>
  );
}

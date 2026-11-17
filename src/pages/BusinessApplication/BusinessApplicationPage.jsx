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
  validateRestaurantServices,
} from './constants/applicationDefaults';
import { getRequiredDocuments } from './constants/documentRequirements';
import applicationService from '../../services/applicationService';
import { resolveUploadableFile, mapAccountTypeToEnum } from '../../services/formDataHelper';
import './BusinessApplicationPage.css';

const SESSION_DRAFT_KEY = 'salo_partner_app_draft';

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
          menuItems: (formData.configuration.menuItems || []).map((item) => ({
            ...item,
            photoFile: null,
          })),
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

  // Final Application Submission
  const handleSubmitApplication = async () => {
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
      return;
    }

    setSubmitting(true);
    setValidationErrors((prev) => ({ ...prev, submit: undefined }));

    try {
      const fd = new FormData();
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
      if (formData.address.coordinates?.lat != null) fd.append('latitude', String(formData.address.coordinates.lat));
      if (formData.address.coordinates?.lng != null) fd.append('longitude', String(formData.address.coordinates.lng));

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

      const created = await applicationService.submitRestaurantApplication(fd);

      sessionStorage.removeItem(SESSION_DRAFT_KEY);

      setSubmittedData({
        referenceNumber: created?.reference_number,
        submissionDate: created?.submitted_at || new Date().toISOString(),
        restaurantName: created?.restaurant_name || formData.businessInfo.restaurantName,
        applicantEmail: created?.contact_email || verifiedEmail,
      });

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      const fieldErrors = {};
      if (error?.errors && typeof error.errors === 'object') {
        Object.entries(error.errors).forEach(([key, msgs]) => {
          const firstMsg = Array.isArray(msgs) ? msgs[0] : String(msgs);
          if (firstMsg) {
            fieldErrors[key] = firstMsg;
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
      setSubmitting(false);
    }
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
      Boolean(formData.payout.accountHolder) &&
      !validateRestaurantServices(formData.configuration?.services)
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

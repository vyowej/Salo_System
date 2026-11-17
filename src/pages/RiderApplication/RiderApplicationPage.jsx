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
import applicationService from '../../services/applicationService';
import { resolveUploadableFile, mapAccountTypeToEnum } from '../../services/formDataHelper';
import './RiderApplicationPage.css';

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
        const parsedYear = Number(formData.vehicleInfo.motoYear);
        const maxYear = new Date().getFullYear() + 1;
        if (!String(formData.vehicleInfo.motoYear ?? '').trim() || !Number.isInteger(parsedYear) || parsedYear < 1980 || parsedYear > maxYear) {
          errors.motoYear = `Valid motorcycle model year (1980–${maxYear}) is required.`;
        }
        if (!formData.vehicleInfo.motoColor?.trim()) {
          errors.motoColor = 'Motorcycle body color is required.';
        }
        if (!formData.vehicleInfo.plateNumber?.trim()) {
          errors.plateNumber = 'License plate or MV file number is required.';
        }
        if (formData.vehicleInfo.ownership !== 'Personally Owned') {
          if (!formData.vehicleInfo.ownerName?.trim()) {
            errors.ownerName = 'Registered owner name is required for borrowed/rented vehicles.';
          }
          if (!formData.vehicleInfo.ownerRelationship?.trim()) {
            errors.ownerRelationship = 'Relationship to the registered owner is required.';
          }
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

  const handleSubmitApplication = async () => {
    if (!validateStep(10)) {
      window.scrollTo({ top: 100, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);
    setValidationErrors((prev) => ({ ...prev, submit: undefined }));

    try {
      const fd = new FormData();
      const mapGovIdType = (label) => {
        const lower = String(label || '').toLowerCase();
        if (lower.includes('philid') || lower.includes('national id')) return 'philid';
        if (lower.includes('driver')) return 'drivers_license';
        if (lower.includes('passport')) return 'passport';
        if (lower.includes('umid')) return 'umid';
        if (lower.includes('sss')) return 'sss';
        if (lower.includes('postal')) return 'postal_id';
        if (lower.includes('prc')) return 'prc';
        if (lower.includes('voter') || lower.includes('comelec')) return 'voters_comelec';
        return 'other';
      };

      const mapGender = (val) => {
        const lower = String(val || '').toLowerCase();
        if (lower === 'male') return 'male';
        if (lower === 'female') return 'female';
        if (lower.includes('non')) return 'non_binary_other';
        return 'prefer_not_to_say';
      };

      const mapOwnership = (val) => {
        const lower = String(val || '').toLowerCase();
        if (lower.includes('family')) return 'family_owned';
        if (lower.includes('borrow')) return 'borrowed';
        if (lower.includes('rent') || lower.includes('leas')) return 'rented_leased';
        if (lower.includes('company')) return 'company_owned';
        return 'personally_owned';
      };

      const mapBikeType = (val) => {
        const lower = String(val || '').toLowerCase();
        if (lower.includes('road')) return 'road';
        if (lower.includes('mountain') || lower.includes('mtb')) return 'mountain';
        if (lower.includes('city') || lower.includes('commuter')) return 'city_commuter';
        if (lower.includes('fold')) return 'folding';
        if (lower.includes('gravel')) return 'gravel';
        if (lower.includes('cargo')) return 'cargo';
        return 'other';
      };

      const mapRelationship = (val) => {
        const lower = String(val || '').toLowerCase();
        if (lower.includes('parent')) return 'parent';
        if (lower.includes('spouse') || lower.includes('partner')) return 'spouse_partner';
        if (lower.includes('sibling')) return 'sibling';
        if (lower.includes('child')) return 'child';
        if (lower.includes('relative')) return 'relative';
        if (lower.includes('friend')) return 'friend';
        if (lower.includes('colleague')) return 'colleague';
        return 'other';
      };

      const verifiedEmail =
        formData.emailVerification.verifiedEmail ||
        formData.emailVerification.email ||
        formData.personal.email ||
        user?.email ||
        '';

      fd.append('legal_first_name', formData.personal.firstName || '');
      if (formData.personal.middleName) fd.append('legal_middle_name', formData.personal.middleName);
      fd.append('legal_last_name', formData.personal.lastName || '');
      if (formData.personal.suffix) fd.append('legal_suffix', formData.personal.suffix);
      fd.append('date_of_birth', formData.personal.dateOfBirth || '');
      fd.append('gender', mapGender(formData.personal.gender));
      fd.append('contact_phone', formData.personal.phone || '');
      fd.append('contact_email', verifiedEmail);
      if (formData.emailVerification.companyName) fd.append('company_name', formData.emailVerification.companyName);

      fd.append('province', formData.personal.address?.province || 'Metro Manila');
      fd.append('city', formData.personal.address?.city || 'Quezon City');
      fd.append('barangay', formData.personal.address?.barangay || 'South Triangle');
      if (formData.personal.address?.street) fd.append('street', formData.personal.address.street);
      if (formData.personal.address?.postalCode) fd.append('postal_code', formData.personal.address.postalCode);

      fd.append('gov_id_type', mapGovIdType(formData.identity.idType));
      fd.append('gov_id_number', formData.identity.idNumber || '');
      fd.append('gov_id_is_permanent', formData.identity.isPermanent ? '1' : '0');
      if (!formData.identity.isPermanent && formData.identity.expiryDate) {
        fd.append('gov_id_expires_on', formData.identity.expiryDate);
      }

      const method = formData.deliveryMethod || 'motorcycle';
      fd.append('vehicle_type', method);

      if (method === 'motorcycle') {
        if (formData.vehicleInfo.motoBrand) fd.append('vehicle_brand', formData.vehicleInfo.motoBrand);
        if (formData.vehicleInfo.motoModel) fd.append('vehicle_model', formData.vehicleInfo.motoModel);
        if (formData.vehicleInfo.motoColor) fd.append('vehicle_color', formData.vehicleInfo.motoColor);
        if (formData.vehicleInfo.motoYear) fd.append('vehicle_year', String(formData.vehicleInfo.motoYear));
        if (formData.vehicleInfo.plateNumber) fd.append('plate_number', formData.vehicleInfo.plateNumber);
        if (formData.vehicleInfo.mvFileNumber) fd.append('mv_file_number', formData.vehicleInfo.mvFileNumber);
        fd.append('vehicle_ownership', mapOwnership(formData.vehicleInfo.ownership));
        if (formData.vehicleInfo.ownerName) fd.append('vehicle_owner_name', formData.vehicleInfo.ownerName);
        if (formData.vehicleInfo.ownerRelationship) fd.append('vehicle_owner_relationship', formData.vehicleInfo.ownerRelationship);
      } else if (method === 'bicycle') {
        fd.append('bicycle_type', mapBikeType(formData.vehicleInfo.bikeType));
        if (formData.vehicleInfo.bikeBrand) fd.append('vehicle_brand', formData.vehicleInfo.bikeBrand);
        if (formData.vehicleInfo.bikeModel) fd.append('vehicle_model', formData.vehicleInfo.bikeModel);
        if (formData.vehicleInfo.bikeColor) fd.append('vehicle_color', formData.vehicleInfo.bikeColor);
      } else if (method === 'e_bike') {
        if (formData.vehicleInfo.ebikeBrand) fd.append('vehicle_brand', formData.vehicleInfo.ebikeBrand);
        if (formData.vehicleInfo.ebikeModel) fd.append('vehicle_model', formData.vehicleInfo.ebikeModel);
        if (formData.vehicleInfo.ebikeColor) fd.append('vehicle_color', formData.vehicleInfo.ebikeColor);
        if (formData.vehicleInfo.ebikeWattage) fd.append('motor_wattage', formData.vehicleInfo.ebikeWattage);
      } else if (method === 'e_scooter') {
        if (formData.vehicleInfo.escooterBrand) fd.append('vehicle_brand', formData.vehicleInfo.escooterBrand);
        if (formData.vehicleInfo.escooterModel) fd.append('vehicle_model', formData.vehicleInfo.escooterModel);
        if (formData.vehicleInfo.escooterColor) fd.append('vehicle_color', formData.vehicleInfo.escooterColor);
      }

      fd.append('emergency_contact_name', formData.emergency.contactName || '');
      fd.append('emergency_contact_relationship', mapRelationship(formData.emergency.relationship));
      fd.append('emergency_contact_phone', formData.emergency.phone || '');
      if (formData.emergency.altPhone) fd.append('emergency_contact_alt_phone', formData.emergency.altPhone);
      fd.append('base_city', formData.emergency.preferredCity || formData.personal.address?.city || 'Quezon City');
      fd.append('base_province', formData.personal.address?.province || 'Metro Manila');
      if (formData.emergency.preferredBarangayHubs) fd.append('preferred_hubs', formData.emergency.preferredBarangayHubs);
      (formData.emergency.preferredShifts || []).forEach((s) => fd.append('preferred_shifts[]', s));
      (formData.emergency.availableDays || []).forEach((d) => fd.append('available_days[]', d));

      fd.append('payout_provider', formData.payout.provider || 'GCash');
      fd.append('payout_account_type', mapAccountTypeToEnum(formData.payout.accountType));
      fd.append('payout_account_holder_name', formData.payout.accountHolder || '');
      fd.append('payout_account_number', formData.payout.accountNumber || '');
      fd.append('terms_accepted', '1');
      fd.append('terms_version', 'v1.0');

      const frontIdFile = resolveUploadableFile(formData.identity.frontPhoto, 'government_id_front.jpg');
      if (frontIdFile) fd.append('documents[government_id_front]', frontIdFile);

      const backIdFile = resolveUploadableFile(formData.identity.backPhoto, 'government_id_back.jpg');
      if (backIdFile) fd.append('documents[government_id_back]', backIdFile);

      const selfieFile = resolveUploadableFile(formData.identity.selfiePhoto, 'selfie.jpg');
      if (selfieFile) fd.append('documents[selfie]', selfieFile);

      const vehiclePhotoFile = resolveUploadableFile(formData.vehicleInfo?.vehiclePhoto, `${method}_photo.jpg`);
      if (vehiclePhotoFile) {
        const photoCodeMap = {
          motorcycle: 'motorcycle_photo',
          bicycle: 'bicycle_photo',
          e_bike: 'ebike_photo',
          e_scooter: 'escooter_photo',
        };
        if (photoCodeMap[method]) {
          fd.append(`documents[${photoCodeMap[method]}]`, vehiclePhotoFile);
        }
      }

      Object.entries(formData.vehicleDocuments || {}).forEach(([docId, entry]) => {
        const file = resolveUploadableFile(entry, `${docId}.pdf`);
        if (file) fd.append(`documents[${docId}]`, file);
      });

      Object.entries(formData.clearanceDocuments || {}).forEach(([docId, entry]) => {
        const file = resolveUploadableFile(entry, `${docId}.pdf`);
        if (file) fd.append(`documents[${docId}]`, file);
      });

      if (formData.payout?.proofDocument) {
        const proofFile = resolveUploadableFile(formData.payout.proofDocument, 'bank_proof.pdf');
        if (proofFile) fd.append('documents[bank_proof]', proofFile);
      }

      const created = await applicationService.submitRiderApplication(fd);

      clearRiderDraft();
      setIsDirty(false);

      const fullName = `${formData.personal.firstName} ${formData.personal.lastName}`.trim();
      setSubmittedData({
        referenceNumber: created?.reference_number,
        submissionDate: created?.submitted_at || new Date().toISOString(),
        applicantName: fullName,
        applicantEmail: created?.contact_email || verifiedEmail,
        deliveryMethod: formData.deliveryMethod,
      });

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setValidationErrors((prev) => ({
        ...prev,
        submit: error?.message || 'Unable to submit rider application. Please review your details and try again.',
      }));
    } finally {
      setSubmitting(false);
    }
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
                  verifiedEmail={formData.emailVerification?.verifiedEmail || formData.emailVerification?.email || ''}
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

              {validationErrors.submit && (
                <div className="wizard-error-banner" role="alert" style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                  {validationErrors.submit}
                </div>
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

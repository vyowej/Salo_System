import { useState } from 'react';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import AddressStep from '../components/application/AddressStep';
import PersonalInfoStep from '../components/application/PersonalInfoStep';
import ReviewStep from '../components/application/ReviewStep';
import StepperHeader from '../components/application/StepperHeader';
import SuccessState from '../components/application/SuccessState';
import VehicleDocumentsStep from '../components/application/VehicleDocumentsStep';
import { RIDER_APPLICATION_FIELDS, RIDER_APPLICATION_STEPS, vehicleTypes } from '../constants';
import { updateRecordValue } from '../constants/riderSettings';
import { getRiderMock } from '../mocks';
import useScenario from '../hooks/useScenario';
import './RiderApplicationFormPage.css';

const EMPTY_FORM = Object.fromEntries(RIDER_APPLICATION_FIELDS.map((field) => [field.key, '']));

export default function RiderApplicationFormPage() {
  const scenario = useScenario();
  const preview = getRiderMock('applicationPreview', scenario);
  const [step, setStep] = useState(0);
  const [vehicleType, setVehicleType] = useState(vehicleTypes[0].label);
  const [form, setForm] = useState(EMPTY_FORM);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const viewState = scenario === 'active' ? 'ready' : scenario;

  function updateField(key, value) {
    setForm((current) => updateRecordValue(current, key, value));
  }

  return (
    <div className="rider-page-shell">
      <PageHeader title="Rider application" subtitle={preview.intro} eyebrow="Join SALO delivery" />
      <StateView
        state={viewState}
        emptyTitle="Application preview unavailable"
        emptyMessage="No rider application details are available in this preview."
        onRetry={() => setStep(0)}
      >
        {submitted ? (
          <SuccessState />
        ) : (
          <Card>
            <CardBody>
              <StepperHeader steps={RIDER_APPLICATION_STEPS} activeStep={step} />
              {step === 0 && (
                <PersonalInfoStep
                  fields={RIDER_APPLICATION_FIELDS}
                  form={form}
                  onChange={updateField}
                />
              )}
              {step === 1 && (
                <AddressStep
                  form={form}
                  vehicleType={vehicleType}
                  vehicleTypes={vehicleTypes}
                  onChange={updateField}
                  onVehicleChange={setVehicleType}
                />
              )}
              {step === 2 && (
                <VehicleDocumentsStep vehicleTypes={vehicleTypes} vehicleType={vehicleType} />
              )}
              {step === 3 && (
                <ReviewStep
                  fields={RIDER_APPLICATION_FIELDS}
                  form={form}
                  vehicleType={vehicleType}
                  termsAccepted={termsAccepted}
                  onTermsChange={setTermsAccepted}
                />
              )}
              <div className="rider-form-actions">
                {step > 0 && (
                  <Button variant="outline" onClick={() => setStep((current) => current - 1)}>
                    Back
                  </Button>
                )}
                {step < RIDER_APPLICATION_STEPS.length - 1 ? (
                  <Button variant="primary" onClick={() => setStep((current) => current + 1)}>
                    Continue
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => setSubmitted(true)} disabled={!termsAccepted}>
                    Submit design preview
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        )}
      </StateView>
    </div>
  );
}

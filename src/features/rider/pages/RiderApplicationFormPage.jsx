import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import { RIDER_APPLICATION_FIELDS, vehicleTypes } from '../constants';
import { applicationStatuses } from '../constants/statusConfig';
import { riderMockData } from '../mocks';
import useScenario from '../hooks/useScenario';
import './RiderApplicationFormPage.css';

const EMPTY_FORM = Object.fromEntries(RIDER_APPLICATION_FIELDS.map((field) => [field.key, '']));

export default function RiderApplicationFormPage() {
  const scenario = useScenario();
  const [step, setStep] = useState(0);
  const [vehicleType, setVehicleType] = useState(vehicleTypes[0].label);
  const [form, setForm] = useState(EMPTY_FORM);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const steps = useMemo(() => ['Personal info', 'Address', 'Vehicle & documents', 'Review & submit'], []);

  if (scenario === 'loading') {
    return (
      <div className="rider-page-shell">
        <PageHeader title="Rider application" subtitle={riderMockData.applicationPreview.intro} eyebrow="Join SALO delivery" />
        <StateView state="loading" />
      </div>
    );
  }

  if (scenario === 'empty' || scenario === 'error') {
    return (
      <div className="rider-page-shell">
        <PageHeader title="Rider application" subtitle={riderMockData.applicationPreview.intro} eyebrow="Join SALO delivery" />
        <StateView state={scenario} emptyTitle="Application preview unavailable" emptyMessage="No rider application details are available in this preview." onRetry={() => setStep(0)} />
      </div>
    );
  }

  return (
    <div className="rider-page-shell">
      <PageHeader title="Rider application" subtitle={riderMockData.applicationPreview.intro} eyebrow="Join SALO delivery" />

      {submitted ? (
        <Card className="rider-application-result">
          <CardBody className="rider-application-result-body">
            <span className="rider-application-result-icon" aria-hidden="true">✓</span>
            <h2>Application submitted</h2>
            <StatusBadge status="under_review" config={applicationStatuses} />
            <p>Your application is under review and no data was submitted in this design preview.</p>
            <Button as={Link} to="/rider/application/status" variant="primary">View application status</Button>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <div className="rider-form-steps" aria-label="Application steps">
              {steps.map((label, index) => (
                <span key={label} className={index === step ? 'active' : index < step ? 'complete' : ''}>{label}</span>
              ))}
            </div>

            {step === 0 && (
              <div className="rider-form-grid">
                {RIDER_APPLICATION_FIELDS.map((field) => (
                  <label key={field.key} className="rider-field">
                    <span>{field.label}</span>
                    <input
                      type={field.type}
                      placeholder={field.placeholder}
                      value={form[field.key]}
                      onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                    />
                  </label>
                ))}
              </div>
            )}

            {step === 1 && (
              <div className="rider-form-grid single-column">
                <label className="rider-field">
                  <span>Residential address</span>
                  <input placeholder="Street, barangay, city" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
                </label>
                <label className="rider-field">
                  <span>Preferred vehicle type</span>
                  <select value={vehicleType} onChange={(event) => setVehicleType(event.target.value)}>
                    {vehicleTypes.map((item) => <option key={item.key} value={item.label}>{item.label}</option>)}
                  </select>
                </label>
                <label className="rider-field">
                  <span>Vehicle details</span>
                  <input placeholder="Model, plate, and registration details" />
                </label>
              </div>
            )}

            {step === 2 && (
              <div className="rider-form-grid single-column">
                {vehicleTypes.find((item) => item.label === vehicleType)?.requiredDocuments?.map((doc) => (
                  <label key={doc} className="rider-upload-field-inline">
                    <span>{doc}</span>
                    <input type="file" accept="image/*,.pdf" />
                  </label>
                )) || <p className="rider-form-hint">No documents required for this selected vehicle type.</p>}
              </div>
            )}

            {step === 3 && (
              <div className="rider-review-panel">
                <h3>Review your application</h3>
                <dl>
                  {RIDER_APPLICATION_FIELDS.map((field) => (
                    <div key={field.key} className="rider-review-row">
                      <dt>{field.label}</dt>
                      <dd>{form[field.key] || 'Not provided in this preview'}</dd>
                    </div>
                  ))}
                  <div className="rider-review-row">
                    <dt>Vehicle type</dt>
                    <dd>{vehicleType}</dd>
                  </div>
                </dl>
                <label className="rider-checkbox-row">
                  <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                  <span>I confirm that the information above is accurate.</span>
                </label>
              </div>
            )}

            <div className="rider-form-actions">
              {step > 0 && <Button variant="outline" onClick={() => setStep((current) => current - 1)}>Back</Button>}
              {step < steps.length - 1 ? (
                <Button variant="primary" onClick={() => setStep((current) => current + 1)}>Continue</Button>
              ) : (
                <Button variant="primary" onClick={() => setSubmitted(true)} disabled={!termsAccepted}>Submit design preview</Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

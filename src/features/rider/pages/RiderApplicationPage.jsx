import { useState } from 'react';
import Button from '../../../components/common/Button';
import { RiderCard, RiderPageHeading, RiderUploadField } from '../components/RiderUI';
import { RIDER_APPLICATION_FIELDS, VEHICLE_TYPES, RIDER_PAGE_META } from '../constants/riderConstants';
import { riderMockData, riderPreviewState } from '../mocks';
import StateView from '../components/StateView';
import useScenario from '../hooks/useScenario';
import ScenarioLink from '../components/ScenarioLink';
import './RiderApplicationPage.css';

const EMPTY_FORM = Object.fromEntries(RIDER_APPLICATION_FIELDS.map((field) => [field.key, '']));

export default function RiderApplicationPage() {
  const scenario = useScenario();
  const [step, setStep] = useState(0);
  const [vehicleType, setVehicleType] = useState(VEHICLE_TYPES[0]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [photos, setPhotos] = useState({});
  const [success, setSuccess] = useState(false);

  function chooseFile(key, event) {
    const file = event.target.files?.[0];
    if (file) setPhotos((current) => ({ ...current, [key]: URL.createObjectURL(file) }));
  }

  return (
    <>
      <RiderPageHeading
        eyebrow={RIDER_PAGE_META['/rider/application'].eyebrow}
        title={RIDER_PAGE_META['/rider/application'].title}
        description={riderMockData.applicationPreview.intro}
      />
      <StateView
        state={scenario === 'active' || scenario === 'default' ? 'ready' : scenario}
        emptyTitle="Application preview unavailable"
        emptyMessage="No rider application details are available in this preview."
        onRetry={() => setStep(0)}
      >
      {success ? (
        <RiderCard title={riderMockData.applicationPreview.submittedTitle} description={riderMockData.applicationPreview.submittedMessage}>
          <div className="rider-application-success">
            <span aria-hidden="true">✓</span>
            <Button as={ScenarioLink} to="/rider/application" variant="primary">{'View application status preview'}</Button>
          </div>
        </RiderCard>
      ) : (
        <RiderCard title={riderMockData.applicationPreview.steps[step]} description={riderMockData.applicationPreview.intro}>
          <div className="rider-application-stepper" aria-label={'Application steps'}>
            {riderMockData.applicationPreview.steps.map((label, index) => <span className={index === step ? 'is-active' : index < step ? 'is-complete' : ''} key={label}>{label}</span>)}
          </div>
          {step === 0 && <div className="rider-form-grid">
            {RIDER_APPLICATION_FIELDS.map((field) => <label className="rider-field" key={field.key}><span>{field.label}</span><input type={field.type} placeholder={field.placeholder} value={form[field.key]} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} /></label>)}
            <RiderUploadField label={'Profile photograph'} accept="image/*" preview={photos.profile} onChange={(event) => chooseFile('profile', event)} hint={riderMockData.applicationPreview.uploadHint} />
          </div>}
          {step === 1 && <div className="rider-stack">
            <label className="rider-field"><span>{'Preferred vehicle type'}</span><select value={vehicleType} onChange={(event) => setVehicleType(event.target.value)}>{VEHICLE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label className="rider-field"><span>{'Vehicle details'}</span><input placeholder={'Model and registration details'} /></label>
            <RiderUploadField label={'Government-issued identification'} accept="image/*,.pdf" preview={photos.governmentId} onChange={(event) => chooseFile('governmentId', event)} hint={riderMockData.applicationPreview.uploadHint} />
            {vehicleType !== VEHICLE_TYPES[1] && <>
              <RiderUploadField label={'Driver license'} accept="image/*,.pdf" preview={photos.license} onChange={(event) => chooseFile('license', event)} hint={riderMockData.applicationPreview.uploadHint} />
              <RiderUploadField label={'Vehicle registration'} accept="image/*,.pdf" preview={photos.registration} onChange={(event) => chooseFile('registration', event)} hint={riderMockData.applicationPreview.uploadHint} />
            </>}
            <RiderUploadField label={'Other required documents'} accept="image/*,.pdf" multiple onChange={(event) => chooseFile('other', event)} hint={riderMockData.applicationPreview.uploadHint} />
          </div>}
          {step === 2 && <div className="rider-application-review">
            <h2>{riderMockData.applicationPreview.reviewTitle}</h2>
            <dl>{RIDER_APPLICATION_FIELDS.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{form[field.key] || 'Not provided in this preview'}</dd></div>)}<div><dt>{'Vehicle type'}</dt><dd>{vehicleType}</dd></div></dl>
            <div className="rider-note">{riderMockData.applicationPreview.uploadHint}</div>
          </div>}
          <div className="rider-wizard-actions">
            {step > 0 ? <Button variant="secondary" onClick={() => setStep((current) => current - 1)}>{riderMockData.applicationPreview.backLabel}</Button> : <Button variant="ghost" onClick={() => setSuccess(true)}>{riderMockData.applicationPreview.saveDraftLabel}</Button>}
            {step < riderMockData.applicationPreview.steps.length - 1
              ? <Button variant="primary" onClick={() => setStep((current) => current + 1)}>{riderMockData.applicationPreview.nextLabel}</Button>
              : <Button variant="primary" onClick={() => setSuccess(true)}>{riderMockData.applicationPreview.submitLabel}</Button>}
          </div>
          <p className="rider-application-footnote">{riderPreviewState.sample} · this form does not submit or persist information.</p>
        </RiderCard>
      )}
      </StateView>
    </>
  );
}

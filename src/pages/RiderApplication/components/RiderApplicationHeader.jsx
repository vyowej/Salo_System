import SharedApplicationHeader from '../../../components/application/ApplicationHeader';
import { RIDER_APPLICATION_STEPS } from '../constants/riderApplicationDefaults';

export default function RiderApplicationHeader(props) {
  const stepMeta = RIDER_APPLICATION_STEPS.find((s) => s.step === props.currentStep);
  return (
    <SharedApplicationHeader
      {...props}
      title="Rider Application"
      badge="Partner Onboarding"
      currentStepLabel={stepMeta?.shortLabel || stepMeta?.label || ''}
    />
  );
}

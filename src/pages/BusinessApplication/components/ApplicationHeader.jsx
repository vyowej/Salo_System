import SharedApplicationHeader from '../../../components/application/ApplicationHeader';
import { WIZARD_STEPS } from '../constants/applicationDefaults';

export default function ApplicationHeader(props) {
  const stepMeta = WIZARD_STEPS.find((s) => s.step === props.currentStep);
  return (
    <SharedApplicationHeader
      {...props}
      title="Restaurant Application"
      badge="Partner Onboarding"
      currentStepLabel={stepMeta?.shortLabel || stepMeta?.label || ''}
    />
  );
}

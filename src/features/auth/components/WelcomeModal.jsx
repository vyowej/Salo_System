import RoleOnboardingModal from '../../../components/onboarding/RoleOnboardingModal';
import { useRoleOnboarding } from '../../../hooks/useRoleOnboarding';

/**
 * SALO Customer Welcome Onboarding Modal (delegates to the unified RoleOnboardingModal).
 */
export default function WelcomeModal({ open, onClose }) {
  const onboarding = useRoleOnboarding('customer');

  return (
    <RoleOnboardingModal
      open={open ?? onboarding.shouldShow}
      role="customer"
      user={onboarding.user}
      updateUser={onboarding.updateUser}
      customerAddresses={onboarding.customerAddresses}
      onComplete={() => {
        onboarding.completeOnboarding();
        onClose?.();
      }}
      onSkip={() => {
        onboarding.skipOnboarding();
        onClose?.();
      }}
    />
  );
}

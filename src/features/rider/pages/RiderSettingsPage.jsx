import { useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import UnifiedSettingsShell from '../../../components/settings/UnifiedSettingsShell';
import {
  SettingsAccountSection,
  SettingsCard,
  SettingsPasswordCard,
} from '../../../components/settings/SettingsPrimitives';
import { getSettingsSectionsForRole } from '../../../config/settingsConfig';

export default function RiderSettingsPage() {
  const { user } = useAuth();
  const sections = getSettingsSectionsForRole('rider');
  const [activeSection, setActiveSection] = useState('account');

  const profileName = user?.name || user?.username || 'Rider';
  const profileEmail = user?.email || user?.username || '';
  const initials = profileName.slice(0, 2).toUpperCase();

  return (
    <UnifiedSettingsShell
      role="rider"
      title="Rider settings"
      subtitle="Manage your account and security settings."
      sections={sections}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
    >
      {activeSection === 'account' && (
        <SettingsAccountSection
          name={profileName}
          email={profileEmail}
          initials={initials}
          roleLabel="Rider"
        />
      )}

      {activeSection === 'security' && <SettingsPasswordCard />}

      {activeSection !== 'account' && activeSection !== 'security' && (
        <SettingsCard title="Not available yet" description="Additional rider preferences will be configurable here once the backend settings endpoints are connected." />
      )}
    </UnifiedSettingsShell>
  );
}

import { useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import useAdminSession from '../contexts/useAdminSession';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import UnifiedSettingsShell from '../../../components/settings/UnifiedSettingsShell';
import {
  SettingsAccountSection,
  SettingsCard,
  SettingsPasswordCard,
} from '../../../components/settings/SettingsPrimitives';
import { getSettingsSectionsForRole } from '../../../config/settingsConfig';
import './AdminPages.css';

export default function AdminSettingsPage({ initialSection = 'account' }) {
  useAdminPageSearch({ disabled: true });
  const { currentAdmin } = useAdminSession();
  const sections = getSettingsSectionsForRole('admin');
  const [activeSection, setActiveSection] = useState(initialSection);

  const initials = (currentAdmin.name || 'A')
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <AdminLayout>
      <UnifiedSettingsShell
        role="admin"
        title="Admin settings"
        subtitle="Manage your administrator account and security."
        sections={sections}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        embedded
      >
        {activeSection === 'account' && (
          <SettingsAccountSection
            name={currentAdmin.name}
            email={currentAdmin.email}
            initials={initials}
            roleLabel="Administrator"
          />
        )}

        {activeSection === 'security' && <SettingsPasswordCard />}

        {activeSection !== 'account' && activeSection !== 'security' && (
          <SettingsCard
            title="Platform settings are not available yet"
            description="Platform-wide configuration (commission defaults, fees, maintenance mode) will be editable here once the admin config API is connected."
          />
        )}
      </UnifiedSettingsShell>
    </AdminLayout>
  );
}

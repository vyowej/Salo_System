import { useState } from 'react';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import EligibilityChecklist from '../components/EligibilityChecklist';
import useScenario from '../hooks/useScenario';
import { eligibilityConditions } from '../constants/eligibilityConditions';
import {
  notificationPreferences,
  riderAgreementSections,
  updateRecordValue,
} from '../constants/riderSettings';
import { getRiderMock } from '../mocks';
import { useAuth } from '../../../hooks/useAuth';
import UnifiedSettingsShell from '../../../components/settings/UnifiedSettingsShell';
import {
  SettingsAccountSection,
  SettingsCard,
  SettingsPasswordCard,
  SettingsPreferencesSection,
  SettingsToggleRow,
} from '../../../components/settings/SettingsPrimitives';
import { getSettingsSectionsForRole } from '../../../config/settingsConfig';
import './RiderSettingsPage.css';

export default function RiderSettingsPage() {
  const { user } = useAuth();
  const scenario = useScenario();
  const profile = getRiderMock('riderProfile', scenario);
  const sections = getSettingsSectionsForRole('rider');

  const [activeSection, setActiveSection] = useState('account');
  const [email, setEmail] = useState(user?.email || profile.email || 'rider@salo.local');
  const [preferences, setPreferences] = useState({});
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);

  const viewState = ['loading', 'empty', 'error'].includes(scenario) ? scenario : 'ready';

  function togglePreference(key, checked) {
    setPreferences((current) => updateRecordValue(current, key, checked));
    setDirty(true);
    setNotice('');
  }

  function handleSave() {
    setDirty(false);
    setNotice('Rider settings saved in this preview.');
  }

  function handleDiscard() {
    setEmail(user?.email || profile.email || 'rider@salo.local');
    setPreferences({});
    setDirty(false);
    setNotice('');
  }

  const renderSection = (sectionId) => {
    switch (sectionId) {
      case 'account':
        return (
          <SettingsAccountSection
            role="rider"
            user={user}
            profileName={user?.name || profile.name}
            profileEmail={user?.email || profile.email}
            profileInitials={(user?.name || profile.initials || 'R').slice(0, 2).toUpperCase()}
            profileAvatar={profile.photo}
            emailValue={email}
            onNavigateToSecurity={() => setActiveSection('security')}
            dangerZone={{
              title: 'Log out of rider session',
              description: 'Sign out of this rider preview session on this device.',
              actionLabel: 'Log out',
              onAction: () => setLogoutOpen(true),
            }}
          />
        );

      case 'driver_mode':
        return (
          <SettingsCard title="Eligibility checklist" description="Requirements before going online for deliveries.">
            <EligibilityChecklist conditions={eligibilityConditions} />
          </SettingsCard>
        );

      case 'location':
        return (
          <SettingsCard title="Device location permission" description="Location access supports route preview and delivery context.">
            <div className="rider-settings-info">
              <strong>Location permission: {profile.locationStatus}</strong>
              <p>Review your device permissions before starting a shift.</p>
              <p>Only use the app while safely stopped.</p>
            </div>
          </SettingsCard>
        );

      case 'privacy':
        return (
          <SettingsCard title="Delivery data privacy" description="Guidelines for handling customer and order details.">
            <div className="rider-settings-info">
              <p>Use customer and delivery details only for the assigned delivery. Avoid sharing personal or order information outside the delivery workflow.</p>
              <p>Contact Rider Support if you need help with account information or privacy concerns.</p>
            </div>
          </SettingsCard>
        );

      case 'terms':
        return (
          <SettingsCard title="Rider agreement" description="Review the rider terms and service guidelines.">
            <div className="rider-agreement-scroll" tabIndex="0">
              {riderAgreementSections.map((item) => (
                <section key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </section>
              ))}
              <p className="rider-agreement-disclaimer">
                Design preview only. Approved rider agreement copy must be supplied before release.
              </p>
            </div>
          </SettingsCard>
        );

      case 'notifications':
        return (
          <SettingsCard title="Notification preferences" description="Manage delivery offer and shift alerts.">
            <div className="salo-settings-toggle-list">
              {notificationPreferences.map((item) => (
                <SettingsToggleRow
                  key={item.key}
                  id={`rider-setting-${item.key}`}
                  label={item.label}
                  description={item.detail}
                  checked={preferences[item.key] ?? true}
                  onChange={(checked) => togglePreference(item.key, checked)}
                />
              ))}
            </div>
          </SettingsCard>
        );

      case 'security':
        return <SettingsPasswordCard role="rider" />;

      case 'preferences':
        return <SettingsPreferencesSection />;

      default:
        return null;
    }
  };

  return (
    <div className="rider-page-shell">
      <UnifiedSettingsShell
        eyebrow="Rider preferences"
        title="Rider settings"
        subtitle="Manage communication, security, location guidance, and account information."
        sections={sections}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        state={viewState}
        onRetry={() => window.location.reload()}
        dirty={dirty}
        onSave={handleSave}
        onDiscard={handleDiscard}
        notice={notice}
        renderSection={renderSection}
      />

      <Modal open={logoutOpen} onClose={() => setLogoutOpen(false)} title="Log out of the rider preview?">
        <div className="rider-logout-modal">
          <p>Confirm the sign-out preview for this rider account.</p>
          <div>
            <Button type="button" variant="secondary" onClick={() => setLogoutOpen(false)}>Cancel</Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setLogoutOpen(false);
                setNotice('Sign-out preview confirmed. No authentication state was changed.');
              }}
            >
              Confirm log out
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import Button from '../../../components/common/Button';
import { ConfirmDialog } from '../components';
import adminService from '../../../services/adminService';
import useAdminSession from '../contexts/useAdminSession';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { appendAdminAuditLog } from '../utils/auditLog';
import { formatDateTime, formatDateTimeInput } from '../utils/format';
import UnifiedSettingsShell from '../../../components/settings/UnifiedSettingsShell';
import {
  SettingsAccountSection,
  SettingsCard,
  SettingsField,
  SettingsPasswordCard,
  SettingsPreferencesSection,
  SettingsToggleRow,
} from '../../../components/settings/SettingsPrimitives';
import { getSettingsSectionsForRole } from '../../../config/settingsConfig';
import './AdminPages.css';

function buildInitialAdminSettings() {
  const saved = adminService.getConfig();
  return {
    ...saved,
    customerNotifications: { email: true, sms: false, push: true, ...saved.customerNotifications },
    paymentMethods: { cod: true, gcash: true, maya: true, card: true, ...saved.paymentMethods },
    supportedLocations: Array.isArray(saved.supportedLocations)
      ? saved.supportedLocations.join(', ')
      : saved.supportedLocations || '',
  };
}

export default function AdminSettingsPage({ initialSection = 'account' }) {
  useAdminPageSearch({ disabled: true });
  const { currentAdmin, permissions, sessions, revokeSession } = useAdminSession();
  const sections = getSettingsSectionsForRole('admin');

  const [settings, setSettings] = useState(buildInitialAdminSettings);
  const [activeSection, setActiveSection] = useState(initialSection);
  const [dirty, setDirty] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [notice, setNotice] = useState('');

  const canEdit = permissions.settings?.includes('edit');
  const activeMeta = sections.find((item) => item.id === activeSection) || sections[0];
  const initials = (currentAdmin.name || 'A')
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  function setField(key, value) {
    setSettings((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
    setNotice('');
  }

  function setNested(group, key, value) {
    setSettings((previous) => ({
      ...previous,
      [group]: { ...previous[group], [key]: value },
    }));
    setDirty(true);
    setNotice('');
  }

  function handleSaveRequest() {
    if (!canEdit) return;
    if (
      settings.maintenanceStartsAt &&
      settings.maintenanceEndsAt &&
      new Date(settings.maintenanceEndsAt) <= new Date(settings.maintenanceStartsAt)
    ) {
      setNotice('Maintenance end time must be after its start time.');
      return;
    }
    setPendingSave(true);
  }

  function handleDiscard() {
    setSettings(buildInitialAdminSettings());
    setDirty(false);
    setNotice('');
  }

  function confirmSave({ reason }) {
    const next = {
      ...settings,
      supportedLocations: typeof settings.supportedLocations === 'string'
        ? settings.supportedLocations.split(',').map((value) => value.trim()).filter(Boolean)
        : settings.supportedLocations,
    };
    adminService.updateConfig(next);
    appendAdminAuditLog({
      who: currentAdmin.name,
      role: currentAdmin.role,
      action: 'Updated platform settings',
      record: { type: 'Platform Settings', id: activeMeta?.label || activeSection },
      time: new Date().toISOString(),
      previousValue: 'Previous settings configuration',
      newValue: `Updated ${(activeMeta?.label || activeSection).toLowerCase()} settings`,
      reason,
      reference: `settings-${activeSection}`,
    });
    setSettings({
      ...next,
      supportedLocations: Array.isArray(next.supportedLocations)
        ? next.supportedLocations.join(', ')
        : next.supportedLocations || '',
    });
    setPendingSave(false);
    setDirty(false);
    setNotice(`${activeMeta?.label || 'Platform'} settings saved.`);
  }

  const textField = (id, label, key, props = {}) => (
    <SettingsField id={id} label={label}>
      <input
        id={id}
        value={settings[key] ?? ''}
        disabled={!canEdit}
        onChange={(event) => setField(key, event.target.value)}
        {...props}
      />
    </SettingsField>
  );

  const renderSection = (sectionId) => {
    switch (sectionId) {
      case 'account':
        return (
          <SettingsAccountSection
            role="admin"
            user={{ ...currentAdmin, roles: ['customer', 'restaurant', 'rider', 'admin'] }}
            profileName={currentAdmin.name}
            profileEmail={currentAdmin.email}
            profileInitials={initials}
            emailReadOnly
            onNavigateToSecurity={() => setActiveSection('security')}
          />
        );

      case 'branding':
        return (
          <SettingsCard title="Platform identity" description="Public platform name, tagline, and brand description.">
            {!canEdit && (
              <p className="admin-shell-note">
                Your role can view settings but cannot change them. Backend authorization is required for production.
              </p>
            )}
            <div className="salo-settings-form-grid">
              {textField('admin-platform-name', 'Platform name', 'platformName', { required: true })}
              {textField('admin-tagline', 'Tagline', 'tagline', { required: true })}
              {textField('admin-brand-asset', 'Logo / brand asset reference', 'brandAssetLabel', { placeholder: 'SALO wordmark' })}
            </div>
            <SettingsField id="admin-brand-desc" label="Brand description">
              <textarea
                id="admin-brand-desc"
                disabled={!canEdit}
                value={settings.brandDescription || ''}
                onChange={(event) => setField('brandDescription', event.target.value)}
              />
            </SettingsField>
            <div className="admin-content-preview">
              <strong>{settings.platformName || 'SALO'}</strong>
              <span>{settings.tagline}</span>
              <small>{settings.brandAssetLabel || 'Brand preview'}</small>
            </div>
          </SettingsCard>
        );

      case 'contact':
        return (
          <SettingsCard title="Platform contact details" description="Support hotline, email, and hours displayed to users.">
            <div className="salo-settings-form-grid">
              {textField('admin-support-hotline', 'Support hotline', 'supportHotline', { required: true })}
              {textField('admin-support-email', 'Support email', 'supportEmail', { type: 'email', required: true })}
              {textField('admin-contact-address', 'Public contact address', 'publicContactAddress', { placeholder: 'City, Philippines' })}
              {textField('admin-support-hours', 'Support hours', 'supportHours', { placeholder: 'Daily, 8:00 AM–10:00 PM' })}
            </div>
          </SettingsCard>
        );

      case 'payments':
        return (
          <SettingsCard
            title="Supported payment methods"
            description="Select which payment methods are available to customers at checkout."
          >
            <div className="salo-settings-toggle-list">
              <SettingsToggleRow
                id="admin-pay-cod"
                label="Cash on Delivery"
                checked={Boolean(settings.paymentMethods?.cod)}
                disabled={!canEdit}
                onChange={(checked) => setNested('paymentMethods', 'cod', checked)}
              />
              <SettingsToggleRow
                id="admin-pay-gcash"
                label="GCash"
                checked={Boolean(settings.paymentMethods?.gcash)}
                disabled={!canEdit}
                onChange={(checked) => setNested('paymentMethods', 'gcash', checked)}
              />
              <SettingsToggleRow
                id="admin-pay-maya"
                label="Maya"
                checked={Boolean(settings.paymentMethods?.maya)}
                disabled={!canEdit}
                onChange={(checked) => setNested('paymentMethods', 'maya', checked)}
              />
              <SettingsToggleRow
                id="admin-pay-card"
                label="Credit / debit card"
                checked={Boolean(settings.paymentMethods?.card)}
                disabled={!canEdit}
                onChange={(checked) => setNested('paymentMethods', 'card', checked)}
              />
            </div>
            <p className="salo-settings-field-hint">
              Provider credentials, webhook secrets, and verification configuration belong in protected server-side settings.
            </p>
          </SettingsCard>
        );

      case 'maintenance':
        return (
          <SettingsCard title="Maintenance notice" description="Control planned maintenance visibility across SALO.">
            <SettingsToggleRow
              id="admin-maintenance-mode"
              label="Enable maintenance mode"
              checked={Boolean(settings.maintenanceMode)}
              disabled={!canEdit}
              onChange={(checked) => setField('maintenanceMode', checked)}
            />
            <SettingsField id="admin-maintenance-notice" label="Public maintenance notice">
              <textarea
                id="admin-maintenance-notice"
                disabled={!canEdit}
                value={settings.maintenanceNotice || ''}
                onChange={(event) => setField('maintenanceNotice', event.target.value)}
                placeholder="Explain the planned maintenance to SALO users."
              />
            </SettingsField>
            <div className="salo-settings-form-grid">
              <SettingsField id="admin-maintenance-start" label="Starts at">
                <input
                  id="admin-maintenance-start"
                  type="datetime-local"
                  disabled={!canEdit}
                  value={formatDateTimeInput(settings.maintenanceStartsAt)}
                  onChange={(event) => setField('maintenanceStartsAt', event.target.value)}
                />
              </SettingsField>
              <SettingsField id="admin-maintenance-end" label="Ends at">
                <input
                  id="admin-maintenance-end"
                  type="datetime-local"
                  disabled={!canEdit}
                  value={formatDateTimeInput(settings.maintenanceEndsAt)}
                  onChange={(event) => setField('maintenanceEndsAt', event.target.value)}
                />
              </SettingsField>
            </div>
          </SettingsCard>
        );

      case 'legal':
        return (
          <SettingsCard title="Terms and privacy links" description="Public URLs linked from footers and onboarding.">
            <div className="salo-settings-form-grid">
              {textField('admin-terms-url', 'Terms and conditions URL', 'termsUrl', { type: 'url', required: true })}
              {textField('admin-privacy-url', 'Privacy policy URL', 'privacyUrl', { type: 'url', required: true })}
            </div>
          </SettingsCard>
        );

      case 'operations':
        return (
          <SettingsCard title="Default operating configuration" description="Service locations and payout schedule display defaults.">
            <div className="salo-settings-form-grid">
              {textField('admin-locations', 'Supported cities / service locations (comma-separated)', 'supportedLocations')}
              {textField('admin-payout-schedule', 'Payout schedule (display default)', 'payoutSchedule', { placeholder: 'Weekly on Mondays' })}
            </div>
            <p className="salo-settings-field-hint">
              Fee and commission policies are managed in Fees and Commissions to keep financial configuration in one dedicated workspace.
            </p>
          </SettingsCard>
        );

      case 'notifications':
        return (
          <SettingsCard title="Customer notification channels" description="Configure default customer notification channel preferences.">
            <div className="salo-settings-toggle-list">
              <SettingsToggleRow
                id="admin-notif-email"
                label="Customer email notifications enabled"
                checked={Boolean(settings.customerNotifications?.email)}
                disabled={!canEdit}
                onChange={(checked) => setNested('customerNotifications', 'email', checked)}
              />
              <SettingsToggleRow
                id="admin-notif-sms"
                label="Customer SMS notifications enabled"
                checked={Boolean(settings.customerNotifications?.sms)}
                disabled={!canEdit}
                onChange={(checked) => setNested('customerNotifications', 'sms', checked)}
              />
              <SettingsToggleRow
                id="admin-notif-push"
                label="Customer push notifications enabled"
                checked={Boolean(settings.customerNotifications?.push)}
                disabled={!canEdit}
                onChange={(checked) => setNested('customerNotifications', 'push', checked)}
              />
            </div>
            <div className="salo-settings-form-grid">
              {textField('admin-notif-sender', 'Notification sender name', 'notificationSenderName', { placeholder: 'SALO' })}
              {textField('admin-notif-reply', 'Notification reply-to email', 'notificationReplyTo', { type: 'email', placeholder: 'support@salo.ph' })}
            </div>
          </SettingsCard>
        );

      case 'security':
        return (
          <>
            <SettingsPasswordCard role="admin" />

            <SettingsCard title="Active sessions" description="Review and revoke active sessions associated with your administrator account.">
              <div className="admin-session-list">
                {sessions.map((session) => (
                  <article className="admin-session-row" key={session.id}>
                    <div>
                      <strong>{session.device}{session.current ? ' · Current session' : ''}</strong>
                      <p>{session.location}</p>
                      <time dateTime={session.lastSeen}>Last active {formatDateTime(session.lastSeen)}</time>
                    </div>
                    {session.revoked ? (
                      <span>Revoked</span>
                    ) : session.current ? (
                      <span>Active</span>
                    ) : (
                      <Button variant="danger-outline" onClick={() => setSelectedSession(session)}>
                        Revoke
                      </Button>
                    )}
                  </article>
                ))}
              </div>
            </SettingsCard>
          </>
        );

      case 'preferences':
        return <SettingsPreferencesSection />;

      default:
        return null;
    }
  };

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <UnifiedSettingsShell
          eyebrow="Platform administration"
          title="Platform Settings"
          subtitle="Manage platform identity, contact channels, notifications, payments, maintenance, security, and defaults."
          sections={sections}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          dirty={dirty && canEdit}
          onSave={handleSaveRequest}
          onDiscard={handleDiscard}
          saveLabel="Review and save settings"
          notice={notice}
          renderSection={renderSection}
        />
      </section>

      <ConfirmDialog
        open={pendingSave}
        title={`Save ${(activeMeta?.label || 'platform').toLowerCase()} settings?`}
        description="Changes are recorded in the audit log."
        confirmLabel="Save settings"
        requireReauthentication
        requireReason
        onClose={() => setPendingSave(false)}
        onConfirm={confirmSave}
      />

      <ConfirmDialog
        open={Boolean(selectedSession)}
        title="Revoke this session?"
        description={selectedSession ? `Sign out ${selectedSession.device} (${selectedSession.location})?` : ''}
        confirmLabel="Revoke session"
        requireReauthentication
        requireReason
        onClose={() => setSelectedSession(null)}
        onConfirm={() => {
          if (selectedSession) revokeSession(selectedSession.id);
          setSelectedSession(null);
        }}
      />
    </AdminLayout>
  );
}

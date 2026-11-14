import { useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { ConfirmDialog, PageHeader, Tabs } from '../components';
import adminService from '../../../services/adminService';
import useAdminSession from '../contexts/useAdminSession';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { appendAdminAuditLog } from '../utils/auditLog';
import { formatDateTimeInput } from '../utils/format';
import './AdminPages.css';

const SETTINGS_TABS = ['Branding', 'Contact', 'Notifications', 'Payments', 'Maintenance', 'Legal', 'Operations'];

export default function AdminSettingsPage() {
  useAdminPageSearch({ disabled: true });
  const { currentAdmin, permissions } = useAdminSession();
  const [settings, setSettings] = useState(() => {
    const saved = adminService.getConfig();
    return {
      ...saved,
      customerNotifications: { email: true, sms: false, push: true, ...saved.customerNotifications },
      paymentMethods: { cod: true, gcash: true, maya: true, card: true, ...saved.paymentMethods },
      supportedLocations: Array.isArray(saved.supportedLocations) ? saved.supportedLocations.join(', ') : saved.supportedLocations || '',
    };
  });
  const [activeTab, setActiveTab] = useState('Branding');
  const [pendingSave, setPendingSave] = useState(false);
  const [notice, setNotice] = useState('');
  const canEdit = permissions.settings?.includes('edit');

  function setField(key, value) {
    setSettings((previous) => ({ ...previous, [key]: value }));
    setNotice('');
  }

  function setNested(group, key, value) {
    setSettings((previous) => ({ ...previous, [group]: { ...previous[group], [key]: value } }));
    setNotice('');
  }

  function submit(event) {
    event.preventDefault();
    if (!canEdit) return;
    if (settings.maintenanceStartsAt && settings.maintenanceEndsAt
      && new Date(settings.maintenanceEndsAt) <= new Date(settings.maintenanceStartsAt)) {
      setNotice('Maintenance end time must be after its start time.');
      return;
    }
    setPendingSave(true);
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
      record: { type: 'Platform Settings', id: activeTab },
      time: new Date().toISOString(),
      previousValue: 'Previous settings configuration',
      newValue: `Updated ${activeTab.toLowerCase()} settings`,
      reason,
      reference: `settings-${activeTab.toLowerCase()}`,
    });
    setSettings(next);
    setPendingSave(false);
    setNotice(`${activeTab} settings saved.`);
  }

  const textField = (label, key, props = {}) => (
    <label className="admin-filter-control">{label}<input value={settings[key] ?? ''} onChange={(event) => setField(key, event.target.value)} {...props} /></label>
  );
  const toggle = (group, key, label) => (
    <label className="admin-setting-toggle"><input type="checkbox" checked={Boolean(settings[group]?.[key])} onChange={(event) => setNested(group, key, event.target.checked)} /><span>{label}</span></label>
  );

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Platform Settings" description="Manage public platform identity, contact channels, notifications, payment availability, maintenance notices, and legal links." actions={<Link className="admin-action-button" to="/admin/settings/security">Review security and sessions</Link>} />

        {notice && <p className="admin-inline-notice" role="status">{notice}</p>}
        {!canEdit && <p className="admin-shell-note">Your role can view settings but cannot change them. Backend authorization is required for production.</p>}
        <Tabs items={SETTINGS_TABS} value={activeTab} onChange={setActiveTab} label="Platform settings sections" />
        <form className="admin-record-panel admin-workspace-form" onSubmit={submit}>
          <fieldset disabled={!canEdit} className="admin-settings-fieldset">
            {activeTab === 'Branding' && <>
              <h2>Platform branding</h2>
              {textField('Platform name', 'platformName', { required: true })}
              {textField('Tagline', 'tagline', { required: true })}
              <label className="admin-filter-control">Brand description<textarea value={settings.brandDescription || ''} onChange={(event) => setField('brandDescription', event.target.value)} /></label>
              {textField('Logo / brand asset reference', 'brandAssetLabel', { placeholder: 'SALO wordmark' })}
              <div className="admin-content-preview"><strong>{settings.platformName || 'SALO'}</strong><span>{settings.tagline}</span><small>{settings.brandAssetLabel || 'Brand preview'}</small></div>
            </>}
            {activeTab === 'Contact' && <>
              <h2>Platform contact details</h2>
              {textField('Support hotline', 'supportHotline', { required: true })}
              {textField('Support email', 'supportEmail', { type: 'email', required: true })}
              {textField('Public contact address', 'publicContactAddress', { placeholder: 'City, Philippines' })}
              {textField('Support hours', 'supportHours', { placeholder: 'Daily, 8:00 AM–10:00 PM' })}
            </>}
            {activeTab === 'Notifications' && <>
              <h2>Customer notification channels</h2>
              <p className="admin-muted">Configure default customer notification channel preferences.</p>
              {toggle('customerNotifications', 'email', 'Customer email notifications enabled')}
              {toggle('customerNotifications', 'sms', 'Customer SMS notifications enabled')}
              {toggle('customerNotifications', 'push', 'Customer push notifications enabled')}
              {textField('Notification sender name', 'notificationSenderName', { placeholder: 'SALO' })}
              {textField('Notification reply-to email', 'notificationReplyTo', { type: 'email', placeholder: 'support@salo.ph' })}
            </>}
            {activeTab === 'Payments' && <>
              <h2>Supported payment methods</h2>
              <p className="admin-shell-note">Select which payment methods are available to customers at checkout.</p>
              {toggle('paymentMethods', 'cod', 'Cash on Delivery')}
              {toggle('paymentMethods', 'gcash', 'GCash')}
              {toggle('paymentMethods', 'maya', 'Maya')}
              {toggle('paymentMethods', 'card', 'Credit / debit card')}
              <p className="admin-muted">Provider credentials, webhook secrets, and verification configuration belong in protected server-side settings.</p>
            </>}
            {activeTab === 'Maintenance' && <>
              <h2>Maintenance notice</h2>
              <label className="admin-setting-toggle"><input type="checkbox" checked={Boolean(settings.maintenanceMode)} onChange={(event) => setField('maintenanceMode', event.target.checked)} /><span>Enable maintenance mode</span></label>
              <label className="admin-filter-control">Public maintenance notice<textarea value={settings.maintenanceNotice || ''} onChange={(event) => setField('maintenanceNotice', event.target.value)} placeholder="Explain the planned maintenance to SALO users." /></label>
              <label className="admin-filter-control">Starts at<input type="datetime-local" value={formatDateTimeInput(settings.maintenanceStartsAt)} onChange={(event) => setField('maintenanceStartsAt', event.target.value)} /></label>
              <label className="admin-filter-control">Ends at<input type="datetime-local" value={formatDateTimeInput(settings.maintenanceEndsAt)} onChange={(event) => setField('maintenanceEndsAt', event.target.value)} /></label>
            </>}
            {activeTab === 'Legal' && <>
              <h2>Terms and privacy links</h2>
              {textField('Terms and conditions URL', 'termsUrl', { type: 'url', required: true })}
              {textField('Privacy policy URL', 'privacyUrl', { type: 'url', required: true })}
            </>}
            {activeTab === 'Operations' && <>
              <h2>Default operating configuration</h2>
              {textField('Supported cities / service locations (comma-separated)', 'supportedLocations', {
                value: Array.isArray(settings.supportedLocations) ? settings.supportedLocations.join(', ') : settings.supportedLocations || '',
                onChange: (event) => setField('supportedLocations', event.target.value),
              })}
              {textField('Payout schedule (display default)', 'payoutSchedule', { placeholder: 'Weekly on Mondays' })}
              <p className="admin-shell-note">Fee and commission policies are managed in Fees and Commissions to keep the financial configuration in one dedicated workspace.</p>
            </>}
          </fieldset>
          {canEdit && <button className="admin-action-button" type="submit">Review and save settings</button>}
        </form>

      </section>
      <ConfirmDialog
        open={pendingSave}
        title={`Save ${activeTab.toLowerCase()} settings?`}
        description="Changes are recorded in the audit log."
        confirmLabel="Save settings"
        requireReauthentication
        requireReason
        onClose={() => setPendingSave(false)}
        onConfirm={confirmSave}
      />
    </AdminLayout>
  );
}

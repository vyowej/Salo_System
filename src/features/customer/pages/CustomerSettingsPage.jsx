import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useAuth } from '../../../hooks/useAuth';
import useAddresses from '../../../hooks/useAddresses';
import accountService from '../../../services/accountService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import AddressFormModal from '../components/AddressFormModal';
import { formatFormalAddress } from '../../../utils/addressFormatter';
import ContactNumbersManager from '../components/ContactNumbersManager';
import UnifiedSettingsShell from '../../../components/settings/UnifiedSettingsShell';
import { AccountLifecycleModals } from '../../../components/settings/AccountLifecycleModals';
import {
  SettingsAccountSection,
  SettingsCard,
  SettingsPasswordCard,
  SettingsPreferencesSection,
  SettingsToggleRow,
} from '../../../components/settings/SettingsPrimitives';
import { getSettingsSectionsForRole } from '../../../config/settingsConfig';
import { isCallSoundEnabled, requestBrowserNotificationPermission, setCallSoundEnabled } from '../../../utils/ringtone';

const INITIAL_NOTIFICATIONS = {
  orderUpdates: true,
  promotions: false,
  reservationReminders: true,
  smsNotifications: false,
};

const INITIAL_SECURITY = {
  twoFactor: false,
  loginAlerts: true,
};

const INITIAL_PRIVACY = {
  shareOrderHistoryForRecommendations: true,
  allowRestaurantMessages: true,
};

export default function CustomerSettingsPage() {
  const { user } = useAuth();
  const { addresses, addAddress } = useAddresses();
  const sections = getSettingsSectionsForRole('customer');

  const [activeSection, setActiveSection] = useState('account');
  const [savedSettings, setSavedSettings] = useState({
    notifications: INITIAL_NOTIFICATIONS,
    security: INITIAL_SECURITY,
    privacy: INITIAL_PRIVACY,
  });
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [security, setSecurity] = useState(INITIAL_SECURITY);
  const [privacy, setPrivacy] = useState(INITIAL_PRIVACY);
  const [callSounds, setCallSounds] = useState(() => isCallSoundEnabled());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const addAddressBtnRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    accountService.getSettings()
      .then((data) => {
        if (cancelled || !data) return;
        const nextNotif = { ...INITIAL_NOTIFICATIONS, ...(data.notifications || {}) };
        const nextSec = { ...INITIAL_SECURITY, ...(data.security || {}) };
        const nextPriv = { ...INITIAL_PRIVACY, ...(data.privacy || {}) };
        setSavedSettings({ notifications: nextNotif, security: nextSec, privacy: nextPriv });
        setNotifications(nextNotif);
        setSecurity(nextSec);
        setPrivacy(nextPriv);
      })
      .catch(() => {
        // Keep defaults if offline or unauthenticated
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const profileName = user?.name || user?.username || 'Customer';
  const profileEmail = user?.email || user?.username || '';
  const initials = profileName.slice(0, 2).toUpperCase();

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setNotice('');
    try {
      const updated = await accountService.updateSettings({
        notifications,
        security,
        privacy,
      });
      const nextNotif = { ...INITIAL_NOTIFICATIONS, ...(updated?.notifications || notifications) };
      const nextSec = { ...INITIAL_SECURITY, ...(updated?.security || security) };
      const nextPriv = { ...INITIAL_PRIVACY, ...(updated?.privacy || privacy) };
      setSavedSettings({ notifications: nextNotif, security: nextSec, privacy: nextPriv });
      setNotifications(nextNotif);
      setSecurity(nextSec);
      setPrivacy(nextPriv);
      setDirty(false);
      setNotice('Customer settings saved.');
    } catch (err) {
      setNotice(err?.message || 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setNotifications(savedSettings.notifications);
    setSecurity(savedSettings.security);
    setPrivacy(savedSettings.privacy);
    setDirty(false);
    setNotice('');
  };

  const renderSection = (sectionId) => {
    switch (sectionId) {
      case 'account':
        return (
          <SettingsAccountSection
            role="customer"
            user={user}
            profileName={profileName}
            profileEmail={profileEmail}
            profileInitials={initials}
            profileAvatar={user?.avatar}
            emailValue={profileEmail}
            onNavigateToSecurity={() => setActiveSection('security')}
            dangerZone={{
              title: 'Deactivate or delete account',
              description: 'Deactivate your account temporarily or request permanent account deletion.',
              actionLabel: 'Deactivate account',
              onAction: () => setDeactivateOpen(true),
              secondaryActionLabel: 'Request deletion',
              onSecondaryAction: () => setDeleteOpen(true),
            }}
          />
        );

      case 'addresses':
        return (
          <SettingsCard
            title="Delivery addresses"
            description="Your saved delivery and billing locations."
            actions={(
              <Button
                ref={addAddressBtnRef}
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setAddressModalOpen(true)}
              >
                Add Address
              </Button>
            )}
          >
            {addresses.length === 0 ? (
              <p className="salo-settings-field-hint">No saved addresses yet.</p>
            ) : (
              <div className="salo-settings-form-grid">
                {addresses.map((address) => (
                  <article
                    key={address.id}
                    style={{
                      padding: '14px',
                      border: '1px solid var(--border-primary)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface-secondary)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <strong style={{ fontSize: 'var(--font-size-sm)' }}>{address.label}</strong>
                      {address.isDefault && <Badge variant="success" size="sm">Default</Badge>}
                    </div>
                    <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {formatFormalAddress(address)}
                    </p>
                  </article>
                ))}
              </div>
            )}
            <div>
              <Link to="/customer/addresses" className="salo-partner-status-link">
                Manage all addresses →
              </Link>
            </div>
          </SettingsCard>
        );

      case 'contact_numbers':
        return (
          <SettingsCard
            title="Contact numbers"
            description="Your saved mobile numbers for delivery and rider coordination."
          >
            <ContactNumbersManager />
          </SettingsCard>
        );

      case 'privacy':
        return (
          <SettingsCard title="Privacy controls" description="Control how your customer activity is used across SALO.">
            <div className="salo-settings-toggle-list">
              <SettingsToggleRow
                id="customer-privacy-recs"
                label="Personalized restaurant suggestions"
                description="Use your past orders to tailor nearby restaurant recommendations."
                checked={privacy.shareOrderHistoryForRecommendations}
                onChange={(checked) => {
                  setPrivacy((prev) => ({ ...prev, shareOrderHistoryForRecommendations: checked }));
                  setDirty(true);
                }}
              />
              <SettingsToggleRow
                id="customer-privacy-messages"
                label="Allow restaurant order updates"
                description="Allow restaurants to contact you about active orders or reservations."
                checked={privacy.allowRestaurantMessages}
                onChange={(checked) => {
                  setPrivacy((prev) => ({ ...prev, allowRestaurantMessages: checked }));
                  setDirty(true);
                }}
              />
            </div>
          </SettingsCard>
        );

      case 'notifications':
        return (
          <SettingsCard title="Notification channels" description="Choose what updates you want to hear about.">
            <div className="salo-settings-toggle-list">
              <SettingsToggleRow
                id="customer-notif-orders"
                label="Order updates"
                description="Get notified when your order status changes."
                checked={notifications.orderUpdates}
                onChange={(checked) => {
                  setNotifications((prev) => ({ ...prev, orderUpdates: checked }));
                  setDirty(true);
                }}
              />
              <SettingsToggleRow
                id="customer-notif-promos"
                label="Promotions & deals"
                description="Exclusive offers, discounts, and seasonal promos."
                checked={notifications.promotions}
                onChange={(checked) => {
                  setNotifications((prev) => ({ ...prev, promotions: checked }));
                  setDirty(true);
                }}
              />
              <SettingsToggleRow
                id="customer-notif-reservations"
                label="Reservation reminders"
                description="Reminders before your upcoming table reservations."
                checked={notifications.reservationReminders}
                onChange={(checked) => {
                  setNotifications((prev) => ({ ...prev, reservationReminders: checked }));
                  setDirty(true);
                }}
              />
              <SettingsToggleRow
                id="customer-notif-sms"
                label="SMS notifications"
                description="Receive key updates via text message to your registered number."
                checked={notifications.smsNotifications}
                onChange={(checked) => {
                  setNotifications((prev) => ({ ...prev, smsNotifications: checked }));
                  setDirty(true);
                }}
              />
              <SettingsToggleRow
                id="customer-notif-call-sounds"
                label="Incoming call ringtone"
                description="Play an audio ringtone when your rider calls you during delivery (saved on this device)."
                checked={callSounds}
                onChange={async (checked) => {
                  setCallSounds(checked);
                  setCallSoundEnabled(checked);
                  if (checked) {
                    await requestBrowserNotificationPermission();
                  }
                }}
              />
            </div>
          </SettingsCard>
        );

      case 'security':
        return (
          <>
            <SettingsPasswordCard role="customer" />

            <SettingsCard title="Sign-in protection" description="Extra layers of protection for your account.">
              <div className="salo-settings-toggle-list">
                <SettingsToggleRow
                  id="customer-sec-2fa"
                  label="Two-factor authentication"
                  description="Require a verification code when signing in from a new device."
                  checked={security.twoFactor}
                  onChange={(checked) => {
                    setSecurity((prev) => ({ ...prev, twoFactor: checked }));
                    setDirty(true);
                  }}
                />
                <SettingsToggleRow
                  id="customer-sec-alerts"
                  label="Login alerts"
                  description="Receive an email when a new device signs in to your account."
                  checked={security.loginAlerts}
                  onChange={(checked) => {
                    setSecurity((prev) => ({ ...prev, loginAlerts: checked }));
                    setDirty(true);
                  }}
                />
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
    <CustomerLayout>
      <UnifiedSettingsShell
        eyebrow="Customer preferences"
        title="Settings"
        subtitle="Manage your SALO account, saved addresses, notifications, security, and privacy."
        sections={sections}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        dirty={dirty}
        onSave={handleSave}
        onDiscard={handleDiscard}
        notice={notice}
        renderSection={renderSection}
      />

      <AddressFormModal
        isOpen={addressModalOpen}
        onClose={() => setAddressModalOpen(false)}
        onSave={addAddress}
        existingAddresses={addresses}
        triggerRef={addAddressBtnRef}
      />

      <AccountLifecycleModals
        deactivateOpen={deactivateOpen}
        onCloseDeactivate={() => setDeactivateOpen(false)}
        deleteOpen={deleteOpen}
        onCloseDelete={() => setDeleteOpen(false)}
        onNotice={(msg) => setNotice(msg)}
      />
    </CustomerLayout>
  );
}

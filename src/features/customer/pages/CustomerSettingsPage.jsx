import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useAuth } from '../../../hooks/useAuth';
import useAddresses from '../../../hooks/useAddresses';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import AddressFormModal from '../components/AddressFormModal';
import UnifiedSettingsShell from '../../../components/settings/UnifiedSettingsShell';
import {
  SettingsAccountSection,
  SettingsCard,
  SettingsPasswordCard,
  SettingsPreferencesSection,
  SettingsToggleRow,
} from '../../../components/settings/SettingsPrimitives';
import { getSettingsSectionsForRole } from '../../../config/settingsConfig';

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
  const { user, updateUser } = useAuth();
  const { addresses, addAddress } = useAddresses();
  const sections = getSettingsSectionsForRole('customer');

  const [activeSection, setActiveSection] = useState('account');
  const [email, setEmail] = useState(user?.email || 'customer@salo.local');
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [security, setSecurity] = useState(INITIAL_SECURITY);
  const [privacy, setPrivacy] = useState(INITIAL_PRIVACY);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');

  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const addAddressBtnRef = useRef(null);

  const profileName = user?.name || user?.username || 'Customer';
  const profileEmail = user?.email || user?.username || 'customer@salo.local';
  const initials = profileName.slice(0, 2).toUpperCase();

  const handleSave = () => {
    if (updateUser && email.trim()) {
      updateUser({ email: email.trim() });
    }
    setDirty(false);
    setNotice('Customer settings saved.');
  };

  const handleDiscard = () => {
    setEmail(user?.email || 'customer@salo.local');
    setNotifications(INITIAL_NOTIFICATIONS);
    setSecurity(INITIAL_SECURITY);
    setPrivacy(INITIAL_PRIVACY);
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
            emailValue={email}
            onEmailChange={(value) => {
              setEmail(value);
              setDirty(true);
              setNotice('');
            }}
            onNavigateToSecurity={() => setActiveSection('security')}
            dangerZone={{
              title: 'Deactivate account',
              description: 'Deactivating your account disables access to saved addresses, favorites, and order history.',
              actionLabel: 'Deactivate account',
              onAction: () => setDeactivateOpen(true),
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
                      {[address.street, address.barangay && `Brgy. ${address.barangay}`, address.city, address.province].filter(Boolean).join(', ')}
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

      <Modal
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        title="Deactivate account"
        size="sm"
        footer={(
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDeactivateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => {
                setDeactivateOpen(false);
                setNotice('Account deactivation is a UI preview only.');
              }}
            >
              Confirm deactivation
            </Button>
          </div>
        )}
      >
        <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Deactivating your account will disable access to your saved addresses, favorites, and order history.
          This action is not connected to backend persistence in this build.
        </p>
      </Modal>
    </CustomerLayout>
  );
}

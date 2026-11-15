import { useState } from 'react';
import { Link } from 'react-router-dom';
import OwnerLayout from '../../../layouts/OwnerLayout';
import { useAuth } from '../../../hooks/useAuth';
import Button from '../../../components/common/Button';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
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
import { DesignPreviewBanner } from './team/r7Preview';
import { BUSINESS_SUMMARY, SETTINGS_DEFAULTS } from './team/settingsSamples';

const PREVIEW_STATE_MAP = {
  'Sample data': 'ready',
  Loading: 'loading',
  Empty: 'empty',
  Error: 'error',
};

export default function OwnerSettingsPage() {
  const { user } = useAuth();
  const sections = getSettingsSectionsForRole('restaurant');

  const [previewState, setPreviewState] = useState('Sample data');
  const [activeSection, setActiveSection] = useState('account');
  const [settings, setSettings] = useState(SETTINGS_DEFAULTS);
  const [email, setEmail] = useState(user?.email || 'owner@salo.local');
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const profileName = user?.name || BUSINESS_SUMMARY.name;
  const profileEmail = user?.email || 'owner@salo.local';
  const initials = profileName.slice(0, 2).toUpperCase();

  const update = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setNotice('');
  };

  const updateNotification = (key, value) => {
    setSettings((current) => ({
      ...current,
      notifications: { ...current.notifications, [key]: value },
    }));
    setDirty(true);
    setNotice('');
  };

  const discard = () => {
    setSettings(SETTINGS_DEFAULTS);
    setEmail(user?.email || 'owner@salo.local');
    setDirty(false);
    setNotice('');
  };

  const save = () => {
    setDirty(false);
    setNotice('Design preview only — these settings were not saved.');
  };

  const renderSection = (sectionId) => {
    switch (sectionId) {
      case 'account':
        return (
          <SettingsAccountSection
            role="restaurant"
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
              title: 'Deactivate restaurant workspace',
              description: 'Temporarily take this restaurant offline and disable new orders and reservations.',
              actionLabel: 'Deactivate workspace',
              onAction: () => setDeactivateOpen(true),
            }}
          />
        );

      case 'business':
        return (
          <SettingsCard
            title={BUSINESS_SUMMARY.name}
            description={BUSINESS_SUMMARY.address}
            actions={<span className="salo-account-avatar" style={{ borderRadius: 'var(--radius-md)' }}>SK</span>}
          >
            <div className="salo-settings-form-grid">
              <div style={{ padding: '12px', border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-md)' }}>
                <small style={{ display: 'block', color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>Contact</small>
                <strong style={{ fontSize: 'var(--font-size-sm)' }}>{BUSINESS_SUMMARY.phone}</strong>
              </div>
              <div style={{ padding: '12px', border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-md)' }}>
                <small style={{ display: 'block', color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>Delivery coverage</small>
                <strong style={{ fontSize: 'var(--font-size-sm)' }}>{BUSINESS_SUMMARY.coverage}</strong>
              </div>
            </div>

            <div className="salo-settings-toggle-list">
              <SettingsToggleRow
                id="owner-delivery"
                label="Accepting delivery orders"
                checked={settings.delivery}
                onChange={(value) => update('delivery', value)}
              />
              <SettingsToggleRow
                id="owner-pickup"
                label="Accepting pickup orders"
                checked={settings.pickup}
                onChange={(value) => update('pickup', value)}
              />
              <SettingsToggleRow
                id="owner-dinein"
                label="Accepting dine-in guests"
                checked={settings.dineIn}
                onChange={(value) => update('dineIn', value)}
              />
            </div>

            <div>
              <Link to="/owner/profile" className="salo-partner-status-link">
                Edit business profile, hours and delivery coverage →
              </Link>
              <p className="salo-settings-field-hint">
                Business hours and service areas are managed in Business Profile rather than duplicated here.
              </p>
            </div>
          </SettingsCard>
        );

      case 'orders':
        return (
          <SettingsCard title="Fulfillment and preparation" description="Configure order types and preparation defaults.">
            <div className="salo-settings-toggle-list">
              <SettingsToggleRow
                id="owner-orders-delivery"
                label="Delivery"
                description="Customers may place delivery orders."
                checked={settings.delivery}
                onChange={(value) => update('delivery', value)}
              />
              <SettingsToggleRow
                id="owner-orders-pickup"
                label="Pickup"
                description="Customers may collect their orders."
                checked={settings.pickup}
                onChange={(value) => update('pickup', value)}
              />
              <SettingsToggleRow
                id="owner-orders-dinein"
                label="Dine-in"
                description="Customers may order for dine-in."
                checked={settings.dineIn}
                onChange={(value) => update('dineIn', value)}
              />
              <SettingsToggleRow
                id="owner-orders-scheduled"
                label="Scheduled ordering"
                description="Allow customers to select an eligible future order time."
                checked={settings.scheduledOrders}
                onChange={(value) => update('scheduledOrders', value)}
              />
              <SettingsToggleRow
                id="owner-orders-priority"
                label="Priority ordering"
                description="Visual preference only; no priority business policy is implied."
                checked={settings.priorityOrders}
                onChange={(value) => update('priorityOrders', value)}
              />
            </div>

            <div className="salo-settings-form-grid">
              <SettingsField id="owner-prep-time" label="Preparation time estimate">
                <select
                  id="owner-prep-time"
                  value={settings.preparationTime}
                  onChange={(event) => update('preparationTime', event.target.value)}
                >
                  <option>15 minutes</option>
                  <option>30 minutes</option>
                  <option>45 minutes</option>
                  <option>60 minutes</option>
                </select>
              </SettingsField>

              <SettingsField id="owner-deduction-mode" label="Inventory deduction mode">
                <select
                  id="owner-deduction-mode"
                  value={settings.deductionMode}
                  onChange={(event) => update('deductionMode', event.target.value)}
                >
                  <option value="manual">Manual</option>
                  <option value="on_completion">On order completion</option>
                </select>
              </SettingsField>
            </div>
            <p className="salo-settings-field-hint">
              Inventory deduction options are shown for preview only. Actual policy remains undecided and is not changed here.
            </p>
          </SettingsCard>
        );

      case 'reservations':
        return (
          <SettingsCard title="Availability and booking details" description="Configure table reservation defaults.">
            <SettingsToggleRow
              id="owner-accept-reservations"
              label="Accepting reservations"
              checked={settings.acceptingReservations}
              onChange={(value) => update('acceptingReservations', value)}
            />

            <div className="salo-settings-form-grid">
              <SettingsField id="owner-res-schedule" label="Schedule">
                <select
                  id="owner-res-schedule"
                  value={settings.reservationSchedule}
                  onChange={(event) => update('reservationSchedule', event.target.value)}
                >
                  <option>Use business operating hours</option>
                  <option>Custom reservation hours</option>
                </select>
              </SettingsField>

              <SettingsField id="owner-res-slots" label="Time slots">
                <select
                  id="owner-res-slots"
                  value={settings.reservationTimeSlots}
                  onChange={(event) => update('reservationTimeSlots', event.target.value)}
                >
                  <option>Every 15 minutes</option>
                  <option>Every 30 minutes</option>
                  <option>Every 60 minutes</option>
                </select>
              </SettingsField>

              <SettingsField id="owner-res-duration" label="Reservation duration">
                <select
                  id="owner-res-duration"
                  value={settings.reservationDuration}
                  onChange={(event) => update('reservationDuration', event.target.value)}
                >
                  <option value="60">60 minutes</option>
                  <option value="90">90 minutes</option>
                  <option value="120">120 minutes</option>
                </select>
              </SettingsField>

              <SettingsField id="owner-res-fee" label="Reservation fee (₱)">
                <input
                  id="owner-res-fee"
                  type="number"
                  min="0"
                  value={settings.reservationFee}
                  onChange={(event) => update('reservationFee', event.target.value)}
                />
              </SettingsField>

              <SettingsField id="owner-res-payment" label="Payment option">
                <select
                  id="owner-res-payment"
                  value={settings.paymentMethod}
                  onChange={(event) => update('paymentMethod', event.target.value)}
                >
                  <option>Online payment</option>
                  <option>Pay at restaurant</option>
                  <option>No fee</option>
                </select>
              </SettingsField>

              <SettingsField id="owner-res-table" label="Table assignment preference">
                <select
                  id="owner-res-table"
                  value={settings.tablePreference}
                  onChange={(event) => update('tablePreference', event.target.value)}
                >
                  <option>Auto-suggest available table</option>
                  <option>Staff assigns table</option>
                  <option>Customer requests an area</option>
                </select>
              </SettingsField>
            </div>

            <SettingsField
              id="owner-res-instructions"
              label="Guest instructions"
              hint="Schedule details are sample controls. Business operating hours are edited from Business Profile."
            >
              <textarea
                id="owner-res-instructions"
                rows="4"
                value={settings.instructions}
                onChange={(event) => update('instructions', event.target.value)}
              />
            </SettingsField>
          </SettingsCard>
        );

      case 'payments':
        return (
          <SettingsCard title="Payment details" description="Sensitive payout details are never entered in this preview.">
            <article
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--surface-secondary)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'var(--accent-subtle)',
                  color: 'var(--accent)',
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                ₱
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: 'var(--font-size-sm)' }}>
                  {SETTINGS_DEFAULTS.paymentMethod}
                </strong>
                <small style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
                  Account ending •••• 4821 · Sample masked placeholder
                </small>
              </div>
              <span style={{ color: 'var(--salo-green, #6B8F5B)', fontSize: 'var(--font-size-xs)', fontWeight: 700 }}>
                Connected
              </span>
            </article>

            <div
              style={{
                padding: '14px',
                border: '1px solid color-mix(in srgb, var(--salo-gold, #F4C542) 40%, var(--border-primary))',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--salo-gold-light, #FEF7DF)',
              }}
            >
              <strong style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--salo-brown, #5B3A29)' }}>
                Protected payment interface
              </strong>
              <p style={{ margin: '6px 0 12px', fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                Payout methods and credentials are managed through a protected interface. No card or bank information is requested on this page.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNotice('Design preview only — protected payment management is not connected.')}
              >
                Manage payment method
              </Button>
            </div>
          </SettingsCard>
        );

      case 'notifications':
        return (
          <SettingsCard title="Keep the team informed" description="Choose which event types generate a restaurant notification.">
            <div className="salo-settings-toggle-list">
              {Object.entries(settings.notifications).map(([label, checked]) => (
                <SettingsToggleRow
                  key={label}
                  id={`owner-notif-${label.toLowerCase().replace(/\s+/g, '-')}`}
                  label={label}
                  description={`Preview notification preference for ${label.toLowerCase()}.`}
                  checked={checked}
                  onChange={(value) => updateNotification(label, value)}
                />
              ))}
            </div>
          </SettingsCard>
        );

      case 'security':
        return <SettingsPasswordCard role="owner" />;

      case 'preferences':
        return <SettingsPreferencesSection />;

      default:
        return null;
    }
  };

  return (
    <OwnerLayout>
      <DesignPreviewBanner state={previewState} onStateChange={setPreviewState} />
      <UnifiedSettingsShell
        eyebrow="Restaurant preferences"
        title="Settings"
        subtitle="Manage your restaurant workspace, orders, reservations, notifications, and account."
        sections={sections}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        state={PREVIEW_STATE_MAP[previewState] || 'ready'}
        onRetry={() => setPreviewState('Sample data')}
        dirty={dirty}
        onSave={save}
        onDiscard={discard}
        saveLabel="Save preview"
        notice={notice}
        renderSection={renderSection}
      />

      <ConfirmDialog
        open={deactivateOpen}
        title="Deactivate restaurant workspace?"
        message="This design preview confirms how workspace deactivation would be guarded before disabling orders."
        confirmLabel="Confirm preview"
        cancelLabel="Cancel"
        onConfirm={() => {
          setDeactivateOpen(false);
          setNotice('Design preview only — workspace was not deactivated.');
        }}
        onCancel={() => setDeactivateOpen(false)}
      />
    </OwnerLayout>
  );
}

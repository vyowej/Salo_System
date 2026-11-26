import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import riderService from '../../../services/riderService';
import accountService from '../../../services/accountService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import UnifiedSettingsShell from '../../../components/settings/UnifiedSettingsShell';
import { AccountLifecycleModals } from '../../../components/settings/AccountLifecycleModals';
import {
  SettingsAccountSection,
  SettingsCard,
  SettingsField,
  SettingsPasswordCard,
  SettingsPreferencesSection,
  SettingsToggleRow,
} from '../../../components/settings/SettingsPrimitives';
import { getSettingsSectionsForRole } from '../../../config/settingsConfig';
import RiderAvatarControl from '../components/RiderAvatarControl';

const INITIAL_ACCOUNT_SETTINGS = {
  notifications: {
    deliveryDispatchAlerts: true,
    payoutUpdates: true,
    smsNotifications: false,
  },
  privacy: {
    riderContactPrivacyAck: true,
  },
  security: {
    twoFactor: false,
    loginAlerts: true,
  },
};

const VEHICLE_TYPES = [
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'e_bike', label: 'E-Bike' },
  { value: 'e_scooter', label: 'E-Scooter' },
  { value: 'walking', label: 'Walking' },
];

const VEHICLE_OWNERSHIPS = [
  { value: 'personally_owned', label: 'Personally Owned' },
  { value: 'family_owned', label: 'Family Owned' },
  { value: 'borrowed', label: 'Borrowed' },
  { value: 'rented_leased', label: 'Rented / Leased' },
  { value: 'company_owned', label: 'Company Owned' },
];

function badgeVariantForStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'approved':
    case 'active':
    case 'online':
      return 'success';
    case 'rejected':
    case 'cancelled':
      return 'danger';
    default:
      return 'warning';
  }
}

export default function RiderSettingsPage() {
  const { user } = useAuth();
  const sections = getSettingsSectionsForRole('rider');

  const [activeSection, setActiveSection] = useState('account');
  const [loadingState, setLoadingState] = useState('loading');
  const [riderProfile, setRiderProfile] = useState(null);
  const [availability, setAvailability] = useState({ status: 'offline', is_online: false });
  const [availabilityBusy, setAvailabilityBusy] = useState(false);

  const [accountSettings, setAccountSettings] = useState(INITIAL_ACCOUNT_SETTINGS);
  const [savedAccountSettings, setSavedAccountSettings] = useState(INITIAL_ACCOUNT_SETTINGS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const [changeRequests, setChangeRequests] = useState([]);
  const [changeModalOpen, setChangeModalOpen] = useState(false);
  const [changeForm, setChangeForm] = useState({
    vehicle_type: 'motorcycle',
    vehicle_brand: '',
    vehicle_model: '',
    vehicle_color: '',
    vehicle_year: '',
    plate_number: '',
    vehicle_ownership: 'personally_owned',
    vehicle_owner_name: '',
    vehicle_owner_relationship: '',
    reason: '',
    documents: [],
  });
  const [submittingChange, setSubmittingChange] = useState(false);
  const [changeError, setChangeError] = useState('');

  const [gpsStatus, setGpsStatus] = useState('unchecked');
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoadingState('loading');
    try {
      const [profileData, acctData, requests] = await Promise.all([
        riderService.getProfile().catch(() => null),
        accountService.getSettings().catch(() => null),
        riderService.getChangeRequests().catch(() => []),
      ]);

      if (profileData) {
        setRiderProfile(profileData);
        setAvailability(profileData.availability || { status: 'offline', is_online: false });
        setChangeForm({
          vehicle_type: profileData.vehicle_type || 'motorcycle',
          vehicle_brand: profileData.vehicle_brand || '',
          vehicle_model: profileData.vehicle_model || '',
          vehicle_color: profileData.vehicle_color || '',
          vehicle_year: profileData.vehicle_year ? String(profileData.vehicle_year) : '',
          plate_number: profileData.plate_number || '',
          vehicle_ownership: 'personally_owned',
          vehicle_owner_name: '',
          vehicle_owner_relationship: '',
          reason: '',
          documents: [],
        });
      }

      if (acctData) {
        const merged = {
          notifications: { ...INITIAL_ACCOUNT_SETTINGS.notifications, ...(acctData.notifications || {}) },
          privacy: { ...INITIAL_ACCOUNT_SETTINGS.privacy, ...(acctData.privacy || {}) },
          security: { ...INITIAL_ACCOUNT_SETTINGS.security, ...(acctData.security || {}) },
        };
        setAccountSettings(merged);
        setSavedAccountSettings(merged);
      }

      setChangeRequests(Array.isArray(requests) ? requests : []);
      setDirty(false);
      setLoadingState('ready');
    } catch {
      setLoadingState('error');
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setNotice('');
    try {
      const updated = await accountService.updateSettings(accountSettings);
      const merged = {
        notifications: { ...INITIAL_ACCOUNT_SETTINGS.notifications, ...(updated?.notifications || accountSettings.notifications) },
        privacy: { ...INITIAL_ACCOUNT_SETTINGS.privacy, ...(updated?.privacy || accountSettings.privacy) },
        security: { ...INITIAL_ACCOUNT_SETTINGS.security, ...(updated?.security || accountSettings.security) },
      };
      setAccountSettings(merged);
      setSavedAccountSettings(merged);
      setDirty(false);
      setNotice('Rider settings saved.');
    } catch (err) {
      setNotice(err?.message || 'Unable to save rider settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setAccountSettings(savedAccountSettings);
    setDirty(false);
    setNotice('');
  };

  const handleAvailabilityChange = async (nextStatus) => {
    if (availabilityBusy) return;
    setAvailabilityBusy(true);
    setNotice('');
    try {
      const updated = await riderService.updateAvailability(nextStatus);
      if (updated) setAvailability(updated);
      setNotice(`Driver mode updated to ${nextStatus.replace('_', ' ')}.`);
    } catch (err) {
      setNotice(err?.message || 'Unable to update availability status.');
    } finally {
      setAvailabilityBusy(false);
    }
  };

  const handleCheckGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('unsupported');
      return;
    }
    setGpsStatus('checking');
    navigator.geolocation.getCurrentPosition(
      () => setGpsStatus('granted'),
      () => setGpsStatus('denied'),
      { timeout: 6000 },
    );
  };

  const handleSubmitChangeRequest = async (event) => {
    event.preventDefault();
    if (submittingChange) return;
    setSubmittingChange(true);
    setChangeError('');
    try {
      const payload = {
        vehicle_type: changeForm.vehicle_type,
        reason: changeForm.reason,
        documents: changeForm.documents,
      };
      if (changeForm.vehicle_type !== 'walking') {
        if (changeForm.vehicle_brand) payload.vehicle_brand = changeForm.vehicle_brand;
        if (changeForm.vehicle_model) payload.vehicle_model = changeForm.vehicle_model;
        if (changeForm.vehicle_color) payload.vehicle_color = changeForm.vehicle_color;
        if (changeForm.vehicle_year) payload.vehicle_year = Number(changeForm.vehicle_year);
        if (changeForm.plate_number) payload.plate_number = changeForm.plate_number;
        if (changeForm.vehicle_ownership) payload.vehicle_ownership = changeForm.vehicle_ownership;
        if (changeForm.vehicle_ownership !== 'personally_owned') {
          if (changeForm.vehicle_owner_name) payload.vehicle_owner_name = changeForm.vehicle_owner_name;
          if (changeForm.vehicle_owner_relationship) payload.vehicle_owner_relationship = changeForm.vehicle_owner_relationship;
        }
      }

      const created = await riderService.submitChangeRequest(payload);
      if (created) {
        setChangeRequests((prev) => [created, ...prev]);
      }
      setChangeModalOpen(false);
      setNotice('Verification change request submitted for administrator review.');
    } catch (err) {
      setChangeError(err?.message || 'Unable to submit change request.');
    } finally {
      setSubmittingChange(false);
    }
  };

  const handleCancelRequest = async (requestId) => {
    try {
      const updated = await riderService.cancelChangeRequest(requestId);
      if (updated) {
        setChangeRequests((prev) => prev.map((r) => (r.request_id === requestId ? updated : r)));
      }
      setNotice('Change request cancelled.');
    } catch (err) {
      setNotice(err?.message || 'Unable to cancel request.');
    }
  };

  const profileName = user?.name || user?.username || 'Rider';
  const profileEmail = user?.email || user?.username || '';
  const initials = profileName.slice(0, 2).toUpperCase();

  const renderSection = (sectionId) => {
    switch (sectionId) {
      case 'account':
        return (
          <>
            <SettingsCard
              title="Rider Profile Photo"
              description="Upload a clear profile photo or take one with your camera."
            >
              <RiderAvatarControl
                compact
                avatarUrl={riderProfile?.profile_photo || user?.avatar}
                displayName={profileName}
                onPhotoUpdated={(updated) => {
                  if (updated) setRiderProfile(updated);
                }}
              />
            </SettingsCard>

            <SettingsAccountSection
              role="rider"
              user={user}
              profileName={profileName}
              profileEmail={profileEmail}
              profileInitials={initials}
              profileAvatar={user?.avatar}
              emailValue={profileEmail}
              onNavigateToSecurity={() => setActiveSection('security')}
              dangerZone={{
                title: 'Deactivate or delete account',
                description: 'Deactivating your account disables login access. Active deliveries must be completed first.',
                actionLabel: 'Deactivate account',
                onAction: () => setDeactivateOpen(true),
                secondaryActionLabel: 'Request deletion',
                onSecondaryAction: () => setDeleteOpen(true),
              }}
            />

            <SettingsCard
              title="Emergency Contact & Shift Profile"
              description="Update your emergency contact, preferred hubs, and shift schedule directly."
            >
              <div className="salo-settings-form-grid">
                <SettingsField id="rider-em-name" label="Emergency Contact">
                  <input id="rider-em-name" type="text" readOnly value={riderProfile?.emergency_contact_name || '—'} />
                </SettingsField>
                <SettingsField id="rider-em-phone" label="Emergency Phone">
                  <input id="rider-em-phone" type="text" readOnly value={riderProfile?.emergency_contact_phone || '—'} />
                </SettingsField>
              </div>
              <div style={{ marginTop: '8px' }}>
                <Link to="/rider/profile" className="salo-partner-status-link">
                  Edit emergency contact, hubs, &amp; shift schedule →
                </Link>
              </div>
            </SettingsCard>
          </>
        );

      case 'driver_mode':
        return (
          <SettingsCard
            title="Live Availability & Readiness"
            description="Control whether you are currently accepting delivery dispatches."
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong style={{ fontSize: 'var(--font-size-sm)' }}>Current Status:</strong>
                  <Badge variant={badgeVariantForStatus(availability.status)} size="sm">
                    {String(availability.status || 'offline').replace('_', ' ')}
                  </Badge>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Button
                    type="button"
                    size="sm"
                    variant={availability.status === 'online' ? 'primary' : 'outline'}
                    disabled={availabilityBusy}
                    onClick={() => handleAvailabilityChange('online')}
                  >
                    Go Online
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={availability.status === 'temporarily_unavailable' ? 'primary' : 'outline'}
                    disabled={availabilityBusy}
                    onClick={() => handleAvailabilityChange('temporarily_unavailable')}
                  >
                    Break
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={availability.status === 'offline' ? 'primary' : 'outline'}
                    disabled={availabilityBusy}
                    onClick={() => handleAvailabilityChange('offline')}
                  >
                    Offline
                  </Button>
                </div>
              </div>

              <div className="salo-settings-form-grid">
                <SettingsField id="rider-status-check" label="Rider Account Status">
                  <div style={{ display: 'flex', alignItems: 'center', minHeight: '40px' }}>
                    <Badge variant={badgeVariantForStatus(riderProfile?.rider_status)} size="sm">
                      {riderProfile?.rider_status || 'pending'}
                    </Badge>
                  </div>
                </SettingsField>
                <SettingsField id="rider-city-check" label="Base City">
                  <input id="rider-city-check" type="text" readOnly value={riderProfile?.base_city || '—'} />
                </SettingsField>
              </div>
            </div>
          </SettingsCard>
        );

      case 'verification':
        return (
          <>
            <SettingsCard
              title="Approved Vehicle & Verification Details"
              description="Vehicle, plate number, and identity documents are locked after verification. Submit a change request for administrator approval."
              actions={(
                <Button type="button" variant="primary" size="sm" onClick={() => setChangeModalOpen(true)}>
                  Request Vehicle Change
                </Button>
              )}
            >
              <div className="salo-settings-form-grid">
                <SettingsField id="rider-ver-type" label="Vehicle Type">
                  <input id="rider-ver-type" type="text" readOnly value={String(riderProfile?.vehicle_type || '—').replace('_', ' ')} />
                </SettingsField>
                <SettingsField id="rider-ver-plate" label="Plate Number">
                  <input id="rider-ver-plate" type="text" readOnly value={riderProfile?.plate_number || 'N/A'} />
                </SettingsField>
                <SettingsField id="rider-ver-brand" label="Brand / Model">
                  <input
                    id="rider-ver-brand"
                    type="text"
                    readOnly
                    value={[riderProfile?.vehicle_brand, riderProfile?.vehicle_model].filter(Boolean).join(' ') || '—'}
                  />
                </SettingsField>
                <SettingsField id="rider-ver-year" label="Color / Year">
                  <input
                    id="rider-ver-year"
                    type="text"
                    readOnly
                    value={[riderProfile?.vehicle_color, riderProfile?.vehicle_year].filter(Boolean).join(' · ') || '—'}
                  />
                </SettingsField>
              </div>
            </SettingsCard>

            <SettingsCard
              title="Change Request History"
              description="Your approved vehicle profile remains active until an administrator approves your request."
            >
              {changeRequests.length === 0 ? (
                <p className="salo-settings-field-hint">No verification change requests submitted yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {changeRequests.map((req) => (
                    <div
                      key={req.request_id}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-primary)',
                        background: 'var(--surface-secondary)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '12px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ fontSize: 'var(--font-size-sm)' }}>Request #{req.request_id}</strong>
                          <Badge variant={badgeVariantForStatus(req.status)} size="sm">{req.status}</Badge>
                        </div>
                        <small style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                          Requested: {Object.entries(req.payload || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'Supporting documents'}
                        </small>
                        {req.review_note && (
                          <small style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-xs)' }}>
                            Admin note: {req.review_note}
                          </small>
                        )}
                      </div>
                      {req.status === 'pending' && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleCancelRequest(req.request_id)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SettingsCard>
          </>
        );

      case 'location':
        return (
          <SettingsCard
            title="GPS & Navigation Permissions"
            description="Verify browser location access so live delivery tracking works accurately while online."
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <strong style={{ fontSize: 'var(--font-size-sm)' }}>Browser Location Status</strong>
                <small style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                  {gpsStatus === 'granted' && 'Location access is enabled for live GPS tracking.'}
                  {gpsStatus === 'denied' && 'Location access was blocked. Enable it in your browser site settings.'}
                  {gpsStatus === 'unsupported' && 'Geolocation is not supported in this browser.'}
                  {(gpsStatus === 'unchecked' || gpsStatus === 'checking') && 'Click Test GPS Access to verify your device location permission.'}
                </small>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleCheckGps}>
                {gpsStatus === 'checking' ? 'Checking...' : 'Test GPS Access'}
              </Button>
            </div>
          </SettingsCard>
        );

      case 'privacy':
        return (
          <SettingsCard title="Customer Privacy & Data Handling" description="Rules for handling customer addresses and contact numbers.">
            <div className="salo-settings-toggle-list">
              <SettingsToggleRow
                id="rider-privacy-ack"
                label="Acknowledge customer contact privacy"
                description="Use customer phone numbers and delivery addresses solely for active order fulfillment."
                checked={accountSettings.privacy.riderContactPrivacyAck}
                onChange={(checked) => {
                  setAccountSettings((prev) => ({
                    ...prev,
                    privacy: { ...prev.privacy, riderContactPrivacyAck: checked },
                  }));
                  setDirty(true);
                }}
              />
            </div>
          </SettingsCard>
        );

      case 'terms':
        return (
          <SettingsCard title="SALO Rider Service Agreement" description="Core operational commitments for active SALO delivery partners.">
            <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.7 }}>
              <li>Maintain valid vehicle registration, driver&apos;s license (where applicable), and safety gear while online.</li>
              <li>Handle food and beverages hygienically and deliver directly to the customer&apos;s specified address.</li>
              <li>Update delivery milestones (picked up, delivered) accurately and collect COD amounts transparently.</li>
              <li>Never retain or misuse customer phone numbers or personal details after delivery completion.</li>
            </ul>
          </SettingsCard>
        );

      case 'notifications':
        return (
          <SettingsCard title="Rider Notification Channels" description="Choose which dispatch and payout alerts you receive.">
            <div className="salo-settings-toggle-list">
              <SettingsToggleRow
                id="rider-notif-dispatch"
                label="Delivery dispatch alerts"
                description="Receive immediate alerts when nearby delivery jobs become available."
                checked={accountSettings.notifications.deliveryDispatchAlerts}
                onChange={(checked) => {
                  setAccountSettings((prev) => ({
                    ...prev,
                    notifications: { ...prev.notifications, deliveryDispatchAlerts: checked },
                  }));
                  setDirty(true);
                }}
              />
              <SettingsToggleRow
                id="rider-notif-payouts"
                label="Earnings & payout updates"
                description="Notifications when delivery earnings or settlements are updated."
                checked={accountSettings.notifications.payoutUpdates}
                onChange={(checked) => {
                  setAccountSettings((prev) => ({
                    ...prev,
                    notifications: { ...prev.notifications, payoutUpdates: checked },
                  }));
                  setDirty(true);
                }}
              />
              <SettingsToggleRow
                id="rider-notif-sms"
                label="SMS notifications"
                description="Receive urgent delivery updates via SMS."
                checked={accountSettings.notifications.smsNotifications}
                onChange={(checked) => {
                  setAccountSettings((prev) => ({
                    ...prev,
                    notifications: { ...prev.notifications, smsNotifications: checked },
                  }));
                  setDirty(true);
                }}
              />
            </div>
          </SettingsCard>
        );

      case 'security':
        return (
          <>
            <SettingsPasswordCard role="rider" />
            <SettingsCard title="Sign-in protection" description="Extra layers of protection for your rider account.">
              <div className="salo-settings-toggle-list">
                <SettingsToggleRow
                  id="rider-sec-2fa"
                  label="Two-factor authentication"
                  description="Require verification when signing in from a new device."
                  checked={accountSettings.security.twoFactor}
                  onChange={(checked) => {
                    setAccountSettings((prev) => ({
                      ...prev,
                      security: { ...prev.security, twoFactor: checked },
                    }));
                    setDirty(true);
                  }}
                />
                <SettingsToggleRow
                  id="rider-sec-alerts"
                  label="Login alerts"
                  description="Receive an email when a new device signs in to your account."
                  checked={accountSettings.security.loginAlerts}
                  onChange={(checked) => {
                    setAccountSettings((prev) => ({
                      ...prev,
                      security: { ...prev.security, loginAlerts: checked },
                    }));
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
    <>
      <UnifiedSettingsShell
        eyebrow="Rider preferences"
        title="Settings"
        subtitle="Manage your driver mode, vehicle verification requests, GPS, notifications, and security."
        sections={sections}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        state={loadingState}
        onRetry={loadSettings}
        dirty={dirty}
        onSave={handleSave}
        onDiscard={handleDiscard}
        notice={notice}
        renderSection={renderSection}
      />

      <Modal
        open={changeModalOpen}
        onClose={submittingChange ? undefined : () => setChangeModalOpen(false)}
        title="Request Vehicle / Verification Change"
        size="md"
        footer={(
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button type="button" variant="ghost" size="sm" onClick={() => setChangeModalOpen(false)} disabled={submittingChange}>
              Cancel
            </Button>
            <Button type="submit" form="rider-change-req-form" variant="primary" size="sm" loading={submittingChange}>
              Submit for Approval
            </Button>
          </div>
        )}
      >
        <form id="rider-change-req-form" onSubmit={handleSubmitChangeRequest} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <SettingsField id="rc-vtype" label="Vehicle Type">
            <select
              id="rc-vtype"
              value={changeForm.vehicle_type}
              onChange={(e) => setChangeForm((p) => ({ ...p, vehicle_type: e.target.value }))}
            >
              {VEHICLE_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </SettingsField>

          {changeForm.vehicle_type !== 'walking' && (
            <>
              <div className="salo-settings-form-grid">
                <SettingsField id="rc-brand" label="Vehicle Brand">
                  <input
                    id="rc-brand"
                    type="text"
                    value={changeForm.vehicle_brand}
                    onChange={(e) => setChangeForm((p) => ({ ...p, vehicle_brand: e.target.value }))}
                  />
                </SettingsField>
                <SettingsField id="rc-model" label="Vehicle Model">
                  <input
                    id="rc-model"
                    type="text"
                    value={changeForm.vehicle_model}
                    onChange={(e) => setChangeForm((p) => ({ ...p, vehicle_model: e.target.value }))}
                  />
                </SettingsField>
                <SettingsField id="rc-color" label="Color">
                  <input
                    id="rc-color"
                    type="text"
                    value={changeForm.vehicle_color}
                    onChange={(e) => setChangeForm((p) => ({ ...p, vehicle_color: e.target.value }))}
                  />
                </SettingsField>
                <SettingsField id="rc-year" label="Year">
                  <input
                    id="rc-year"
                    type="number"
                    min="1980"
                    max="2100"
                    value={changeForm.vehicle_year}
                    onChange={(e) => setChangeForm((p) => ({ ...p, vehicle_year: e.target.value }))}
                  />
                </SettingsField>
                <SettingsField id="rc-plate" label="Plate Number">
                  <input
                    id="rc-plate"
                    type="text"
                    value={changeForm.plate_number}
                    onChange={(e) => setChangeForm((p) => ({ ...p, plate_number: e.target.value }))}
                  />
                </SettingsField>
                <SettingsField id="rc-own" label="Ownership">
                  <select
                    id="rc-own"
                    value={changeForm.vehicle_ownership}
                    onChange={(e) => setChangeForm((p) => ({ ...p, vehicle_ownership: e.target.value }))}
                  >
                    {VEHICLE_OWNERSHIPS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </SettingsField>
              </div>

              {changeForm.vehicle_ownership !== 'personally_owned' && (
                <div className="salo-settings-form-grid">
                  <SettingsField id="rc-own-name" label="Vehicle Owner Name">
                    <input
                      id="rc-own-name"
                      type="text"
                      required
                      value={changeForm.vehicle_owner_name}
                      onChange={(e) => setChangeForm((p) => ({ ...p, vehicle_owner_name: e.target.value }))}
                    />
                  </SettingsField>
                  <SettingsField id="rc-own-rel" label="Relationship to Owner">
                    <input
                      id="rc-own-rel"
                      type="text"
                      required
                      value={changeForm.vehicle_owner_relationship}
                      onChange={(e) => setChangeForm((p) => ({ ...p, vehicle_owner_relationship: e.target.value }))}
                    />
                  </SettingsField>
                </div>
              )}
            </>
          )}

          <SettingsField id="rc-reason" label="Reason / Notes">
            <textarea
              id="rc-reason"
              rows={2}
              value={changeForm.reason}
              onChange={(e) => setChangeForm((p) => ({ ...p, reason: e.target.value }))}
              placeholder="Explain what changed (e.g. new motorcycle, renewed license)"
            />
          </SettingsField>
          <SettingsField id="rc-docs" label="Supporting Documents (Driver's License, OR/CR, ID — PDF/JPG/PNG)">
            <input
              id="rc-docs"
              type="file"
              multiple
              accept=".pdf,image/jpeg,image/png"
              onChange={(e) => setChangeForm((p) => ({ ...p, documents: Array.from(e.target.files || []) }))}
            />
          </SettingsField>
          {changeError && <p className="salo-settings-field-error" role="alert">{changeError}</p>}
        </form>
      </Modal>

      <AccountLifecycleModals
        deactivateOpen={deactivateOpen}
        onCloseDeactivate={() => setDeactivateOpen(false)}
        deleteOpen={deleteOpen}
        onCloseDelete={() => setDeleteOpen(false)}
        onNotice={(msg) => setNotice(msg)}
      />
    </>
  );
}

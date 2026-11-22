import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import OwnerLayout from '../../../layouts/OwnerLayout';
import { useAuth } from '../../../hooks/useAuth';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import ownerService from '../../../services/ownerService';
import {
  mapBackendSettingsErrors,
  validateReservationSettings,
} from '../utils/reservationSettingsHelpers';
import accountService from '../../../services/accountService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import ImageCropModal from '../../../components/common/ImageCropModal';
import RestaurantImage from '../../customer/components/RestaurantImage';
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

const INITIAL_ACCOUNT_SETTINGS = {
  notifications: {
    newOrderAlerts: true,
    reservationReminders: true,
    reviewAlerts: true,
    payoutUpdates: true,
    smsNotifications: false,
  },
  security: {
    twoFactor: false,
    loginAlerts: true,
  },
};

const BUSINESS_TYPES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'fast_food', label: 'Fast Food' },
  { value: 'food_stall', label: 'Food Stall' },
  { value: 'food_kiosk', label: 'Food Kiosk' },
  { value: 'cloud_kitchen', label: 'Cloud Kitchen' },
  { value: 'other', label: 'Other' },
];

const OWNERSHIP_STRUCTURES = [
  { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'corporation', label: 'Corporation' },
  { value: 'cooperative', label: 'Cooperative' },
  { value: 'other', label: 'Other' },
];

function badgeVariantForStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'approved':
    case 'active':
      return 'success';
    case 'rejected':
    case 'cancelled':
      return 'danger';
    default:
      return 'warning';
  }
}

export default function OwnerSettingsPage() {
  const { user } = useAuth();
  const { selectedRestaurantId, can } = useRestaurantAccess();
  const sections = getSettingsSectionsForRole('restaurant');

  const canEditBusiness = can?.('business.profile.edit') ?? true;
  const canManagePhotos = can?.('business.photos.manage') ?? true;

  const [activeSection, setActiveSection] = useState('account');
  const [loadingState, setLoadingState] = useState('loading');
  const [restaurant, setRestaurant] = useState(null);
  const [payoutAccount, setPayoutAccount] = useState(null);
  const [savedForm, setSavedForm] = useState(null);
  const [form, setForm] = useState(null);
  const [accountSettings, setAccountSettings] = useState(INITIAL_ACCOUNT_SETTINGS);
  const [savedAccountSettings, setSavedAccountSettings] = useState(INITIAL_ACCOUNT_SETTINGS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const [changeRequests, setChangeRequests] = useState([]);
  const [changeModalOpen, setChangeModalOpen] = useState(false);
  const [changeForm, setChangeForm] = useState({
    restaurant_name: '',
    registered_name: '',
    business_type: 'restaurant',
    ownership_structure: 'sole_proprietorship',
    reason: '',
    documents: [],
  });
  const [submittingChange, setSubmittingChange] = useState(false);
  const [changeError, setChangeError] = useState('');

  const [cropState, setCropState] = useState({ open: false, target: 'logo', file: null });
  const [brandingBusy, setBrandingBusy] = useState(false);
  const logoInputRef = useRef(null);
  const coverInputRef = useRef(null);

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoadingState('loading');
    try {
      const [restData, acctData, requests] = await Promise.all([
        ownerService.getSettings(selectedRestaurantId),
        accountService.getSettings().catch(() => null),
        ownerService.getChangeRequests(selectedRestaurantId).catch(() => []),
      ]);

      const profile = restData?.profile || null;
      setRestaurant(profile);
      setPayoutAccount(restData?.payout_account || null);
      setChangeRequests(Array.isArray(requests) ? requests : []);

      if (profile) {
        const initialRestForm = {
          offers_delivery: Boolean(profile.offers_delivery),
          offers_pickup: Boolean(profile.offers_pickup),
          offers_dine_in: Boolean(profile.offers_dine_in ?? true),
          delivery_radius: profile.delivery_radius ?? '',
          accepting_orders: Boolean(profile.accepting_orders),
          inventory_deduction_mode: profile.inventory_deduction_mode || 'manual',
          accepts_reservations: Boolean(profile.accepts_reservations),
          accepting_reservations: Boolean(profile.accepting_reservations),
          reservation_min_notice_hours: Number(profile.reservation_min_notice_hours ?? 2),
          reservation_max_party_size: Number(profile.reservation_max_party_size ?? 8),
          reservation_duration_minutes: Number(profile.reservation_duration_minutes ?? 90),
          reservation_max_advance_days: Number(profile.reservation_max_advance_days ?? 30),
          reservation_cancellation_cutoff_minutes: Number(profile.reservation_cancellation_cutoff_minutes ?? 120),
          reservation_auto_confirm: Boolean(profile.reservation_auto_confirm ?? false),
          reservation_pending_expiry_minutes: Number(profile.reservation_pending_expiry_minutes ?? 120),
          reservation_deposit_required: Boolean(profile.reservation_deposit_required ?? false),
          reservation_deposit_amount: Number(profile.reservation_deposit_amount ?? 0),
          reservation_service_fee: Number(profile.reservation_service_fee ?? 0),
          reservation_notes: profile.reservation_notes || '',
        };
        setSavedForm(initialRestForm);
        setForm(initialRestForm);
        setChangeForm({
          restaurant_name: profile.restaurant_name || '',
          registered_name: profile.registered_name || '',
          business_type: profile.business_type || 'restaurant',
          ownership_structure: profile.ownership_structure || 'sole_proprietorship',
          reason: '',
          documents: [],
        });
      }

      if (acctData) {
        const merged = {
          notifications: { ...INITIAL_ACCOUNT_SETTINGS.notifications, ...(acctData.notifications || {}) },
          security: { ...INITIAL_ACCOUNT_SETTINGS.security, ...(acctData.security || {}) },
        };
        setAccountSettings(merged);
        setSavedAccountSettings(merged);
      }

      setDirty(false);
      setLoadingState('ready');
    } catch {
      setLoadingState('error');
    }
  }, [selectedRestaurantId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateField = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'reservation_deposit_required' && value === true) {
        next.reservation_auto_confirm = false;
      }
      return next;
    });
    setFieldErrors((prev) => {
      if (!prev || Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      delete next[key];
      if (key === 'reservation_deposit_required') {
        delete next.reservation_auto_confirm;
        delete next.reservation_deposit_amount;
      }
      return next;
    });
    setDirty(true);
    setNotice('');
  };

  const handleSave = async () => {
    if (saving || !form) return;
    if (!form.offers_delivery && !form.offers_pickup && !form.offers_dine_in) {
      setNotice('At least one service (Delivery, Pickup, or Dine-In) must stay enabled.');
      return;
    }

    if (canEditBusiness) {
      const validationErrors = validateReservationSettings(form);
      if (Object.keys(validationErrors).length > 0) {
        setFieldErrors(validationErrors);
        setNotice(Object.values(validationErrors)[0]);
        setActiveSection('reservations');
        return;
      }
    }

    setSaving(true);
    setNotice('');
    setFieldErrors({});
    try {
      const [restRes, acctRes] = await Promise.all([
        canEditBusiness
          ? ownerService.updateSettings(selectedRestaurantId, {
              ...form,
              delivery_radius: form.delivery_radius === '' ? null : Number(form.delivery_radius),
              reservation_min_notice_hours: Number(form.reservation_min_notice_hours),
              reservation_max_party_size: Number(form.reservation_max_party_size),
              reservation_duration_minutes: Number(form.reservation_duration_minutes),
              reservation_max_advance_days: Number(form.reservation_max_advance_days),
              reservation_cancellation_cutoff_minutes: Number(form.reservation_cancellation_cutoff_minutes),
              reservation_pending_expiry_minutes: Number(form.reservation_pending_expiry_minutes),
              reservation_auto_confirm: Boolean(form.reservation_auto_confirm),
              reservation_deposit_required: Boolean(form.reservation_deposit_required),
              reservation_deposit_amount: Number(form.reservation_deposit_amount || 0),
              reservation_service_fee: Number(form.reservation_service_fee || 0),
            })
          : Promise.resolve(null),
        accountService.updateSettings(accountSettings),
      ]);

      if (restRes?.profile) {
        setRestaurant(restRes.profile);
      }
      setSavedForm(form);
      if (acctRes) {
        const merged = {
          notifications: { ...INITIAL_ACCOUNT_SETTINGS.notifications, ...(acctRes.notifications || {}) },
          security: { ...INITIAL_ACCOUNT_SETTINGS.security, ...(acctRes.security || {}) },
        };
        setAccountSettings(merged);
        setSavedAccountSettings(merged);
      }
      setDirty(false);
      setNotice('Restaurant settings saved.');
    } catch (err) {
      const mapped = mapBackendSettingsErrors(err);
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped);
      }
      setNotice(err?.message || 'Unable to save restaurant settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (savedForm) setForm(savedForm);
    setAccountSettings(savedAccountSettings);
    setDirty(false);
    setNotice('');
  };

  const handlePickImage = (target, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setCropState({ open: true, target, file });
  };

  const handleConfirmCrop = async (croppedFile) => {
    if (brandingBusy) return;
    setBrandingBusy(true);
    setNotice('');
    try {
      const updated = await ownerService.updateBranding(selectedRestaurantId, {
        logoFile: cropState.target === 'logo' ? croppedFile : null,
        coverFile: cropState.target === 'cover' ? croppedFile : null,
      });
      if (updated) setRestaurant(updated);
      setCropState({ open: false, target: 'logo', file: null });
      setNotice(cropState.target === 'logo' ? 'Restaurant logo updated.' : 'Restaurant cover photo updated.');
    } catch (err) {
      setNotice(err?.message || 'Unable to upload branding image.');
    } finally {
      setBrandingBusy(false);
    }
  };

  const handleRemoveBranding = async (target) => {
    if (brandingBusy) return;
    setBrandingBusy(true);
    setNotice('');
    try {
      const updated = await ownerService.updateBranding(selectedRestaurantId, {
        removeLogo: target === 'logo',
        removeCover: target === 'cover',
      });
      if (updated) setRestaurant(updated);
      setNotice(target === 'logo' ? 'Logo removed.' : 'Cover photo removed.');
    } catch (err) {
      setNotice(err?.message || 'Unable to remove image.');
    } finally {
      setBrandingBusy(false);
    }
  };

  const handleSubmitChangeRequest = async (event) => {
    event.preventDefault();
    if (submittingChange) return;
    setSubmittingChange(true);
    setChangeError('');
    try {
      const created = await ownerService.submitChangeRequest(selectedRestaurantId, {
        restaurant_name: changeForm.restaurant_name,
        registered_name: changeForm.registered_name,
        business_type: changeForm.business_type,
        ownership_structure: changeForm.ownership_structure,
        reason: changeForm.reason,
        documents: changeForm.documents,
      });
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
      const updated = await ownerService.cancelChangeRequest(requestId);
      if (updated) {
        setChangeRequests((prev) => prev.map((r) => (r.request_id === requestId ? updated : r)));
      }
      setNotice('Change request cancelled.');
    } catch (err) {
      setNotice(err?.message || 'Unable to cancel request.');
    }
  };

  const profileName = user?.name || user?.username || 'Restaurant Owner';
  const profileEmail = user?.email || user?.username || '';
  const initials = profileName.slice(0, 2).toUpperCase();

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
            emailValue={profileEmail}
            onNavigateToSecurity={() => setActiveSection('security')}
            dangerZone={{
              title: 'Deactivate or delete account',
              description: 'Deactivating your account signs you out. If you are the sole owner with active orders, resolve them first.',
              actionLabel: 'Deactivate account',
              onAction: () => setDeactivateOpen(true),
              secondaryActionLabel: 'Request deletion',
              onSecondaryAction: () => setDeleteOpen(true),
            }}
          />
        );

      case 'business':
        return (
          <>
            <SettingsCard
              title="Storefront Cover & Logo"
              description="Upload, crop, and reposition your restaurant cover photo and logo just like a social profile."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-primary)', background: 'var(--surface-secondary)' }}>
                  <div style={{ height: '160px', width: '100%', overflow: 'hidden' }}>
                    <RestaurantImage
                      image={restaurant?.cover_image}
                      alt="Restaurant cover photo"
                      fallbackSrc="/images/landing/restaurant-interior.png"
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 16px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--border-primary)', background: 'var(--surface-primary)', flexShrink: 0 }}>
                        <RestaurantImage
                          image={restaurant?.logo_image}
                          alt="Restaurant logo"
                          fallback={restaurant?.restaurant_name?.slice(0, 2)?.toUpperCase() || 'RS'}
                        />
                      </div>
                      <div>
                        <strong style={{ display: 'block', fontSize: 'var(--font-size-sm)' }}>
                          {restaurant?.restaurant_name || 'Your Restaurant'}
                        </strong>
                        <small style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                          Logo (1:1 square) &amp; Cover Photo (16:9 wide)
                        </small>
                      </div>
                    </div>
                    {canManagePhotos && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => handlePickImage('logo', e)} />
                        <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => handlePickImage('cover', e)} />
                        <Button type="button" variant="outline" size="sm" disabled={brandingBusy} onClick={() => logoInputRef.current?.click()}>
                          Edit Logo
                        </Button>
                        {restaurant?.logo_image && (
                          <Button type="button" variant="ghost" size="sm" disabled={brandingBusy} onClick={() => handleRemoveBranding('logo')}>
                            Remove Logo
                          </Button>
                        )}
                        <Button type="button" variant="primary" size="sm" disabled={brandingBusy} onClick={() => coverInputRef.current?.click()}>
                          Edit Cover Photo
                        </Button>
                        {restaurant?.cover_image && (
                          <Button type="button" variant="ghost" size="sm" disabled={brandingBusy} onClick={() => handleRemoveBranding('cover')}>
                            Remove Cover
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Link to="/owner/profile" className="salo-partner-status-link">
                    Edit full business description, hours, &amp; location →
                  </Link>
                </div>
              </div>
            </SettingsCard>

            <SettingsCard
              title="Service Channels"
              description="Enable or disable ordering channels offered by your restaurant."
            >
              <div className="salo-settings-toggle-list">
                <SettingsToggleRow
                  id="owner-offers-delivery"
                  label="Delivery orders"
                  description="Allow customers to place delivery orders within your service radius."
                  checked={form?.offers_delivery}
                  disabled={!canEditBusiness}
                  onChange={(checked) => updateField('offers_delivery', checked)}
                />
                <SettingsToggleRow
                  id="owner-offers-pickup"
                  label="Self-pickup orders"
                  description="Allow customers to order ahead and pick up at your counter."
                  checked={form?.offers_pickup}
                  disabled={!canEditBusiness}
                  onChange={(checked) => updateField('offers_pickup', checked)}
                />
                <SettingsToggleRow
                  id="owner-offers-dine-in"
                  label="Dine-in service"
                  description="Show dine-in availability on your SALO storefront."
                  checked={form?.offers_dine_in}
                  disabled={!canEditBusiness}
                  onChange={(checked) => updateField('offers_dine_in', checked)}
                />
              </div>

              <div className="salo-settings-form-grid" style={{ marginTop: '12px' }}>
                <SettingsField id="owner-delivery-radius" label="Delivery radius (km)" hint="Optional max delivery distance in kilometers.">
                  <input
                    id="owner-delivery-radius"
                    type="number"
                    min="0.5"
                    max="100"
                    step="0.5"
                    disabled={!canEditBusiness}
                    value={form?.delivery_radius ?? ''}
                    onChange={(e) => updateField('delivery_radius', e.target.value)}
                  />
                </SettingsField>
              </div>
            </SettingsCard>
          </>
        );

      case 'orders':
        return (
          <SettingsCard
            title="Order Acceptance & Inventory"
            description="Control live order intake and how stock is deducted when orders progress."
          >
            <div className="salo-settings-toggle-list">
              <SettingsToggleRow
                id="owner-accepting-orders"
                label="Accepting new orders"
                description="Pause incoming orders temporarily during peak hours or kitchen prep."
                checked={form?.accepting_orders}
                disabled={!canEditBusiness}
                onChange={(checked) => updateField('accepting_orders', checked)}
              />
            </div>

            <div className="salo-settings-form-grid" style={{ marginTop: '12px' }}>
              <SettingsField id="owner-inventory-mode" label="Inventory deduction mode">
                <select
                  id="owner-inventory-mode"
                  disabled={!canEditBusiness}
                  value={form?.inventory_deduction_mode || 'manual'}
                  onChange={(e) => updateField('inventory_deduction_mode', e.target.value)}
                >
                  <option value="manual">Manual deduction</option>
                  <option value="on_completion">Automatic on order completion</option>
                </select>
              </SettingsField>
            </div>
          </SettingsCard>
        );

      case 'reservations':
        return (
          <SettingsCard
            title="Reservation settings"
            description="Configure table booking rules, deposits, and fees. Deposits are collected directly by your restaurant (no online payment gateway)."
          >
            <div className="salo-settings-toggle-list">
              <SettingsToggleRow
                id="owner-accepts-reservations"
                label="Enable table reservations"
                description="Allow customers to request table reservations from your storefront."
                checked={form?.accepts_reservations}
                disabled={!canEditBusiness}
                onChange={(checked) => updateField('accepts_reservations', checked)}
              />
              <SettingsToggleRow
                id="owner-accepting-reservations"
                label="Currently accepting new bookings"
                description="Temporarily pause reservation requests without disabling the feature."
                checked={form?.accepting_reservations}
                disabled={!canEditBusiness || !form?.accepts_reservations}
                onChange={(checked) => updateField('accepting_reservations', checked)}
              />
              <SettingsToggleRow
                id="owner-res-auto-confirm"
                label="Auto-confirm bookings"
                description={
                  form?.reservation_deposit_required
                    ? 'Disabled while a deposit is required — deposits must be received before confirming.'
                    : 'Automatically confirm new bookings when a matching table is available.'
                }
                checked={Boolean(form?.reservation_auto_confirm)}
                disabled={!canEditBusiness || Boolean(form?.reservation_deposit_required)}
                onChange={(checked) => updateField('reservation_auto_confirm', checked)}
              />
              {fieldErrors.reservation_auto_confirm && (
                <p className="salo-field-error" role="alert">{fieldErrors.reservation_auto_confirm}</p>
              )}
              <SettingsToggleRow
                id="owner-res-deposit-required"
                label="Require deposit"
                description="Require a deposit for new bookings. Collected directly by the restaurant (no online payment)."
                checked={Boolean(form?.reservation_deposit_required)}
                disabled={!canEditBusiness}
                onChange={(checked) => updateField('reservation_deposit_required', checked)}
              />
            </div>

            <div className="salo-settings-form-grid" style={{ marginTop: '12px' }}>
              <SettingsField
                id="owner-res-duration"
                label="Reservation length (minutes)"
                hint="30–240 minutes in 15-minute steps."
                error={fieldErrors.reservation_duration_minutes}
              >
                <input
                  id="owner-res-duration"
                  type="number"
                  min="30"
                  max="240"
                  step="15"
                  disabled={!canEditBusiness}
                  value={form?.reservation_duration_minutes ?? 90}
                  onChange={(e) => updateField('reservation_duration_minutes', e.target.value)}
                />
              </SettingsField>

              <SettingsField
                id="owner-res-advance"
                label="Booking window (max days ahead)"
                hint="How far in advance guests can book (1–365 days)."
                error={fieldErrors.reservation_max_advance_days}
              >
                <input
                  id="owner-res-advance"
                  type="number"
                  min="1"
                  max="365"
                  disabled={!canEditBusiness}
                  value={form?.reservation_max_advance_days ?? 30}
                  onChange={(e) => updateField('reservation_max_advance_days', e.target.value)}
                />
              </SettingsField>

              <SettingsField
                id="owner-res-notice"
                label="Minimum notice (hours)"
                hint="Hours before arrival required to book (0–168h; must fit within booking window)."
                error={fieldErrors.reservation_min_notice_hours}
              >
                <input
                  id="owner-res-notice"
                  type="number"
                  min="0"
                  max="168"
                  disabled={!canEditBusiness}
                  value={form?.reservation_min_notice_hours ?? 2}
                  onChange={(e) => updateField('reservation_min_notice_hours', e.target.value)}
                />
              </SettingsField>

              <SettingsField
                id="owner-res-party"
                label="Max party size"
                hint="Maximum guests per reservation (1–100)."
                error={fieldErrors.reservation_max_party_size}
              >
                <input
                  id="owner-res-party"
                  type="number"
                  min="1"
                  max="100"
                  disabled={!canEditBusiness}
                  value={form?.reservation_max_party_size ?? 8}
                  onChange={(e) => updateField('reservation_max_party_size', e.target.value)}
                />
              </SettingsField>

              <SettingsField
                id="owner-res-cutoff"
                label="Cancellation cutoff (minutes)"
                hint="Minutes before booking when guest self-cancellation closes (0–1440)."
                error={fieldErrors.reservation_cancellation_cutoff_minutes}
              >
                <input
                  id="owner-res-cutoff"
                  type="number"
                  min="0"
                  max="1440"
                  disabled={!canEditBusiness}
                  value={form?.reservation_cancellation_cutoff_minutes ?? 120}
                  onChange={(e) => updateField('reservation_cancellation_cutoff_minutes', e.target.value)}
                />
              </SettingsField>

              <SettingsField
                id="owner-res-expiry"
                label="Pending request expiry (minutes)"
                hint="Minutes before unreviewed pending requests expire (15–1440)."
                error={fieldErrors.reservation_pending_expiry_minutes}
              >
                <input
                  id="owner-res-expiry"
                  type="number"
                  min="15"
                  max="1440"
                  disabled={!canEditBusiness}
                  value={form?.reservation_pending_expiry_minutes ?? 120}
                  onChange={(e) => updateField('reservation_pending_expiry_minutes', e.target.value)}
                />
              </SettingsField>

              <SettingsField
                id="owner-res-deposit-amount"
                label="Deposit amount (₱)"
                hint="Collected directly by the restaurant (required > ₱0 when deposits are enabled)."
                error={fieldErrors.reservation_deposit_amount}
              >
                <input
                  id="owner-res-deposit-amount"
                  type="number"
                  min="0"
                  max="100000"
                  step="0.01"
                  disabled={!canEditBusiness}
                  value={form?.reservation_deposit_amount ?? 0}
                  onChange={(e) => updateField('reservation_deposit_amount', e.target.value)}
                />
              </SettingsField>

              <SettingsField
                id="owner-res-service-fee"
                label="Service fee (₱)"
                hint="Optional reservation service fee settled directly with the restaurant."
                error={fieldErrors.reservation_service_fee}
              >
                <input
                  id="owner-res-service-fee"
                  type="number"
                  min="0"
                  max="100000"
                  step="0.01"
                  disabled={!canEditBusiness}
                  value={form?.reservation_service_fee ?? 0}
                  onChange={(e) => updateField('reservation_service_fee', e.target.value)}
                />
              </SettingsField>
            </div>

            <div style={{ marginTop: '12px' }}>
              <SettingsField
                id="owner-res-notes"
                label="Guest reservation instructions"
                hint="Shown to guests when booking a table (max 1000 characters)."
                error={fieldErrors.reservation_notes}
              >
                <textarea
                  id="owner-res-notes"
                  rows={3}
                  disabled={!canEditBusiness}
                  value={form?.reservation_notes || ''}
                  onChange={(e) => updateField('reservation_notes', e.target.value)}
                  placeholder="Optional arrival grace period or table holding notes"
                />
              </SettingsField>
            </div>
          </SettingsCard>
        );

      case 'payments':
        return (
          <SettingsCard
            title="Connected Payout Account"
            description="Your verified payout destination for restaurant order settlements."
          >
            {payoutAccount ? (
              <div className="salo-settings-form-grid">
                <SettingsField id="owner-payout-provider" label="Bank / E-wallet provider">
                  <input id="owner-payout-provider" type="text" readOnly value={payoutAccount.provider || '—'} />
                </SettingsField>
                <SettingsField id="owner-payout-type" label="Account type">
                  <input id="owner-payout-type" type="text" readOnly value={String(payoutAccount.account_type || '—').replace('_', ' ')} />
                </SettingsField>
                <SettingsField id="owner-payout-holder" label="Account holder">
                  <input id="owner-payout-holder" type="text" readOnly value={payoutAccount.account_holder_name || '—'} />
                </SettingsField>
                <SettingsField id="owner-payout-status" label="Verification status">
                  <div style={{ display: 'flex', alignItems: 'center', minHeight: '44px' }}>
                    <Badge variant="success" size="sm">Encrypted &amp; Protected</Badge>
                  </div>
                </SettingsField>
              </div>
            ) : (
              <p className="salo-settings-field-hint">
                No payout account record is linked yet. Contact SALO support if you need to register or update payout banking details.
              </p>
            )}
          </SettingsCard>
        );

      case 'verification':
        return (
          <>
            <SettingsCard
              title="Verified Business Identity"
              description="Sensitive business registration fields cannot be edited directly. Submit a change request for administrator review."
              actions={canEditBusiness && (
                <Button type="button" variant="primary" size="sm" onClick={() => setChangeModalOpen(true)}>
                  Request Change
                </Button>
              )}
            >
              <div className="salo-settings-form-grid">
                <SettingsField id="owner-ver-name" label="Storefront Name">
                  <input id="owner-ver-name" type="text" readOnly value={restaurant?.restaurant_name || '—'} />
                </SettingsField>
                <SettingsField id="owner-ver-legal" label="Registered Legal Name">
                  <input id="owner-ver-legal" type="text" readOnly value={restaurant?.registered_name || restaurant?.restaurant_name || '—'} />
                </SettingsField>
                <SettingsField id="owner-ver-type" label="Business Type">
                  <input id="owner-ver-type" type="text" readOnly value={String(restaurant?.business_type || '—').replace('_', ' ')} />
                </SettingsField>
                <SettingsField id="owner-ver-ownership" label="Ownership Structure">
                  <input id="owner-ver-ownership" type="text" readOnly value={String(restaurant?.ownership_structure || '—').replace('_', ' ')} />
                </SettingsField>
              </div>
            </SettingsCard>

            <SettingsCard
              title="Change Request History"
              description="Pending requests do not alter your live restaurant profile until approved by an administrator."
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
                          Fields: {Object.entries(req.payload || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'Supporting documents'}
                        </small>
                        {req.review_note && (
                          <small style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-xs)' }}>
                            Admin note: {req.review_note}
                          </small>
                        )}
                      </div>
                      {req.status === 'pending' && canEditBusiness && (
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

      case 'notifications':
        return (
          <SettingsCard title="Restaurant Notification Channels" description="Choose which operational alerts you want to receive.">
            <div className="salo-settings-toggle-list">
              <SettingsToggleRow
                id="owner-notif-orders"
                label="New order alerts"
                description="Get notified immediately when a customer places a new order."
                checked={accountSettings.notifications.newOrderAlerts}
                onChange={(checked) => {
                  setAccountSettings((prev) => ({
                    ...prev,
                    notifications: { ...prev.notifications, newOrderAlerts: checked },
                  }));
                  setDirty(true);
                }}
              />
              <SettingsToggleRow
                id="owner-notif-reservations"
                label="Reservation alerts"
                description="Receive alerts for new and upcoming table reservations."
                checked={accountSettings.notifications.reservationReminders}
                onChange={(checked) => {
                  setAccountSettings((prev) => ({
                    ...prev,
                    notifications: { ...prev.notifications, reservationReminders: checked },
                  }));
                  setDirty(true);
                }}
              />
              <SettingsToggleRow
                id="owner-notif-payouts"
                label="Payout & settlement updates"
                description="Updates when settlements are processed."
                checked={accountSettings.notifications.payoutUpdates}
                onChange={(checked) => {
                  setAccountSettings((prev) => ({
                    ...prev,
                    notifications: { ...prev.notifications, payoutUpdates: checked },
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
            <SettingsPasswordCard role="restaurant" />
            <SettingsCard title="Sign-in protection" description="Extra layers of protection for your owner account.">
              <div className="salo-settings-toggle-list">
                <SettingsToggleRow
                  id="owner-sec-2fa"
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
                  id="owner-sec-alerts"
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
    <OwnerLayout>
      <UnifiedSettingsShell
        eyebrow="Restaurant preferences"
        title="Settings"
        subtitle="Manage your restaurant channels, branding, reservations, verified identity, and security."
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

      <ImageCropModal
        open={cropState.open}
        file={cropState.file}
        title={cropState.target === 'logo' ? 'Crop Restaurant Logo (1:1)' : 'Crop Cover Photo (16:9)'}
        aspectRatio={cropState.target === 'logo' ? 1 : 16 / 9}
        outputWidth={cropState.target === 'logo' ? 600 : 1280}
        onCancel={() => setCropState({ open: false, target: 'logo', file: null })}
        onConfirm={handleConfirmCrop}
      />

      <Modal
        open={changeModalOpen}
        onClose={submittingChange ? undefined : () => setChangeModalOpen(false)}
        title="Request Verified Business Change"
        size="md"
        footer={(
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button type="button" variant="ghost" size="sm" onClick={() => setChangeModalOpen(false)} disabled={submittingChange}>
              Cancel
            </Button>
            <Button type="submit" form="owner-change-req-form" variant="primary" size="sm" loading={submittingChange}>
              Submit for Approval
            </Button>
          </div>
        )}
      >
        <form id="owner-change-req-form" onSubmit={handleSubmitChangeRequest} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <SettingsField id="cr-rest-name" label="Storefront Name">
            <input
              id="cr-rest-name"
              type="text"
              required
              value={changeForm.restaurant_name}
              onChange={(e) => setChangeForm((p) => ({ ...p, restaurant_name: e.target.value }))}
            />
          </SettingsField>
          <SettingsField id="cr-reg-name" label="Registered Legal Name (DTI / SEC)">
            <input
              id="cr-reg-name"
              type="text"
              value={changeForm.registered_name}
              onChange={(e) => setChangeForm((p) => ({ ...p, registered_name: e.target.value }))}
            />
          </SettingsField>
          <div className="salo-settings-form-grid">
            <SettingsField id="cr-btype" label="Business Type">
              <select
                id="cr-btype"
                value={changeForm.business_type}
                onChange={(e) => setChangeForm((p) => ({ ...p, business_type: e.target.value }))}
              >
                {BUSINESS_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </SettingsField>
            <SettingsField id="cr-ownership" label="Ownership Structure">
              <select
                id="cr-ownership"
                value={changeForm.ownership_structure}
                onChange={(e) => setChangeForm((p) => ({ ...p, ownership_structure: e.target.value }))}
              >
                {OWNERSHIP_STRUCTURES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </SettingsField>
          </div>
          <SettingsField id="cr-reason" label="Reason / Supporting Details">
            <textarea
              id="cr-reason"
              rows={2}
              value={changeForm.reason}
              onChange={(e) => setChangeForm((p) => ({ ...p, reason: e.target.value }))}
              placeholder="Explain why these verified details need to be updated"
            />
          </SettingsField>
          <SettingsField id="cr-docs" label="Supporting Documents (PDF, JPG, PNG — up to 5 files)">
            <input
              id="cr-docs"
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
    </OwnerLayout>
  );
}

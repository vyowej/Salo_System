import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useAuth } from '../../../hooks/useAuth';
import useAddresses from '../../../hooks/useAddresses';
import accountService from '../../../services/accountService';
import { Input, PasswordStrengthMeter } from '../../../components/forms';
import { getPasswordPolicyError } from '../../../utils/passwordPolicy';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { AccountLifecycleModals } from '../../../components/settings/AccountLifecycleModals';
import AddressFormModal from '../components/AddressFormModal';
import { formatFormalAddress } from '../../../utils/addressFormatter';
import ContactNumbersManager from '../components/ContactNumbersManager';
import './ProfilePage.css';

/* ─── Validation ─────────────────────────────────────────── */
const phonePattern = /^(\+63|0)9\d{9}$/;
const usernamePattern = /^[a-zA-Z0-9._-]+$/;
const middleInitialPattern = /^[a-zA-Z]$/;

function extractFieldError(errors, key) {
  const val = errors?.[key];
  if (Array.isArray(val)) return val[0] || '';
  return typeof val === 'string' ? val : '';
}

/* ─── Sidebar navigation config ─────────────────────────── */
const NAV_GROUPS = [
  {
    label: 'Account',
    items: [
      { id: 'personal',      icon: '👤', label: 'Personal Info' },
      { id: 'addresses',     icon: '📍', label: 'Addresses'     },
      { id: 'contacts',      icon: '📱', label: 'Contact Numbers' },
      { id: 'notifications', icon: '🔔', label: 'Notifications' },
    ],
  },
  {
    label: 'Privacy & Security',
    items: [
      { id: 'security',  icon: '🔒', label: 'Security'     },
      { id: 'danger',    icon: '⚠️', label: 'Danger Zone', variant: 'danger' },
    ],
  },
];

/* ─── Small reusable toggle switch ──────────────────────── */
function ToggleSwitch({ id, checked, onChange }) {
  return (
    <label className="toggle-switch" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={onChange} />
      <span className="toggle-switch__track" />
    </label>
  );
}

/* ─── Main page ──────────────────────────────────────────── */
export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  /* ── Personal info state ── */
  const [formData, setFormData] = useState(() => ({
    first_name:     user?.first_name     || '',
    middle_initial: user?.middle_initial || '',
    last_name:      user?.last_name      || '',
    username:       user?.username       || '',
    phone_number:   user?.phone_number   ?? user?.phone ?? '',
    date_of_birth:  user?.date_of_birth  || '',
  }));
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [profileError, setProfileError] = useState('');
  const [errors,       setErrors]       = useState({});

  useEffect(() => {
    if (!user) return;
    setFormData({
      first_name:     user.first_name     || '',
      middle_initial: user.middle_initial || '',
      last_name:      user.last_name      || '',
      username:       user.username       || '',
      phone_number:   user.phone_number   ?? user.phone ?? '',
      date_of_birth:  user.date_of_birth  || '',
    });
  }, [
    user,
    user?.first_name,
    user?.middle_initial,
    user?.last_name,
    user?.username,
    user?.phone_number,
    user?.phone,
    user?.date_of_birth,
  ]);

  /* ── Security state ── */
  const [passwords, setPasswords] = useState({ old: '', newPw: '', confirm: '' });
  const [pwErrors,  setPwErrors]  = useState({});
  const [pwError,   setPwError]   = useState('');
  const [pwSaving,  setPwSaving]  = useState(false);
  const [pwSaved,   setPwSaved]   = useState(false);
  const [twoFactor,    setTwoFactor]    = useState(false);
  const [loginAlerts,  setLoginAlerts]  = useState(true);

  /* ── Notifications state ── */
  const [notifs, setNotifs] = useState({
    orderUpdates:          true,
    promotions:            false,
    reservationReminders:  true,
    smsNotifications:      false,
  });

  /* ── Deactivate modal state ── */
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  /* ── Address modal state ── */
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const addAddressBtnRef = useRef(null);

  /* ── Active sidebar tab ── */
  const [activeTab, setActiveTab] = useState('personal');

  /* ── Addresses hook ── */
  const { addresses, addAddress } = useAddresses();

  /* ── Validation for personal info ── */
  const validateForm = () => {
    const nextErrors = {};
    const trimmedFirst = formData.first_name.trim();
    const trimmedMiddle = formData.middle_initial.trim();
    const trimmedLast = formData.last_name.trim();
    const trimmedUsername = formData.username.trim();
    const cleanedPhone = formData.phone_number.replace(/[\s\-()]+/g, '');

    if (!trimmedFirst)
      nextErrors.first_name = 'First name is required.';
    if (trimmedMiddle && !middleInitialPattern.test(trimmedMiddle))
      nextErrors.middle_initial = 'Middle initial must be a single letter.';
    if (!trimmedLast)
      nextErrors.last_name = 'Last name is required.';
    if (!trimmedUsername)
      nextErrors.username = 'Username is required.';
    else if (trimmedUsername.length < 3 || trimmedUsername.length > 50 || !usernamePattern.test(trimmedUsername))
      nextErrors.username = 'Username must be 3–50 characters using letters, numbers, dots, underscores, or hyphens.';
    if (cleanedPhone && !phonePattern.test(cleanedPhone))
      nextErrors.phone_number = 'Use a valid Philippine mobile number format (e.g. 09171234567).';
    if (formData.date_of_birth) {
      const todayStr = new Date().toISOString().split('T')[0];
      if (formData.date_of_birth >= todayStr)
        nextErrors.date_of_birth = 'Date of birth must be in the past.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handlePersonalSubmit = async (e) => {
    e.preventDefault();
    setSaved(false);
    setProfileError('');
    if (!validateForm()) return;

    setSaving(true);
    try {
      const updatedUser = await accountService.updateProfile({
        first_name:     formData.first_name.trim(),
        middle_initial: formData.middle_initial.trim() || null,
        last_name:      formData.last_name.trim(),
        username:       formData.username.trim(),
        phone_number:   formData.phone_number.trim() || null,
        date_of_birth:  formData.date_of_birth || null,
      });
      updateUser(updatedUser);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      if (err?.errors) {
        const mapped = {};
        for (const field of ['first_name', 'middle_initial', 'last_name', 'username', 'phone_number', 'date_of_birth']) {
          const msg = extractFieldError(err.errors, field);
          if (msg) mapped[field] = msg;
        }
        if (Object.keys(mapped).length > 0) setErrors(mapped);
      }
      setProfileError(err?.message || 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
  };

  /* ── Password change ── */
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPwSaved(false);
    setPwError('');

    const nextErrors = {};
    if (!passwords.old)    nextErrors.old    = 'Current password is required.';
    const pwPolicyErr = passwords.newPw
      ? getPasswordPolicyError(passwords.newPw, { username: user?.username, email: user?.email })
      : null;
    if (!passwords.newPw)  nextErrors.newPw  = 'New password is required.';
    else if (pwPolicyErr)
      nextErrors.newPw = pwPolicyErr;
    if (passwords.newPw !== passwords.confirm)
      nextErrors.confirm = 'Passwords do not match.';
    setPwErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setPwSaving(true);
    try {
      await accountService.updatePassword({
        current_password:      passwords.old,
        password:              passwords.newPw,
        password_confirmation: passwords.confirm,
      });
      setPwSaved(true);
      setPasswords({ old: '', newPw: '', confirm: '' });
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err) {
      if (err?.errors) {
        const mapped = {};
        const curMsg = extractFieldError(err.errors, 'current_password');
        const pwMsg = extractFieldError(err.errors, 'password');
        const confMsg = extractFieldError(err.errors, 'password_confirmation');
        if (curMsg) mapped.old = curMsg;
        if (pwMsg) mapped.newPw = pwMsg;
        if (confMsg) mapped.confirm = confMsg;
        if (Object.keys(mapped).length > 0) setPwErrors(mapped);
      }
      setPwError(err?.message || 'Unable to update password.');
    } finally {
      setPwSaving(false);
    }
  };

  /* ── Notification toggle helper ── */
  const toggleNotif = (key) =>
    setNotifs((prev) => ({ ...prev, [key]: !prev[key] }));

  /* ── Avatar initials ── */
  const initials = (user?.name || 'CS').substring(0, 2).toUpperCase();

  /* ════════════════════════════════════════════════════════
     Section renderers
  ═════════════════════════════════════════════════════════ */

  /* Personal Info */
  const renderPersonal = () => (
    <div className="profile-section-card">
      <div className="profile-section-header">
        <div className="profile-section-header__text">
          <p className="profile-section-header__label">Account</p>
          <h2 className="profile-section-header__title">Personal Information</h2>
          <p className="profile-section-header__subtitle">
            Update your personal details, username, and phone number.
          </p>
        </div>
        <Button variant="primary" size="sm" loading={saving} onClick={handlePersonalSubmit}>
          Save Changes
        </Button>
      </div>

      {profileError && (
        <div className="profile-alert profile-alert--error" role="alert">
          {profileError}
        </div>
      )}

      {saved && (
        <div className="profile-alert profile-alert--success" role="status">
          ✓ Your profile has been updated successfully.
        </div>
      )}

      <form onSubmit={handlePersonalSubmit} noValidate>
        <div className="profile-section-body">
          {/* First name */}
          <div className="profile-field-row">
            <div className="profile-field-row__label">
              <span className="profile-field-row__label-text">First Name</span>
              <span className="profile-field-row__label-hint">
                Your given name.
              </span>
            </div>
            <div className="profile-field-row__control">
              <Input
                id="first_name"
                type="text"
                placeholder="e.g. Juan"
                value={formData.first_name}
                onChange={(e) => setFormData((f) => ({ ...f, first_name: e.target.value }))}
                error={errors.first_name}
              />
            </div>
          </div>

          <div className="profile-field-divider" />

          {/* Middle initial */}
          <div className="profile-field-row">
            <div className="profile-field-row__label">
              <span className="profile-field-row__label-text">Middle Initial</span>
              <span className="profile-field-row__label-hint">
                Optional single letter.
              </span>
            </div>
            <div className="profile-field-row__control">
              <Input
                id="middle_initial"
                type="text"
                maxLength={1}
                placeholder="e.g. D"
                value={formData.middle_initial}
                onChange={(e) => setFormData((f) => ({ ...f, middle_initial: e.target.value }))}
                error={errors.middle_initial}
              />
            </div>
          </div>

          <div className="profile-field-divider" />

          {/* Last name */}
          <div className="profile-field-row">
            <div className="profile-field-row__label">
              <span className="profile-field-row__label-text">Last Name</span>
              <span className="profile-field-row__label-hint">
                Your family name.
              </span>
            </div>
            <div className="profile-field-row__control">
              <Input
                id="last_name"
                type="text"
                placeholder="e.g. dela Cruz"
                value={formData.last_name}
                onChange={(e) => setFormData((f) => ({ ...f, last_name: e.target.value }))}
                error={errors.last_name}
              />
            </div>
          </div>

          <div className="profile-field-divider" />

          {/* Username */}
          <div className="profile-field-row">
            <div className="profile-field-row__label">
              <span className="profile-field-row__label-text">Username</span>
              <span className="profile-field-row__label-hint">
                Your unique handle on Salo.
              </span>
            </div>
            <div className="profile-field-row__control">
              <Input
                id="username"
                type="text"
                placeholder="e.g. juandc"
                value={formData.username}
                onChange={(e) => setFormData((f) => ({ ...f, username: e.target.value }))}
                error={errors.username}
              />
            </div>
          </div>

          <div className="profile-field-divider" />

          {/* Email */}
          <div className="profile-field-row">
            <div className="profile-field-row__label">
              <span className="profile-field-row__label-text">Email Address</span>
              <span className="profile-field-row__label-hint">
                Email changes are managed separately.
              </span>
            </div>
            <div className="profile-field-row__control">
              <Input
                id="email"
                type="email"
                value={user?.email || ''}
                readOnly
              />
            </div>
          </div>

          <div className="profile-field-divider" />

          {/* Phone */}
          <div className="profile-field-row">
            <div className="profile-field-row__label">
              <span className="profile-field-row__label-text">Phone Number</span>
              <span className="profile-field-row__label-hint">
                PH format: +63 or 09xxxxxxxxx
              </span>
            </div>
            <div className="profile-field-row__control">
              <Input
                id="phone_number"
                type="tel"
                placeholder="e.g. 09171234567"
                value={formData.phone_number}
                onChange={(e) => setFormData((f) => ({ ...f, phone_number: e.target.value }))}
                error={errors.phone_number}
              />
            </div>
          </div>

          <div className="profile-field-divider" />

          {/* Date of birth */}
          <div className="profile-field-row">
            <div className="profile-field-row__label">
              <span className="profile-field-row__label-text">Date of Birth</span>
              <span className="profile-field-row__label-hint">
                Optional.
              </span>
            </div>
            <div className="profile-field-row__control">
              <Input
                id="date_of_birth"
                type="date"
                value={formData.date_of_birth}
                onChange={(e) => setFormData((f) => ({ ...f, date_of_birth: e.target.value }))}
                error={errors.date_of_birth}
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  );

  /* Security */
  const renderSecurity = () => (
    <>
      {/* Change Password */}
      <div className="profile-section-card">
        <div className="profile-section-header">
          <div className="profile-section-header__text">
            <p className="profile-section-header__label">Security</p>
            <h2 className="profile-section-header__title">Change Password</h2>
            <p className="profile-section-header__subtitle">
              Choose a strong password you don't use elsewhere.
            </p>
          </div>
        </div>

        {pwError && (
          <div className="profile-alert profile-alert--error" role="alert">
            {pwError}
          </div>
        )}

        {pwSaved && (
          <div className="profile-alert profile-alert--success" role="status">
            ✓ Password changed successfully.
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} noValidate>
          <div className="profile-section-body">
            <div className="profile-field-row">
              <div className="profile-field-row__label">
                <span className="profile-field-row__label-text">Current Password</span>
              </div>
              <div className="profile-field-row__control">
                <Input
                  id="pw-old"
                  type="password"
                  placeholder="Enter current password"
                  value={passwords.old}
                  onChange={(e) => setPasswords((p) => ({ ...p, old: e.target.value }))}
                  error={pwErrors.old}
                />
              </div>
            </div>

            <div className="profile-field-divider" />

            <div className="profile-field-row">
              <div className="profile-field-row__label">
                <span className="profile-field-row__label-text">New Password</span>
                <span className="profile-field-row__label-hint">Minimum 8 characters.</span>
              </div>
              <div className="profile-field-row__control">
                <Input
                  id="pw-new"
                  type="password"
                  placeholder="New password"
                  value={passwords.newPw}
                  onChange={(e) => setPasswords((p) => ({ ...p, newPw: e.target.value }))}
                  error={pwErrors.newPw}
                />
                <PasswordStrengthMeter
                  password={passwords.newPw}
                  username={user?.username}
                  email={user?.email}
                />
              </div>
            </div>

            <div className="profile-field-divider" />

            <div className="profile-field-row">
              <div className="profile-field-row__label">
                <span className="profile-field-row__label-text">Confirm Password</span>
              </div>
              <div className="profile-field-row__control">
                <Input
                  id="pw-confirm"
                  type="password"
                  placeholder="Confirm new password"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
                  error={pwErrors.confirm}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" variant="primary" size="sm" loading={pwSaving}>
                Update Password
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* 2FA & Login Alerts */}
      <div className="profile-section-card">
        <div className="profile-section-header">
          <div className="profile-section-header__text">
            <p className="profile-section-header__label">Security</p>
            <h2 className="profile-section-header__title">Advanced Security</h2>
            <p className="profile-section-header__subtitle">
              Extra layers of protection for your account.
            </p>
          </div>
        </div>

        <div className="profile-section-body">
          <div className="profile-toggle-row">
            <div className="profile-toggle-info">
              <span className="profile-toggle-label">Two-Factor Authentication</span>
              <span className="profile-toggle-desc">
                Require a code from your phone when signing in.{' '}
                <span className="profile-placeholder-badge">Coming soon</span>
              </span>
            </div>
            <ToggleSwitch
              id="toggle-2fa"
              checked={twoFactor}
              onChange={() => setTwoFactor((v) => !v)}
            />
          </div>

          <div className="profile-toggle-row">
            <div className="profile-toggle-info">
              <span className="profile-toggle-label">Login Alerts</span>
              <span className="profile-toggle-desc">
                Receive an email when a new device signs in to your account.
              </span>
            </div>
            <ToggleSwitch
              id="toggle-login-alerts"
              checked={loginAlerts}
              onChange={() => setLoginAlerts((v) => !v)}
            />
          </div>
        </div>
      </div>
    </>
  );

  /* Notifications */
  const renderNotifications = () => (
    <div className="profile-section-card">
      <div className="profile-section-header">
        <div className="profile-section-header__text">
          <p className="profile-section-header__label">Preferences</p>
          <h2 className="profile-section-header__title">Notifications</h2>
          <p className="profile-section-header__subtitle">
            Choose what updates you want to hear about.
          </p>
        </div>
      </div>

      <div className="profile-section-body">
        <div className="profile-toggle-row">
          <div className="profile-toggle-info">
            <span className="profile-toggle-label">Order Updates</span>
            <span className="profile-toggle-desc">
              Get notified when your order status changes.
            </span>
          </div>
          <ToggleSwitch
            id="notif-orders"
            checked={notifs.orderUpdates}
            onChange={() => toggleNotif('orderUpdates')}
          />
        </div>

        <div className="profile-toggle-row">
          <div className="profile-toggle-info">
            <span className="profile-toggle-label">Promotions &amp; Deals</span>
            <span className="profile-toggle-desc">
              Exclusive offers, discounts, and seasonal promos.
            </span>
          </div>
          <ToggleSwitch
            id="notif-promos"
            checked={notifs.promotions}
            onChange={() => toggleNotif('promotions')}
          />
        </div>

        <div className="profile-toggle-row">
          <div className="profile-toggle-info">
            <span className="profile-toggle-label">Reservation Reminders</span>
            <span className="profile-toggle-desc">
              Reminders before your upcoming table reservations.
            </span>
          </div>
          <ToggleSwitch
            id="notif-reservations"
            checked={notifs.reservationReminders}
            onChange={() => toggleNotif('reservationReminders')}
          />
        </div>

        <div className="profile-toggle-row">
          <div className="profile-toggle-info">
            <span className="profile-toggle-label">SMS Notifications</span>
            <span className="profile-toggle-desc">
              Receive key updates via text message to your registered number.
            </span>
          </div>
          <ToggleSwitch
            id="notif-sms"
            checked={notifs.smsNotifications}
            onChange={() => toggleNotif('smsNotifications')}
          />
        </div>
      </div>
    </div>
  );

  /* Addresses */
  const renderAddresses = () => (
    <div className="profile-section-card">
      <div className="profile-section-header">
        <div className="profile-section-header__text">
          <p className="profile-section-header__label">Account</p>
          <h2 className="profile-section-header__title">Saved Addresses</h2>
          <p className="profile-section-header__subtitle">
            Manage your delivery and billing addresses.
          </p>
        </div>
      </div>

      <div className="profile-section-body">
        {addresses.length === 0 ? (
          <div className="profile-address-empty">
            <p className="profile-address-empty__text">No saved addresses yet.</p>
            <Button
              ref={addAddressBtnRef}
              variant="primary"
              size="sm"
              onClick={() => setAddressModalOpen(true)}
            >
              Add Your First Address
            </Button>
          </div>
        ) : (
          <>
            <div className="profile-address-grid">
              {addresses.map((address) => (
                <div key={address.id} className="profile-address-card">
                  <div className="profile-address-card__header">
                    <span className="profile-address-card__label">{address.label}</span>
                    {address.isDefault && (
                      <Badge variant="success" size="sm">Default</Badge>
                    )}
                  </div>
                  <p className="profile-address-card__body">
                    {formatFormalAddress(address)}
                  </p>
                  {address.notes && (
                    <p className="profile-address-card__meta">
                      Landmark: {address.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="profile-address-actions">
              <Button
                ref={addAddressBtnRef}
                variant="primary"
                size="sm"
                onClick={() => setAddressModalOpen(true)}
              >
                Add Address
              </Button>
              <button
                type="button"
                className="profile-address-link"
                onClick={() => navigate('/addresses')}
              >
                Manage all addresses →
              </button>
            </div>
          </>
        )}
      </div>

      <AddressFormModal
        isOpen={addressModalOpen}
        onClose={() => setAddressModalOpen(false)}
        onSave={addAddress}
        existingAddresses={addresses}
        triggerRef={addAddressBtnRef}
      />
    </div>
  );

  /* Contact Numbers */
  const renderContacts = () => (
    <div className="profile-section-card">
      <div className="profile-section-header">
        <div className="profile-section-header__text">
          <p className="profile-section-header__label">Account</p>
          <h2 className="profile-section-header__title">Saved Contact Numbers</h2>
          <p className="profile-section-header__subtitle">
            Manage your personal, work, and alternate mobile numbers for deliveries.
          </p>
        </div>
      </div>

      <div className="profile-section-body">
        <ContactNumbersManager />
      </div>
    </div>
  );

  /* Danger Zone */
  const renderDanger = () => (
    <div className="profile-section-card profile-section-card--danger">
      <div className="profile-section-header">
        <div className="profile-section-header__text">
          <p className="profile-section-header__label profile-section-header__label--danger">
            Danger Zone
          </p>
          <h2 className="profile-section-header__title">Deactivate Account</h2>
          <p className="profile-section-header__subtitle">
            Deactivating your account will disable access to your saved addresses,
            favorites, and order history. This action cannot be undone from the app.
          </p>
        </div>
        <Button variant="danger" size="sm" onClick={() => setDeactivateOpen(true)}>
          Deactivate
        </Button>
      </div>
    </div>
  );

  /* ─── Tab content map ───────────────────────────────────── */
  const renderContent = () => {
    switch (activeTab) {
      case 'personal':      return renderPersonal();
      case 'security':      return renderSecurity();
      case 'notifications': return renderNotifications();
      case 'addresses':     return renderAddresses();
      case 'contacts':      return renderContacts();
      case 'danger':        return renderDanger();
      default:              return renderPersonal();
    }
  };

  /* ════════════════════════════════════════════════════════
     Render
  ═════════════════════════════════════════════════════════ */
  return (
    <CustomerLayout>
      <AccountLifecycleModals
        deactivateOpen={deactivateOpen}
        onCloseDeactivate={() => setDeactivateOpen(false)}
        deleteOpen={false}
        onCloseDelete={() => {}}
      />

      <div className="profile-page">
        {/* ── Left sidebar ── */}
        <nav className="profile-sidebar" aria-label="Profile settings navigation">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="profile-sidebar__group">
              <p className="profile-sidebar__heading">{group.label}</p>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={[
                    'profile-sidebar__item',
                    activeTab === item.id ? 'is-active' : '',
                    item.variant === 'danger' ? 'is-danger' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setActiveTab(item.id)}
                  aria-current={activeTab === item.id ? 'page' : undefined}
                >
                  <span className="profile-sidebar__item-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              ))}
              {gi < NAV_GROUPS.length - 1 && (
                <div className="profile-sidebar__divider" />
              )}
            </div>
          ))}
        </nav>

        {/* ── Right content ── */}
        <main className="profile-content">
          {/* User hero */}
          <div className="profile-hero">
            <div className="profile-hero__avatar" aria-hidden="true">
              {initials}
            </div>
            <div className="profile-hero__meta">
              <div className="profile-hero__name-row">
                <h1 className="profile-hero__name">{user?.name || 'Customer'}</h1>
                <Badge variant="primary" size="sm">Customer</Badge>
              </div>
              <p className="profile-hero__sub">
                @{user?.username || 'user'} · Member since 2026
              </p>
            </div>
          </div>

          {/* Active section */}
          {renderContent()}
        </main>
      </div>
    </CustomerLayout>
  );
}

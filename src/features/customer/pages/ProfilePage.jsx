import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useAuth } from '../../../hooks/useAuth';
import useAddresses from '../../../hooks/useAddresses';
import { Input } from '../../../components/forms';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import AddressFormModal from '../components/AddressFormModal';
import './ProfilePage.css';

/* ─── Validation ─────────────────────────────────────────── */
const phonePattern = /^(\+63|0)\d{10,11}$/;

/* ─── Sidebar navigation config ─────────────────────────── */
const NAV_GROUPS = [
  {
    label: 'Account',
    items: [
      { id: 'personal',      icon: '👤', label: 'Personal Info' },
      { id: 'addresses',     icon: '📍', label: 'Addresses'     },
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
  const [formData, setFormData] = useState({
    name:     user?.name     || '',
    username: user?.username || '',
    email:    user?.email    || '',
    phone:    user?.phone    || '',
  });
  const [saved,  setSaved]  = useState(false);
  const [errors, setErrors] = useState({});

  /* ── Security state ── */
  const [passwords, setPasswords] = useState({ old: '', newPw: '', confirm: '' });
  const [pwErrors,  setPwErrors]  = useState({});
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
    if (!formData.name.trim())
      nextErrors.name = 'Full name is required.';
    if (!formData.username.trim())
      nextErrors.username = 'Username is required.';
    if (!formData.email.trim())
      nextErrors.email = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      nextErrors.email = 'Please enter a valid email address.';
    if (formData.phone && !phonePattern.test(formData.phone.replace(/\s+/g, '')))
      nextErrors.phone = 'Use a valid Philippine mobile number format.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handlePersonalSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    updateUser(formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  /* ── Password change (placeholder validation) ── */
  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!passwords.old)    nextErrors.old    = 'Current password is required.';
    if (!passwords.newPw)  nextErrors.newPw  = 'New password is required.';
    else if (passwords.newPw.length < 8)
      nextErrors.newPw = 'Password must be at least 8 characters.';
    if (passwords.newPw !== passwords.confirm)
      nextErrors.confirm = 'Passwords do not match.';
    setPwErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    // Real implementation would call an API here
    setPwSaved(true);
    setPasswords({ old: '', newPw: '', confirm: '' });
    setTimeout(() => setPwSaved(false), 3000);
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
            Update your name, username, email, and phone number.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handlePersonalSubmit}>
          Save Changes
        </Button>
      </div>

      {saved && (
        <div className="profile-alert profile-alert--success">
          ✓ Your profile has been updated successfully.
        </div>
      )}

      <form onSubmit={handlePersonalSubmit} noValidate>
        <div className="profile-section-body">
          {/* Full name */}
          <div className="profile-field-row">
            <div className="profile-field-row__label">
              <span className="profile-field-row__label-text">Full Name</span>
              <span className="profile-field-row__label-hint">
                Your display name across the platform.
              </span>
            </div>
            <div className="profile-field-row__control">
              <Input
                id="name"
                type="text"
                placeholder="e.g. Juan dela Cruz"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                error={errors.name}
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
                Used for order receipts and login.
              </span>
            </div>
            <div className="profile-field-row__control">
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                error={errors.email}
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
                id="phone"
                type="tel"
                placeholder="e.g. 09171234567"
                value={formData.phone}
                onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                error={errors.phone}
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

        {pwSaved && (
          <div className="profile-alert profile-alert--success">
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
              <Button type="submit" variant="primary" size="sm">
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
                    {[
                      address.street,
                      address.barangay && `Brgy. ${address.barangay}`,
                      address.city,
                      address.province,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  <p className="profile-address-card__meta">
                    {address.recipientName}
                    {(address.mobileNumber || address.phone) &&
                      ` · ${address.mobileNumber || address.phone}`}
                    {address.notes && ` · Landmark: ${address.notes}`}
                  </p>
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
      case 'danger':        return renderDanger();
      default:              return renderPersonal();
    }
  };

  /* ════════════════════════════════════════════════════════
     Render
  ═════════════════════════════════════════════════════════ */
  return (
    <CustomerLayout>
      {/* Deactivate confirmation modal */}
      <Modal
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        title="Deactivate account"
        size="sm"
        footer={
          <div className="profile-modal-footer">
            <Button variant="ghost" size="sm" onClick={() => setDeactivateOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={() => setDeactivateOpen(false)}>
              Confirm Deactivation
            </Button>
          </div>
        }
      >
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
          Deactivating your account will disable access to your saved addresses, favorites,
          and order history. This action is not yet available in the current frontend build.
        </p>
      </Modal>

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

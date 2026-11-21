import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../common/Button';
import Badge from '../common/Badge';
import ThemeToggle from '../navigation/ThemeToggle';
import SwitchAccountModal from '../navigation/SwitchAccountModal';
import { useAuth } from '../../hooks/useAuth';
import accountService from '../../services/accountService';
import { PARTNER_PROMO_CARDS, ROLE_META } from '../../config/navigationConfig';
import { SETTINGS_LABELS } from '../../config/settingsConfig';
import {
  APPLICATION_STATUS_META,
  resolveUserWorkspaces,
} from '../../config/workspaceConfig';

export function SettingsCard({ title, description, actions, children }) {
  return (
    <section className="salo-settings-card">
      {(title || description || actions) && (
        <div className="salo-settings-card-head">
          <div>
            {title && <h3 className="salo-settings-card-title">{title}</h3>}
            {description && <p className="salo-settings-card-desc">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function SettingsToggleRow({ id, label, description, checked, onChange, disabled = false }) {
  return (
    <label className="salo-settings-toggle-row" htmlFor={id}>
      <span className="salo-settings-toggle-copy">
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <span className="salo-settings-toggle-control">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(checked)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="salo-settings-toggle-track" aria-hidden="true" />
      </span>
    </label>
  );
}

export function SettingsField({ id, label, hint, error, children }) {
  return (
    <label className="salo-settings-field" htmlFor={id}>
      <span className="salo-settings-field-label">{label}</span>
      {children}
      {hint && <p className="salo-settings-field-hint">{hint}</p>}
      {error && <p className="salo-settings-field-error" role="alert">{error}</p>}
    </label>
  );
}

export function SettingsDangerZone({
  title,
  description,
  actionLabel,
  onAction,
  disabled = false,
  secondaryActionLabel,
  onSecondaryAction,
}) {
  return (
    <section className="salo-settings-danger-card" aria-label={SETTINGS_LABELS.dangerZoneTitle}>
      <div>
        <p className="salo-settings-danger-eyebrow">{SETTINGS_LABELS.dangerZoneTitle}</p>
        <h3 className="salo-settings-danger-title">{title}</h3>
        {description && <p className="salo-settings-danger-desc">{description}</p>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <Button type="button" variant="danger" size="sm" onClick={onAction} disabled={disabled}>
          {actionLabel}
        </Button>
        {secondaryActionLabel && onSecondaryAction && (
          <Button type="button" variant="danger-outline" size="sm" onClick={onSecondaryAction} disabled={disabled}>
            {secondaryActionLabel}
          </Button>
        )}
      </div>
    </section>
  );
}

export function BecomePartnerSettingsCards({ currentRole, user }) {
  const [applications, setApplications] = useState({
    restaurant_application: null,
    rider_application: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentRole === 'admin' || !user) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    accountService
      .getApplications()
      .then((data) => {
        if (!cancelled) {
          setApplications(data);
        }
      })
      .catch(() => {
        // Keep empty cards if request fails
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentRole, user]);

  if (currentRole === 'admin') return null;

  const workspaces = resolveUserWorkspaces(currentRole, user?.roles);
  const heldRoles = new Set(workspaces.map((item) => item.id));

  const cards = [
    !heldRoles.has('restaurant') && {
      config: PARTNER_PROMO_CARDS.restaurant,
      application: applications.restaurant_application,
    },
    !heldRoles.has('rider') && {
      config: PARTNER_PROMO_CARDS.rider,
      application: applications.rider_application,
    },
  ].filter(Boolean);

  if (cards.length === 0) return null;

  return (
    <SettingsCard
      title="Grow with SALO"
      description="Explore partner and delivery opportunities linked to your SALO account."
    >
      <div className="salo-partner-promo-grid">
        {cards.map(({ config, application }) => {
          const statusKey = application?.status;
          const statusMeta = statusKey ? (APPLICATION_STATUS_META[statusKey] || { label: statusKey, tone: 'neutral' }) : null;
          const isApproved = statusKey === 'approved';

          return (
            <article className="salo-partner-promo-card" key={config.id}>
              <div>
                <h4>{config.title}</h4>
                <p>{config.description}</p>
                {application?.reviewer_note && (
                  <p className="salo-settings-field-hint" style={{ marginTop: '6px' }}>
                    Reviewer note: {application.reviewer_note}
                  </p>
                )}
              </div>

              <div className="salo-partner-promo-actions">
                {loading ? (
                  <span className="salo-settings-field-hint">Checking status...</span>
                ) : application ? (
                  <>
                    <Badge variant={statusMeta.tone} size="sm">{statusMeta.label}</Badge>
                    {isApproved ? (
                      <Link to={config.approvedHref} className="salo-partner-status-link">
                        {config.approvedCtaLabel} →
                      </Link>
                    ) : (
                      <Link to={config.statusHref} className="salo-partner-status-link">
                        View application →
                      </Link>
                    )}
                  </>
                ) : (
                  <Link to={config.applyHref} className="salo-partner-status-link">
                    {config.ctaLabel} →
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </SettingsCard>
  );
}

export function SettingsPasswordCard({ role = 'account' }) {
  const [passwords, setPasswords] = useState({
    current_password: '',
    password: '',
    password_confirmation: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('');

    if (!passwords.current_password || !passwords.password) {
      setError('Please enter your current and new password.');
      return;
    }
    if (passwords.password.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (passwords.password !== passwords.password_confirmation) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSaving(true);
    try {
      await accountService.updatePassword(passwords);
      setPasswords({
        current_password: '',
        password: '',
        password_confirmation: '',
      });
      setStatus('Password updated successfully.');
    } catch (err) {
      setError(err?.message || 'Unable to update password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard
      title="Change password"
      description="Use at least 8 characters and a password you have not used recently."
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="salo-settings-form-grid">
          <SettingsField id={`${role}-pw-current`} label="Current password">
            <input
              id={`${role}-pw-current`}
              type="password"
              autoComplete="current-password"
              value={passwords.current_password}
              onChange={(event) => {
                setPasswords((prev) => ({ ...prev, current_password: event.target.value }));
                setError('');
                setStatus('');
              }}
            />
          </SettingsField>

          <SettingsField id={`${role}-pw-next`} label="New password">
            <input
              id={`${role}-pw-next`}
              type="password"
              autoComplete="new-password"
              value={passwords.password}
              onChange={(event) => {
                setPasswords((prev) => ({ ...prev, password: event.target.value }));
                setError('');
                setStatus('');
              }}
            />
          </SettingsField>

          <SettingsField id={`${role}-pw-confirm`} label="Confirm new password">
            <input
              id={`${role}-pw-confirm`}
              type="password"
              autoComplete="new-password"
              value={passwords.password_confirmation}
              onChange={(event) => {
                setPasswords((prev) => ({ ...prev, password_confirmation: event.target.value }));
                setError('');
                setStatus('');
              }}
            />
          </SettingsField>
        </div>

        {error && <p className="salo-settings-field-error" role="alert">{error}</p>}
        {status && <p className="salo-settings-notice" role="status">{status}</p>}

        <div>
          <Button type="submit" variant="primary" size="sm" loading={saving}>
            Update password
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}

export function SettingsAccountSection({
  role,
  user,
  profileName,
  profileEmail,
  profileInitials,
  profileAvatar,
  emailValue,
  onNavigateToSecurity,
  dangerZone,
}) {
  const { user: authUser, updateUser } = useAuth();
  const activeUser = user || authUser;
  const [switchOpen, setSwitchOpen] = useState(false);
  const [profileForm, setProfileForm] = useState(() => ({
    username: activeUser?.username || '',
    first_name: activeUser?.first_name || '',
    middle_initial: activeUser?.middle_initial || '',
    last_name: activeUser?.last_name || '',
    phone_number: activeUser?.phone_number || '',
    date_of_birth: activeUser?.date_of_birth || '',
  }));
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileStatus, setProfileStatus] = useState('');

  useEffect(() => {
    if (!activeUser) return;
    setProfileForm({
      username: activeUser.username || '',
      first_name: activeUser.first_name || '',
      middle_initial: activeUser.middle_initial || '',
      last_name: activeUser.last_name || '',
      phone_number: activeUser.phone_number || '',
      date_of_birth: activeUser.date_of_birth || '',
    });
  }, [
    activeUser?.username,
    activeUser?.first_name,
    activeUser?.middle_initial,
    activeUser?.last_name,
    activeUser?.phone_number,
    activeUser?.date_of_birth,
    activeUser,
  ]);

  const roleMeta = ROLE_META[role] || ROLE_META.customer;

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setProfileError('');
    setProfileStatus('');
    setProfileSaving(true);

    try {
      const updatedUser = await accountService.updateProfile(profileForm);
      updateUser?.(updatedUser);
      setProfileStatus('Profile updated.');
    } catch (err) {
      setProfileError(err?.message || 'Unable to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <>
      <SettingsCard title="Profile summary" description="Your active workspace identity on SALO.">
        <div className="salo-account-summary">
          <div className="salo-account-identity">
            <span className="salo-account-avatar" aria-hidden="true">
              {profileAvatar ? <img src={profileAvatar} alt="" /> : profileInitials}
            </span>
            <div className="salo-account-meta">
              <div className="salo-account-name-row">
                <strong>{profileName}</strong>
                <Badge variant="primary" size="sm">{roleMeta.label}</Badge>
              </div>
              <span className="salo-account-email">{profileEmail}</span>
            </div>
          </div>

          <Button type="button" variant="outline" size="sm" onClick={() => setSwitchOpen(true)}>
            {SETTINGS_LABELS.switchAccountButton}
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard title="Account profile" description="Update your personal details and contact number.">
        <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="salo-settings-form-grid">
            <SettingsField id={`settings-username-${role}`} label="Username">
              <input
                id={`settings-username-${role}`}
                type="text"
                value={profileForm.username}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, username: event.target.value }))}
                required
              />
            </SettingsField>

            <SettingsField id={`settings-first-name-${role}`} label="First name">
              <input
                id={`settings-first-name-${role}`}
                type="text"
                value={profileForm.first_name}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, first_name: event.target.value }))}
                required
              />
            </SettingsField>

            <SettingsField id={`settings-middle-initial-${role}`} label="Middle initial">
              <input
                id={`settings-middle-initial-${role}`}
                type="text"
                maxLength={1}
                value={profileForm.middle_initial}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, middle_initial: event.target.value }))}
              />
            </SettingsField>

            <SettingsField id={`settings-last-name-${role}`} label="Last name">
              <input
                id={`settings-last-name-${role}`}
                type="text"
                value={profileForm.last_name}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, last_name: event.target.value }))}
                required
              />
            </SettingsField>

            <SettingsField id={`settings-phone-${role}`} label="Phone number">
              <input
                id={`settings-phone-${role}`}
                type="tel"
                value={profileForm.phone_number}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, phone_number: event.target.value }))}
                placeholder="e.g. +63 917 123 4567"
              />
            </SettingsField>

            <SettingsField id={`settings-dob-${role}`} label="Date of birth">
              <input
                id={`settings-dob-${role}`}
                type="date"
                value={profileForm.date_of_birth}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, date_of_birth: event.target.value }))}
              />
            </SettingsField>
          </div>

          {profileError && <p className="salo-settings-field-error" role="alert">{profileError}</p>}
          {profileStatus && <p className="salo-settings-notice" role="status">{profileStatus}</p>}

          <div>
            <Button type="submit" variant="primary" size="sm" loading={profileSaving}>
              Save profile
            </Button>
          </div>
        </form>
      </SettingsCard>

      <SettingsCard title="Email & sign-in" description="Manage your account email and password access.">
        <div className="salo-settings-form-grid">
          <SettingsField id={`settings-email-${role}`} label="Email address" hint="Email changes are managed separately.">
            <input
              id={`settings-email-${role}`}
              type="email"
              value={emailValue ?? profileEmail}
              readOnly
            />
          </SettingsField>

          <SettingsField id={`settings-password-${role}`} label="Password">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                ••••••••••••
              </span>
              {onNavigateToSecurity && (
                <Button type="button" variant="outline" size="sm" onClick={onNavigateToSecurity}>
                  Manage in Security
                </Button>
              )}
            </div>
          </SettingsField>
        </div>
      </SettingsCard>

      <BecomePartnerSettingsCards currentRole={role} user={activeUser} />

      {dangerZone && (
        <SettingsDangerZone {...dangerZone} />
      )}

      <SwitchAccountModal
        open={switchOpen}
        onClose={() => setSwitchOpen(false)}
        currentRole={role}
      />
    </>
  );
}

export function SettingsPreferencesSection() {
  return (
    <SettingsCard
      title="Appearance"
      description="Switch between light and dark mode for your SALO workspace."
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <strong style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
            Color theme
          </strong>
          <small style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
            Applies immediately across this browser.
          </small>
        </div>
        <ThemeToggle />
      </div>
    </SettingsCard>
  );
}

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../../layouts/AuthLayout';
import { Input, PasswordField, PasswordStrengthMeter } from '../../../components/forms';
import Button from '../../../components/common/Button';
import { getPasswordPolicyError } from '../../../utils/passwordPolicy';
import { validateUsernameFormat } from '../../../utils/usernamePolicy';
import authService from '../../../services/authService';
import { useAuth } from '../../../hooks/useAuth';
import { sanitizeMiddleInitial } from '../utils/registerFieldUtils';
import './RegisterPage.css';

export default function RegisterPage({ embedded = false, onSwitch }) {
  const navigate = useNavigate();
  const { register, loading } = useAuth();

  const [formData, setFormData] = useState({
    firstName: '',
    middleInitial: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
    passwordConfirmation: '',
    agreeTerms: false,
  });

  const [passwordResetKey, setPasswordResetKey] = useState(0);
  const [error, setError] = useState(null);
  const [usernameStatus, setUsernameStatus] = useState({ status: 'idle', message: '' });

  useEffect(() => {
    const trimmed = formData.username.trim();
    if (!trimmed) {
      setUsernameStatus({ status: 'idle', message: '' });
      return undefined;
    }
    const fmt = validateUsernameFormat(trimmed);
    if (!fmt.valid) {
      setUsernameStatus({ status: 'invalid', message: fmt.message });
      return undefined;
    }

    let active = true;
    setUsernameStatus({ status: 'checking', message: 'Checking availability...' });
    const timer = setTimeout(async () => {
      try {
        const res = await authService.checkUsernameAvailable(trimmed);
        if (!active) return;
        setUsernameStatus({
          status: res.available ? 'available' : 'taken',
          message: res.message,
        });
      } catch {
        if (active) setUsernameStatus({ status: 'idle', message: '' });
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [formData.username]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name === 'middleInitial') {
      const cleaned = sanitizeMiddleInitial(value);
      setFormData((prev) => ({
        ...prev,
        middleInitial: cleaned,
      }));
      if (error) setError(null);
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (error) setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPasswordResetKey((prev) => prev + 1);
    setError(null);

    // Validation
    if (!formData.firstName.trim()) {
      setError('Please provide your first name.');
      return;
    }
    if (!formData.lastName.trim()) {
      setError('Please provide your last name.');
      return;
    }
    const usernameFmt = validateUsernameFormat(formData.username);
    if (!usernameFmt.valid) {
      setError(usernameFmt.message);
      return;
    }
    if (usernameStatus.status === 'taken') {
      setError(usernameStatus.message || 'This username is already taken.');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    const pwPolicyErr = getPasswordPolicyError(formData.password, {
      username: formData.username,
      email: formData.email,
    });
    if (pwPolicyErr) {
      setError(pwPolicyErr);
      return;
    }
    if (formData.password !== formData.passwordConfirmation) {
      setError('Password confirmation does not match.');
      return;
    }
    if (!formData.agreeTerms) {
      setError('You must agree to the Terms of Service and Privacy Policy to register.');
      return;
    }

    const normalizedMiddleInitial = sanitizeMiddleInitial(formData.middleInitial);

    try {
      await register({
        first_name: formData.firstName.trim(),
        middle_initial: normalizedMiddleInitial ? normalizedMiddleInitial : null,
        last_name: formData.lastName.trim(),
        username: formData.username.trim(),
        email: formData.email.trim(),
        password: formData.password,
        password_confirmation: formData.passwordConfirmation,
      });

      navigate('/customer', { replace: true, state: { newlyRegistered: true } });
    } catch (err) {
      setError(err?.message || 'Registration failed. Please check your information and try again.');
    }
  };

  const content = (
    <>
      <div className="auth-header">
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">Join SALO to order food, reserve tables, and gather with family</p>
      </div>

      {error && (
        <div className="auth-error-banner" role="alert" style={{ marginBottom: 'var(--space-3)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {/* Row 1 — First Name | M.I. (optional) | Last Name */}
        <div className="register-name-row">
          <Input
            id="register-firstname"
            name="firstName"
            label="First Name"
            placeholder="e.g. Cassidy"
            value={formData.firstName}
            onChange={handleChange}
            required
            autoComplete="given-name"
          />

          <div className="register-mi-col">
            <Input
              id="register-middle-initial"
              name="middleInitial"
              label={(
                <>
                  M.I. <span className="form-label-optional">(optional)</span>
                </>
              )}
              placeholder="e.g. D"
              value={formData.middleInitial}
              onChange={handleChange}
              maxLength={2}
              inputMode="text"
              autoComplete="additional-name"
              className="register-mi-input"
            />
          </div>

          <Input
            id="register-lastname"
            name="lastName"
            label="Last Name"
            placeholder="e.g. Santos"
            value={formData.lastName}
            onChange={handleChange}
            required
            autoComplete="family-name"
          />
        </div>

        {/* Row 2 — Email */}
        <Input
          id="register-email"
          name="email"
          type="email"
          label="Email Address"
          placeholder="e.g. cassidy@example.com"
          value={formData.email}
          onChange={handleChange}
          required
          autoComplete="email"
        />

        {/* Row 3 — Username */}
        <div className="register-username-field">
          <Input
            id="register-username"
            name="username"
            label="Username"
            placeholder="e.g. cassidys"
            value={formData.username}
            onChange={handleChange}
            required
            autoComplete="username"
          />
          <p className="register-field-hint">
            3–30 characters: letters, numbers, and underscores only (no spaces).
          </p>
          {usernameStatus.status !== 'idle' && (
            <p
              role="status"
              style={{
                margin: '4px 0 0',
                fontSize: 12,
                color:
                  usernameStatus.status === 'available'
                    ? '#16a34a'
                    : usernameStatus.status === 'checking'
                    ? 'var(--text-muted)'
                    : '#dc2626',
              }}
            >
              {usernameStatus.message}
            </p>
          )}
        </div>

        {/* Row 4 — Passwords (independent per-field eye toggles) */}
        <div className="grid-cols-2 register-password-row" style={{ gap: 'var(--space-3)' }}>
          <PasswordField
            id="register-password"
            name="password"
            label="Password"
            placeholder="Min. 8 characters"
            value={formData.password}
            onChange={handleChange}
            required
            autoComplete="new-password"
            resetKey={passwordResetKey}
          />

          <PasswordField
            id="register-confirm"
            name="passwordConfirmation"
            label="Confirm Password"
            placeholder="Repeat password"
            value={formData.passwordConfirmation}
            onChange={handleChange}
            required
            autoComplete="new-password"
            resetKey={passwordResetKey}
          />
        </div>

        <PasswordStrengthMeter
          password={formData.password}
          username={formData.username}
          email={formData.email}
        />

        <label className="checkbox-group" style={{ fontSize: 'var(--font-size-xs)', alignItems: 'flex-start', marginTop: 'var(--space-1)' }}>
          <input
            type="checkbox"
            name="agreeTerms"
            checked={formData.agreeTerms}
            onChange={handleChange}
            style={{ marginTop: 2 }}
          />
          <span style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            I agree to the{' '}
            <a href="#terms" className="auth-link">Terms of Service</a>{' '}
            and{' '}
            <a href="#privacy" className="auth-link">Privacy Policy</a> (RA 10173).
          </span>
        </label>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={loading}
          style={{ marginTop: 'var(--space-2)' }}
        >
          Create Account
        </Button>
      </form>

      <div className="auth-footer-prompt">
        Already have an account?{' '}
        {embedded ? (
          <button type="button" className="auth-link" onClick={onSwitch} style={{ fontWeight: 'var(--font-weight-semibold)' }}>
            Sign in
          </button>
        ) : (
          <Link to="/login" className="auth-link" style={{ fontWeight: 'var(--font-weight-semibold)' }}>
            Sign in
          </Link>
        )}
      </div>
    </>
  );

  if (embedded) return content;

  return (
    <AuthLayout
      headline="Good food tastes better together."
      subheading="Order from multiple kitchens, reserve tables, and gather over great meals."
      imageSrc="/images/auth/login-food.png"
      imageAlt="Traditional Filipino Feast"
      badgeText="Create Your Account"
    >
      {content}
    </AuthLayout>
  );
}

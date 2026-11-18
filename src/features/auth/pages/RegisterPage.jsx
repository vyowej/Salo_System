import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../../layouts/AuthLayout';
import { Input, PasswordField } from '../../../components/forms';
import Button from '../../../components/common/Button';
import { useAuth } from '../../../hooks/useAuth';
import { sanitizeMiddleInitial, toUsernameSlug } from '../utils/registerFieldUtils';
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
  // Track whether the user has manually customised the username field
  const isUsernameCustomized = useRef(false);

  // Auto-generate username from first + last name ONLY (never includes middle initial)
  useEffect(() => {
    if (isUsernameCustomized.current) return;
    const slug = toUsernameSlug(formData.firstName + formData.lastName);
    setFormData((prev) => ({ ...prev, username: slug }));
  }, [formData.firstName, formData.lastName]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name === 'username') {
      // Once the user touches the username field, stop auto-generating
      isUsernameCustomized.current = true;
    }

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
    if (!formData.username.trim() || formData.username.length < 3) {
      setError('Username must be at least 3 characters long.');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!formData.password || formData.password.length < 8) {
      setError('Password must be at least 8 characters long.');
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
            Your unique handle on SALO — auto-suggested from your name, or customize it.
          </p>
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

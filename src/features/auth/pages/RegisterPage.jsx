import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../../layouts/AuthLayout';
import { Input } from '../../../components/forms';
import Button from '../../../components/common/Button';
import { useAuth } from '../../../hooks/useAuth';
import './RegisterPage.css';

export default function RegisterPage({ embedded = false, onSwitch }) {
  const navigate = useNavigate();
  const { register, loading } = useAuth();

  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    passwordConfirmation: '',
    agreeTerms: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (error) setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.fullName.trim()) {
      setError('Please provide your full name.');
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

    try {
      await register({
        fullName: formData.fullName,
        username: formData.username,
        email: formData.email,
        password: formData.password,
        role: 'customer', // Default regular SALO user account
      });

      // Redirect to onboarding welcome
      navigate('/', { replace: true, state: { newlyRegistered: true } });
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
        <div className="grid-cols-2" style={{ gap: 'var(--space-3)' }}>
          <Input
            id="register-fullname"
            name="fullName"
            label="Full Name"
            placeholder="e.g. Cassidy Santos"
            value={formData.fullName}
            onChange={handleChange}
            required
            autoComplete="name"
          />

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
        </div>

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

        <div className="grid-cols-2" style={{ gap: 'var(--space-3)' }}>
          <Input
            id="register-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            label="Password"
            placeholder="Min. 8 characters"
            value={formData.password}
            onChange={handleChange}
            required
            autoComplete="new-password"
          />

          <Input
            id="register-confirm"
            name="passwordConfirmation"
            type={showPassword ? 'text' : 'password'}
            label="Confirm Password"
            placeholder="Repeat password"
            value={formData.passwordConfirmation}
            onChange={handleChange}
            required
            autoComplete="new-password"
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-4px' }}>
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {showPassword ? 'Hide passwords' : 'Show passwords'}
          </button>
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
      headline="Kain tayo!"
      subheading="Good food, good company, great memories."
      imageSrc="/images/auth/login-food.png"
      imageAlt="Traditional Filipino Feast"
      badgeText="Create Your Account"
    >
      {content}
    </AuthLayout>
  );
}

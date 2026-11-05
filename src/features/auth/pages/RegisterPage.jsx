import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../../layouts/AuthLayout';
import { Input } from '../../../components/forms';
import Button from '../../../components/common/Button';
import { useAuth } from '../../../hooks/useAuth';
import './RegisterPage.css';

const ROLES = [
  {
    id: 'customer',
    name: 'Customer',
    icon: '🍽️',
    desc: 'Order food & reserve tables',
  },
  {
    id: 'owner',
    name: 'Restaurant',
    icon: '🏪',
    desc: 'Sell food & manage bookings',
  },
  {
    id: 'rider',
    name: 'Rider',
    icon: '🛵',
    desc: 'Deliver & earn flexibly',
  },
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, loading } = useAuth();

  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    passwordConfirmation: '',
    role: 'customer',
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

  const handleRoleSelect = (roleId) => {
    setFormData((prev) => ({ ...prev, role: roleId }));
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
        role: formData.role,
      });

      // Redirect to onboarding welcome or dashboard
      navigate('/', { replace: true, state: { newlyRegistered: true } });
    } catch (err) {
      setError(err?.message || 'Registration failed. Please check your information and try again.');
    }
  };

  return (
    <AuthLayout maxWidth={500}>
      <div className="auth-header">
        <span className="fiesta-pill" style={{ marginBottom: 8 }}>🎉 Salo-Salo Tayo</span>
        <h1 className="auth-title">Sumali sa SALO</h1>
        <p className="auth-subtitle">Gumawa ng account para mag-order, magpareserba, o maging partner</p>
      </div>

      {error && (
        <div className="auth-error-banner" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Role Picker */}
      <div style={{ marginBottom: 'var(--space-2)' }}>
        <label className="form-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
          I want to register as
        </label>
        <div className="role-selector" role="radiogroup" aria-label="Select role">
          {ROLES.map((r) => (
            <div
              key={r.id}
              className={`role-card ${formData.role === r.id ? 'selected' : ''}`}
              onClick={() => handleRoleSelect(r.id)}
              role="radio"
              aria-checked={formData.role === r.id}
              tabIndex={0}
              onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && handleRoleSelect(r.id)}
            >
              <span className="role-icon">{r.icon}</span>
              <span className="role-name">{r.name}</span>
              <span className="role-desc">{r.desc}</span>
            </div>
          ))}
        </div>
      </div>

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

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-6px' }}>
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

        <label className="checkbox-group" style={{ fontSize: 'var(--font-size-xs)', alignItems: 'flex-start' }}>
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
          Create {ROLES.find(r => r.id === formData.role)?.name} Account
        </Button>
      </form>

      <div className="auth-footer-prompt">
        May account ka na?{' '}
        <Link to="/login" className="auth-link" style={{ fontWeight: 'var(--font-weight-semibold)' }}>
          Mag-sign in dito
        </Link>
      </div>
    </AuthLayout>
  );
}

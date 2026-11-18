import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import AuthLayout from '../../../layouts/AuthLayout';
import { Input, PasswordField } from '../../../components/forms';
import Button from '../../../components/common/Button';
import { useAuth } from '../../../hooks/useAuth';
import { getDefaultWorkspace, getWorkspaceHomePath } from '../../../services/authService';
import './LoginPage.css';

export default function LoginPage({ embedded = false, onSwitch }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loading } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [passwordResetKey, setPasswordResetKey] = useState(0);
  const [error, setError] = useState(null);

  const getDestination = (resUser) => {
    if (location.state?.from?.pathname) {
      const { pathname, search = '', hash = '' } = location.state.from;
      return `${pathname}${search}${hash}`;
    }
    const workspace = resUser?.role || getDefaultWorkspace(resUser?.roles);
    return getWorkspaceHomePath(workspace);
  };

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
    setPasswordResetKey((prev) => prev + 1);
    setError(null);

    if (!formData.email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!formData.password) {
      setError('Please enter your password.');
      return;
    }

    try {
      const result = await login({
        email: formData.email.trim(),
        password: formData.password,
      });
      navigate(getDestination(result?.user), { replace: true });
    } catch (err) {
      setError(err?.message || 'Invalid email or password. Please try again.');
    }
  };

  const content = (
    <>
      <div className="auth-header">
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to your SALO account</p>
      </div>

      {error && (
        <div className="auth-error-banner" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Input
          id="login-email"
          name="email"
          type="email"
          label="Email Address"
          placeholder="e.g. maria@salo.ph"
          value={formData.email}
          onChange={handleChange}
          required
          autoComplete="email"
        />

        <PasswordField
          id="login-password"
          name="password"
          label="Password"
          placeholder="Enter your password"
          value={formData.password}
          onChange={handleChange}
          required
          autoComplete="current-password"
          resetKey={passwordResetKey}
        />

        <div className="auth-row-between" style={{ justifyContent: 'flex-end' }}>
          <Link to="/forgot-password" className="auth-link">
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={loading}
          style={{ marginTop: 'var(--space-2)' }}
        >
          Sign In
        </Button>
      </form>

      <div className="auth-footer-prompt">
        Don&apos;t have an account?{' '}
        {embedded ? (
          <button type="button" className="auth-link" onClick={onSwitch} style={{ fontWeight: 'var(--font-weight-semibold)' }}>
            Sign up
          </button>
        ) : (
          <Link to="/register" className="auth-link" style={{ fontWeight: 'var(--font-weight-semibold)' }}>
            Sign up
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
      imageAlt="Authentic Filipino Feast"
      badgeText="Order. Reserve. Gather."
    >
      {content}
    </AuthLayout>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import AuthLayout from '../../../layouts/AuthLayout';
import { Input } from '../../../components/forms';
import Button from '../../../components/common/Button';
import { useAuth } from '../../../hooks/useAuth';
import './LoginPage.css';

export default function LoginPage({ embedded = false, onSwitch }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loading } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDemo, setSelectedDemo] = useState('');

  const getDestination = (resUser) => {
    if (location.state?.from?.pathname) return location.state.from.pathname;
    if (resUser?.role === 'customer') return '/customer';
    if (resUser?.role === 'owner') return '/owner';
    if (resUser?.role === 'rider') return '/rider';
    if (resUser?.role === 'admin') return '/admin';
    return '/';
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
    setError(null);

    if (!formData.email.trim()) {
      setError('Please enter your email or username.');
      return;
    }
    if (!formData.password) {
      setError('Please enter your password.');
      return;
    }

    try {
      const result = await login(formData);
      navigate(getDestination(result?.user), { replace: true });
    } catch (err) {
      setError(err?.message || 'Invalid email or password. Please try again.');
    }
  };

  const handleQuickLogin = (event) => {
    const email = event.target.value;
    setSelectedDemo(email);
    if (!email) return;

    setFormData({
      email,
      password: 'password123',
      rememberMe: true,
    });
    setError(null);
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
          type="text"
          label="Email or Username"
          placeholder="e.g. maria@salo.ph"
          value={formData.email}
          onChange={handleChange}
          required
          autoComplete="username"
          autoFocus
        />

        <div>
          <Input
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            label="Password"
            placeholder="Enter your password"
            value={formData.password}
            onChange={handleChange}
            required
            autoComplete="current-password"
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            }
          />
        </div>

        <div className="auth-row-between">
          <label className="checkbox-group" style={{ fontSize: 'var(--font-size-xs)' }}>
            <input
              type="checkbox"
              name="rememberMe"
              checked={formData.rememberMe}
              onChange={handleChange}
            />
            <span style={{ color: 'var(--text-secondary)' }}>Remember this device</span>
          </label>

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

      <div className="demo-account-picker">
        <label htmlFor="demo-account">Demo account</label>
        <select id="demo-account" value={selectedDemo} onChange={handleQuickLogin}>
          <option value="">Choose an account to fill sign-in fields</option>
          <option value="customer@salo.ph">Customer — customer@salo.ph</option>
          <option value="owner@salo.ph">Restaurant Owner — owner@salo.ph</option>
          <option value="rider@salo.ph">Rider — rider@salo.ph</option>
          <option value="admin@salo.ph">Admin — admin@salo.ph</option>
        </select>
      </div>

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
      headline="Kain tayo!"
      subheading="Good food, good company, great memories."
      imageSrc="/images/auth/login-food.png"
      imageAlt="Authentic Filipino Feast"
      badgeText="Order. Reserve. Gather."
    >
      {content}
    </AuthLayout>
  );
}

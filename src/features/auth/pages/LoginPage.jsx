import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import AuthLayout from '../../../layouts/AuthLayout';
import { Input } from '../../../components/forms';
import Button from '../../../components/common/Button';
import { useAuth } from '../../../hooks/useAuth';
import './LoginPage.css';

export default function LoginPage() {
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

  const getDestination = (resUser) => {
    if (location.state?.from?.pathname) return location.state.from.pathname;
    if (resUser?.role === 'customer') return '/customer';
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

  const handleQuickLogin = (email, password = 'password123') => {
    setFormData({
      email,
      password,
      rememberMe: true,
    });
    setError(null);
  };

  return (
    <AuthLayout maxWidth={440}>
      <div className="auth-header">
        <span className="fiesta-pill" style={{ marginBottom: 8 }}>🇵🇭 Maligayang Pagbabalik</span>
        <h1 className="auth-title">Tara, kain tayo!</h1>
        <p className="auth-subtitle">Sign in sa iyong SALO account</p>
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

      {/* Demo helper */}
      <div className="demo-accounts-card">
        <div className="demo-accounts-title">
          <span>Demo Role Switcher</span>
          <span style={{ fontSize: 10, color: 'var(--accent)' }}>One-click fill</span>
        </div>
        <div className="demo-account-pills">
          <button
            type="button"
            className="demo-pill-btn"
            onClick={() => handleQuickLogin('customer@salo.ph')}
          >
            <span className="demo-pill-role">Customer</span>
            <span className="demo-pill-email">customer@salo.ph</span>
          </button>
          <button
            type="button"
            className="demo-pill-btn"
            onClick={() => handleQuickLogin('owner@salo.ph')}
          >
            <span className="demo-pill-role">Restaurant Owner</span>
            <span className="demo-pill-email">owner@salo.ph</span>
          </button>
          <button
            type="button"
            className="demo-pill-btn"
            onClick={() => handleQuickLogin('rider@salo.ph')}
          >
            <span className="demo-pill-role">Rider</span>
            <span className="demo-pill-email">rider@salo.ph</span>
          </button>
          <button
            type="button"
            className="demo-pill-btn"
            onClick={() => handleQuickLogin('admin@salo.ph')}
          >
            <span className="demo-pill-role">Admin</span>
            <span className="demo-pill-email">admin@salo.ph</span>
          </button>
        </div>
      </div>

      <div className="auth-footer-prompt">
        Wala ka pang account?{' '}
        <Link to="/register" className="auth-link" style={{ fontWeight: 'var(--font-weight-semibold)' }}>
          Mag-register dito
        </Link>
      </div>
    </AuthLayout>
  );
}

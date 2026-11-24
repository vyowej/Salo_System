import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import AuthLayout from '../../../layouts/AuthLayout';
import { Input, PasswordField } from '../../../components/forms';
import Button from '../../../components/common/Button';
import { useAuth } from '../../../hooks/useAuth';
import accountService from '../../../services/accountService';
import authService, { getDefaultWorkspace, getWorkspaceHomePath } from '../../../services/authService';
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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [reactivationStatus, setReactivationStatus] = useState('');
  const [reactivating, setReactivating] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const googleError = params.get('google_error');
    if (googleError) {
      setError(googleError);
    }
  }, [location.search]);

  const getDestination = (resUser) => {
    const workspace = resUser?.role || getDefaultWorkspace(resUser?.roles);
    if (location.state?.from?.pathname) {
      const { pathname, search = '', hash = '' } = location.state.from;
      if (workspace !== 'admin' || pathname.startsWith('/admin')) {
        return `${pathname}${search}${hash}`;
      }
    }
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
      setError('Please enter your email address or username.');
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
      setError(err?.message || 'Invalid credentials. Please try again.');
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading || loading) return;
    setError(null);
    setGoogleLoading(true);
    try {
      const url = await authService.getGoogleAuthUrl();
      if (!url) {
        setError('Google Sign-In is currently unavailable.');
        return;
      }
      window.location.assign(url);
    } catch (err) {
      setError(err?.message || 'Unable to start Google Sign-In.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const content = (
    <>
      <div className="auth-header">
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to your SALO account</p>
      </div>

      {error && (
        <div className="auth-error-banner" role="alert" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
          {String(error).toLowerCase().includes('not active') && formData.email && formData.password && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={reactivating}
              onClick={async () => {
                setReactivating(true);
                setReactivationStatus('');
                try {
                  await accountService.requestReactivation({
                    email: formData.email.trim(),
                    password: formData.password,
                    reason: 'User requested reactivation from login screen.',
                  });
                  setReactivationStatus('Reactivation request submitted for administrator approval.');
                } catch (reqErr) {
                  setReactivationStatus(reqErr?.message || 'Unable to submit reactivation request.');
                } finally {
                  setReactivating(false);
                }
              }}
            >
              Request Account Reactivation
            </Button>
          )}
          {reactivationStatus && (
            <span style={{ fontSize: 'var(--font-size-xs)' }}>{reactivationStatus}</span>
          )}
        </div>
      )}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Input
          id="login-email"
          name="email"
          type="text"
          label="Email Address or Username"
          placeholder="e.g. maria@salo.ph or maria_salo"
          value={formData.email}
          onChange={handleChange}
          required
          autoComplete="username"
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

      <div className="auth-divider" role="separator" aria-label="or">
        <span>or</span>
      </div>

      <button
        type="button"
        className="auth-google-btn"
        onClick={handleGoogleSignIn}
        disabled={googleLoading || loading}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
          <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
        </svg>
        <span>{googleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
      </button>

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

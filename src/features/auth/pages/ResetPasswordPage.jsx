import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../../../layouts/AuthLayout';
import { Input } from '../../../components/forms';
import Button from '../../../components/common/Button';
import authService from '../../../services/authService';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || 'demo_token';

  const [formData, setFormData] = useState({
    email: searchParams.get('email') || '',
    password: '',
    passwordConfirmation: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.email.trim()) {
      setError('Please provide your account email.');
      return;
    }
    if (!formData.password || formData.password.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (formData.password !== formData.passwordConfirmation) {
      setError('Password confirmation does not match.');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword({
        token,
        email: formData.email,
        password: formData.password,
        password_confirmation: formData.passwordConfirmation,
      });
      setSuccess(true);
    } catch (err) {
      setError(err?.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout maxWidth={440}>
      <div className="auth-header">
        <h1 className="auth-title">Set new password</h1>
        <p className="auth-subtitle">
          Your new password must be at least 8 characters long
        </p>
      </div>

      {success ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--status-success-bg)',
            color: 'var(--status-success-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto var(--space-4)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
            Password updated
          </h3>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 'var(--space-6)' }}>
            Your password has been changed successfully. You can now sign in with your new credentials.
          </p>

          <Button
            variant="primary"
            fullWidth
            size="lg"
            onClick={() => navigate('/login')}
          >
            Sign In Now
          </Button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
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

          <Input
            id="reset-email"
            name="email"
            type="email"
            label="Email Address"
            placeholder="you@example.com"
            value={formData.email}
            onChange={handleChange}
            required
            autoComplete="email"
          />

          <Input
            id="reset-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            label="New Password"
            placeholder="Min. 8 characters"
            value={formData.password}
            onChange={handleChange}
            required
            autoComplete="new-password"
          />

          <Input
            id="reset-confirm"
            name="passwordConfirmation"
            type={showPassword ? 'text' : 'password'}
            label="Confirm New Password"
            placeholder="Repeat new password"
            value={formData.passwordConfirmation}
            onChange={handleChange}
            required
            autoComplete="new-password"
          />

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

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            style={{ marginTop: 'var(--space-2)' }}
          >
            Update Password
          </Button>

          <div className="auth-footer-prompt" style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)' }}>
            <Link to="/login" className="auth-link" style={{ fontWeight: 'var(--font-weight-semibold)' }}>
              Back to sign in
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}

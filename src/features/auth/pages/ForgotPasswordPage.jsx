import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../../../layouts/AuthLayout';
import { Input } from '../../../components/forms';
import Button from '../../../components/common/Button';
import authService from '../../../services/authService';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      await authService.requestPasswordReset(email);
      setSubmitted(true);
    } catch (err) {
      setError(err?.message || 'Could not process request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout maxWidth={440}>
      <div className="auth-header">
        <h1 className="auth-title">Reset your password</h1>
        <p className="auth-subtitle">
          Enter your email and we&apos;ll send you instructions to regain access
        </p>
      </div>

      {submitted ? (
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
            Check your inbox
          </h3>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 'var(--space-6)' }}>
            If an account exists for <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>, you will receive password reset instructions shortly.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <Link to="/reset-password?demo=true" style={{ textDecoration: 'none' }}>
              <Button variant="outline" fullWidth size="md">
                Simulate Reset Link (Dev)
              </Button>
            </Link>
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <Button variant="ghost" fullWidth size="md">
                Return to Sign In
              </Button>
            </Link>
          </div>
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
            id="forgot-email"
            type="email"
            label="Email Address"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            required
            autoFocus
            helper="We will send a password reset link to this address."
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            style={{ marginTop: 'var(--space-2)' }}
          >
            Send Reset Instructions
          </Button>

          <div className="auth-footer-prompt" style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)' }}>
            Remember your password?{' '}
            <Link to="/login" className="auth-link" style={{ fontWeight: 'var(--font-weight-semibold)' }}>
              Sign in
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../../layouts/AuthLayout';
import { Input } from '../../../components/forms';
import Button from '../../../components/common/Button';
import authService from '../../../services/authService';
import { useAuth } from '../../../hooks/useAuth';
import { validateUsernameFormat } from '../../../utils/usernamePolicy';

export default function GoogleCompletePage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [pending, setPending] = useState(null);
  const [loadingPending, setLoadingPending] = useState(true);
  const [username, setUsername] = useState('');
  const [availability, setAvailability] = useState({ status: 'idle', message: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    authService.getGooglePendingSignup()
      .then((data) => {
        if (active) setPending(data);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Google sign-up session expired. Please sign in with Google again.');
      })
      .finally(() => {
        if (active) setLoadingPending(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setAvailability({ status: 'idle', message: '' });
      return undefined;
    }
    const fmt = validateUsernameFormat(trimmed);
    if (!fmt.valid) {
      setAvailability({ status: 'invalid', message: fmt.message });
      return undefined;
    }

    let active = true;
    setAvailability({ status: 'checking', message: 'Checking availability...' });
    const timer = setTimeout(async () => {
      try {
        const res = await authService.checkUsernameAvailable(trimmed);
        if (!active) return;
        setAvailability({
          status: res.available ? 'available' : 'taken',
          message: res.message,
        });
      } catch {
        if (active) setAvailability({ status: 'idle', message: '' });
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [username]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const fmt = validateUsernameFormat(username);
    if (!fmt.valid) {
      setError(fmt.message);
      return;
    }
    if (availability.status === 'taken') {
      setError(availability.message || 'This username is already taken.');
      return;
    }

    setSubmitting(true);
    try {
      await authService.completeGoogleSignup(username.trim());
      await refreshUser();
      navigate('/customer', { replace: true, state: { newlyRegistered: true } });
    } catch (err) {
      const msg = err?.errors?.username?.[0] || err?.message || 'Unable to complete sign-up.';
      setError(msg);
      if (msg.toLowerCase().includes('taken')) {
        setAvailability({ status: 'taken', message: msg });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth-header">
        <h1 className="auth-title">Choose your username</h1>
        <p className="auth-subtitle">
          {pending?.email
            ? `Finish creating your SALO account for ${pending.email}`
            : 'Enter a unique username to complete your Google sign-up'}
        </p>
      </div>

      {error && (
        <div className="auth-error-banner" role="alert">
          <span>{error}</span>
        </div>
      )}

      {loadingPending ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>Loading Google account details...</p>
      ) : !pending ? (
        <div style={{ marginTop: 16 }}>
          <Link to="/login" className="auth-link">Back to Sign In</Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <Input
            id="google-username"
            name="username"
            label="Username"
            placeholder="e.g. juan_delacruz"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (error) setError('');
            }}
            required
            autoComplete="username"
            helper="3–30 characters: letters, numbers, and underscores only (no spaces)."
          />

          {availability.status !== 'idle' && (
            <p
              role="status"
              style={{
                margin: '-4px 0 8px',
                fontSize: 12,
                color:
                  availability.status === 'available'
                    ? '#16a34a'
                    : availability.status === 'checking'
                    ? 'var(--text-muted)'
                    : '#dc2626',
              }}
            >
              {availability.message}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={submitting}
            disabled={submitting || availability.status === 'taken' || availability.status === 'invalid'}
          >
            {submitting ? 'Creating Account...' : 'Complete Sign-Up'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

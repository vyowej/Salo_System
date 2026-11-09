import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Button from '../../../components/common/Button';
import useAdminSession from '../contexts/useAdminSession';
import './AdminPages.css';

const DEMO_CODE = '123456';

export default function AdminMfaPage() {
  const { verifyMfa } = useAdminSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(30);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  function submit(event) {
    event.preventDefault();
    if (code !== DEMO_CODE) {
      setError('That code is not valid. Enter the six-digit demo code shown below.');
      return;
    }
    verifyMfa();
    const destination = location.state?.from;
    navigate(destination ? `${destination.pathname}${destination.search || ''}${destination.hash || ''}` : '/admin', { replace: true });
  }

  function resend() {
    if (seconds > 0) return;
    setSeconds(30);
    setMessage('A new demo verification code is ready.');
  }

  return (
    <main className="admin-mfa-card">
      <p className="admin-page-header__eyebrow">Administrator security</p>
      <h1 className="page-title">Verify it’s you</h1>
      <p>Enter the six-digit demo verification code to continue to the Admin Side.</p>
      <div className="admin-shell-note" role="note">Demo code: <strong>{DEMO_CODE}</strong>. This is a presentation-only MFA screen.</div>
      {error && <p className="admin-security-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <form onSubmit={submit}>
        <label htmlFor="admin-mfa-code">6-digit verification code</label>
        <input id="admin-mfa-code" value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
        <Button type="submit" size="lg" fullWidth disabled={code.length !== 6}>Verify and continue</Button>
      </form>
      <div className="admin-mfa-resend">
        <span>{seconds > 0 ? `Resend available in ${seconds}s` : 'Didn’t receive a code?'}</span>
        <Button variant="ghost" disabled={seconds > 0} onClick={resend}>Resend code</Button>
      </div>
    </main>
  );
}

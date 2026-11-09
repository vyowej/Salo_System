import { useState, useEffect, useRef } from 'react';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { Input } from '../../../components/forms';

const COUNTDOWN_INITIAL_SECONDS = 60;

export default function EmailVerificationStep({
  targetEmail,
  verificationState = {},
  onVerifySuccess,
  onEmailChange,
}) {
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [secondsRemaining, setSecondsRemaining] = useState(COUNTDOWN_INITIAL_SECONDS);
  const [canResend, setCanResend] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'error' | 'success' | 'info', text: string }
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [tempEmail, setTempEmail] = useState(targetEmail || '');

  const inputRefs = useRef([]);

  // Timer countdown
  useEffect(() => {
    if (secondsRemaining <= 0) {
      setCanResend(true);
      return;
    }
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsRemaining]);

  // Keep tempEmail in sync if targetEmail updates
  useEffect(() => {
    setTempEmail(targetEmail || '');
  }, [targetEmail]);

  // Auto focus first input on mount
  useEffect(() => {
    if (!verificationState.isVerified && inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, [verificationState.isVerified]);

  const handleDigitChange = (index, value) => {
    const cleanVal = value.replace(/\D/g, '').slice(-1);
    const updated = [...otpDigits];
    updated[index] = cleanVal;
    setOtpDigits(updated);
    setStatusMessage(null);

    // Auto advance to next box
    if (cleanVal && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const updated = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      updated[i] = pasted[i] || '';
    }
    setOtpDigits(updated);
    if (pasted.length === 6) {
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerify = () => {
    const fullCode = otpDigits.join('');
    if (fullCode.length < 6) {
      setStatusMessage({
        type: 'error',
        text: 'Please enter all 6 digits of the verification code.',
      });
      return;
    }

    setVerifying(true);
    setStatusMessage(null);

    setTimeout(() => {
      setVerifying(false);

      // Simulation branches
      if (fullCode === '000000') {
        setStatusMessage({
          type: 'error',
          text: 'Invalid verification code. Please check and try again or request a new code.',
        });
        return;
      }

      if (fullCode === '999999') {
        setStatusMessage({
          type: 'error',
          text: 'Verification code has expired. Please click "Resend Code" below.',
        });
        return;
      }

      // Default: Success!
      setStatusMessage({
        type: 'success',
        text: 'Email verified successfully! You may now proceed to final application review.',
      });

      onVerifySuccess?.({
        isVerified: true,
        verifiedEmail: targetEmail,
        verifiedAt: new Date().toISOString(),
      });
    }, 600);
  };

  const handleResend = () => {
    if (!canResend) return;

    setResending(true);
    setStatusMessage(null);

    setTimeout(() => {
      setResending(false);
      setSecondsRemaining(COUNTDOWN_INITIAL_SECONDS);
      setCanResend(false);
      setOtpDigits(['', '', '', '', '', '']);
      setStatusMessage({
        type: 'info',
        text: `Mock demonstration: A new 6-digit code was simulated for ${targetEmail}.`,
      });
      inputRefs.current[0]?.focus();
    }, 500);
  };

  const handleSaveChangedEmail = (e) => {
    e.preventDefault();
    if (!tempEmail || !tempEmail.includes('@')) {
      alert('Please enter a valid email address.');
      return;
    }
    onEmailChange?.(tempEmail);
    setIsEditingEmail(false);
    setSecondsRemaining(COUNTDOWN_INITIAL_SECONDS);
    setCanResend(false);
    setOtpDigits(['', '', '', '', '', '']);
    setStatusMessage({
      type: 'info',
      text: `Updated target email to ${tempEmail}. New mock code ready.`,
    });
  };

  return (
    <div className="wizard-step-container">
      <div className="wizard-step-header">
        <h2 className="wizard-step-heading">Applicant Email Verification</h2>
        <p className="wizard-step-subheading">
          Verify your email address to authenticate this application and receive official merchant notification updates.
        </p>
      </div>

      <div className="wizard-email-verify-card">
        {/* Mock Demonstration Banner */}
        <div className="wizard-mock-pill-alert" role="status">
          <span className="pill-alert-icon" aria-hidden="true">💡</span>
          <div className="pill-alert-copy">
            <strong>Frontend Prototype Mode:</strong> No actual email is dispatched.
            Use <strong>123456</strong> (or any 6 digits) to simulate successful verification.
            (Code <em>000000</em> tests invalid error; <em>999999</em> tests expired error).
          </div>
        </div>

        {/* Current Email Target */}
        <div className="verify-target-row">
          <span className="verify-target-label">Verification code sent to:</span>
          {isEditingEmail ? (
            <form onSubmit={handleSaveChangedEmail} className="verify-edit-form">
              <Input
                id="edit-target-email"
                type="email"
                value={tempEmail}
                onChange={(e) => setTempEmail(e.target.value)}
                placeholder="Enter new email"
                className="input-sm"
                required
              />
              <Button type="submit" variant="primary" size="sm">
                Save
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditingEmail(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <div className="verify-email-display">
              <strong className="verify-email-address">{targetEmail || 'applicant@example.com'}</strong>
              <button
                type="button"
                className="btn-change-email"
                onClick={() => setIsEditingEmail(true)}
              >
                Change Email
              </button>
            </div>
          )}
        </div>

        {/* Verified State or OTP Input */}
        {verificationState.isVerified ? (
          <div className="verify-success-box" role="status">
            <div className="success-icon-badge" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="success-heading">Email Address Verified!</h3>
            <p className="success-text">
              Your email <strong>{verificationState.verifiedEmail || targetEmail}</strong> is verified.
              All steps are now ready for your final review.
            </p>
            <Badge variant="success" size="md">
              ✓ Verified on {verificationState.verifiedAt ? new Date(verificationState.verifiedAt).toLocaleDateString() : 'Submission'}
            </Badge>
          </div>
        ) : (
          <div className="otp-input-section">
            <label className="otp-input-label" htmlFor="otp-box-0">
              Enter 6-Digit Verification Code
            </label>

            <div className="otp-boxes-row" onPaste={handlePaste}>
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  id={`otp-box-${idx}`}
                  ref={(el) => (inputRefs.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  className={`otp-digit-box ${digit ? 'filled' : ''}`}
                  autoComplete="off"
                  aria-label={`Digit ${idx + 1}`}
                />
              ))}
            </div>

            {statusMessage && (
              <div className={`otp-status-banner ${statusMessage.type}`} role="alert">
                <span>{statusMessage.text}</span>
              </div>
            )}

            <div className="otp-action-buttons">
              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={handleVerify}
                loading={verifying}
                disabled={otpDigits.join('').length < 6}
              >
                Verify Code
              </Button>

              <div className="resend-countdown-row">
                {canResend ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResend}
                    loading={resending}
                  >
                    Resend Code
                  </Button>
                ) : (
                  <span className="countdown-text">
                    Resend code in <strong>{secondsRemaining}s</strong>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

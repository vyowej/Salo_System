import { useState, useEffect, useRef } from 'react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { Input } from '../forms';
import otpService from '../../services/otpService';
import './EmailVerificationStep.css';

const COUNTDOWN_INITIAL_SECONDS = 60;

/**
 * Shared Step 1 Email Verification Component for Restaurant Partner and Rider Applications.
 * Requests a single email address (either existing SALO account email or an alternative email)
 * and verifies it via OTP before allowing progression.
 */
export default function EmailVerificationStep({
  data = {},
  onChange,
  currentUser = null,
  errors = {},
  applicationType = 'restaurant', // 'restaurant' | 'rider'
}) {
  const accountEmail = (currentUser?.email || '').trim();
  const purpose = applicationType === 'rider' ? 'rider_application' : 'restaurant_application';

  const [emailChoice, setEmailChoice] = useState(() => {
    if (!accountEmail) return 'different';
    if (data.isSameAsAccount === false) return 'different';
    if (data.email && data.email.trim().toLowerCase() !== accountEmail.toLowerCase()) {
      return 'different';
    }
    return 'account';
  });

  const [emailInput, setEmailInput] = useState(() => {
    if (data.email) return data.email;
    return accountEmail || '';
  });

  const [otpSent, setOtpSent] = useState(Boolean(data.isVerified));
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [secondsRemaining, setSecondsRemaining] = useState(COUNTDOWN_INITIAL_SECONDS);
  const [canResend, setCanResend] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [isEditingEmail, setIsEditingEmail] = useState(false);

  const inputRefs = useRef([]);

  // Auto-sync when currentUser becomes available and no email has been set yet
  useEffect(() => {
    if (accountEmail && !data.email && !emailInput) {
      setEmailChoice('account');
      setEmailInput(accountEmail);
      onChange?.({
        ...data,
        email: accountEmail,
        isSameAsAccount: true,
      });
    }
  }, [accountEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync when external data changes
  useEffect(() => {
    if (data.email && data.email !== emailInput && !isEditingEmail) {
      setEmailInput(data.email);
      if (accountEmail) {
        setEmailChoice(
          data.email.trim().toLowerCase() === accountEmail.toLowerCase() ? 'account' : 'different'
        );
      }
    }
  }, [data.email, accountEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resend countdown timer
  useEffect(() => {
    if (!otpSent || data.isVerified) return;

    if (secondsRemaining <= 0) {
      setCanResend(true);
      return;
    }

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [otpSent, secondsRemaining, data.isVerified]);

  // Auto-focus first OTP input when OTP is sent
  useEffect(() => {
    if (otpSent && !data.isVerified && !isEditingEmail && inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, [otpSent, data.isVerified, isEditingEmail]);

  const handleSelectEmailChoice = (choice) => {
    setEmailChoice(choice);
    setStatusMessage(null);
    setIsEditingEmail(false);
    setOtpSent(false);
    setOtpDigits(['', '', '', '', '', '']);

    if (choice === 'account' && accountEmail) {
      setEmailInput(accountEmail);
      onChange?.({
        ...data,
        email: accountEmail,
        isSameAsAccount: true,
        isVerified: false,
        verifiedEmail: '',
        verifiedAt: null,
      });
    } else {
      const nextAlt =
        emailInput && accountEmail && emailInput.trim().toLowerCase() === accountEmail.toLowerCase()
          ? ''
          : emailInput;
      setEmailInput(nextAlt);
      onChange?.({
        ...data,
        email: nextAlt,
        isSameAsAccount: false,
        isVerified: false,
        verifiedEmail: '',
        verifiedAt: null,
      });
    }
  };

  const handleAlternativeEmailChange = (val) => {
    setEmailInput(val);
    setStatusMessage(null);
    onChange?.({
      ...data,
      email: val,
      isSameAsAccount: false,
    });
  };

  const activeEmail = (emailChoice === 'account' && accountEmail ? accountEmail : emailInput).trim();

  const handleSendOtp = async (e) => {
    e?.preventDefault();

    if (!activeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(activeEmail)) {
      setStatusMessage({
        type: 'error',
        text: 'Please enter a valid email address.',
      });
      return;
    }

    setSendingOtp(true);
    setStatusMessage(null);

    try {
      const result = await otpService.sendOtp({
        email: activeEmail,
        purpose,
      });

      setOtpSent(true);
      setIsEditingEmail(false);
      setSecondsRemaining(result?.cooldown_seconds || COUNTDOWN_INITIAL_SECONDS);
      setCanResend(false);
      setOtpDigits(['', '', '', '', '', '']);

      onChange?.({
        ...data,
        email: activeEmail,
        isSameAsAccount: Boolean(accountEmail && activeEmail.toLowerCase() === accountEmail.toLowerCase()),
        isVerified: false,
        verifiedEmail: '',
        verifiedAt: null,
      });

      setStatusMessage({
        type: 'info',
        text: `A 6-digit verification code has been sent to ${activeEmail}. Please check your inbox.`,
      });
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: error?.message || 'Failed to send verification code. Please try again.',
      });
    } finally {
      setSendingOtp(false);
    }
  };

  const handleDigitChange = (index, value) => {
    const cleanVal = value.replace(/\D/g, '').slice(-1);
    const updated = [...otpDigits];
    updated[index] = cleanVal;
    setOtpDigits(updated);
    setStatusMessage(null);

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

  const handleVerifyOtp = async (e) => {
    e?.preventDefault();

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

    try {
      const result = await otpService.verifyOtp({
        email: activeEmail,
        purpose,
        code: fullCode,
      });

      const verifiedEmail = result?.email || activeEmail;
      const verifiedAt = result?.verified_at || new Date().toISOString();

      onChange?.({
        ...data,
        email: verifiedEmail,
        isSameAsAccount: Boolean(accountEmail && verifiedEmail.toLowerCase() === accountEmail.toLowerCase()),
        isVerified: true,
        verifiedEmail,
        verifiedAt,
      });

      setStatusMessage({
        type: 'success',
        text: 'Email address verified successfully. You can now continue your application.',
      });
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: error?.message || 'Invalid or expired verification code. Please check and try again.',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!canResend || sendingOtp) return;
    await handleSendOtp();
  };

  const handleResetVerification = () => {
    setIsEditingEmail(true);
    setOtpSent(false);
    setOtpDigits(['', '', '', '', '', '']);
    setStatusMessage(null);
    onChange?.({
      ...data,
      isVerified: false,
      verifiedEmail: '',
      verifiedAt: null,
    });
  };

  const subheadingText =
    applicationType === 'rider'
      ? 'Choose and verify the email address for your SALO Rider Partner application. This verified email will be used for all onboarding updates.'
      : 'Choose and verify the email address for your SALO Restaurant Partner application. This verified email will be used for all onboarding and merchant updates.';

  return (
    <div className="wizard-step-container">
      <div className="wizard-step-header">
        <div className="wizard-step-header-with-badge">
          <div>
            <h2 className="wizard-step-heading">Account & Email Verification</h2>
            <p className="wizard-step-subheading">{subheadingText}</p>
          </div>
          <Badge variant={data.isVerified ? 'success' : 'warning'} size="md">
            {data.isVerified ? 'Verified ✓' : 'Verification Required'}
          </Badge>
        </div>
      </div>

      <div className="salo-email-verify-card">
        {statusMessage && (
          <div className={`wizard-status-banner ${statusMessage.type}`} role="alert">
            <span>{statusMessage.type === 'error' ? '⚠️' : statusMessage.type === 'success' ? '✓' : 'ℹ️'}</span>
            <span>{statusMessage.text}</span>
          </div>
        )}

        {errors.verification && (
          <div className="wizard-status-banner error" role="alert">
            <span>⚠️</span>
            <span>{errors.verification}</span>
          </div>
        )}

        {data.isVerified ? (
          <div className="verify-success-box animate-fade-in">
            <div className="success-icon-badge" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="success-heading">Email Address Verified</h3>
            <p className="success-text">
              <strong>{data.verifiedEmail || activeEmail}</strong> has been verified and linked to this application.
            </p>
            <div className="verified-meta-pill">
              Verified on{' '}
              {data.verifiedAt
                ? new Date(data.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'Now'}{' '}
              · Step 1 Complete ✓
            </div>

            <button
              type="button"
              className="btn-change-email"
              onClick={handleResetVerification}
            >
              Change Email Address
            </button>
          </div>
        ) : (
          <div className="verify-flow-container">
            {accountEmail ? (
              <div className="salo-email-choice-group" role="radiogroup" aria-label="Application email address choice">
                <label
                  className={`salo-email-choice-card ${emailChoice === 'account' ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name={`email-choice-${applicationType}`}
                    value="account"
                    checked={emailChoice === 'account'}
                    onChange={() => handleSelectEmailChoice('account')}
                    disabled={otpSent && !isEditingEmail}
                  />
                  <div className="salo-email-choice-body">
                    <strong>Use my existing SALO account email</strong>
                    <span className="salo-email-choice-value">{accountEmail}</span>
                  </div>
                </label>

                <label
                  className={`salo-email-choice-card ${emailChoice === 'different' ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name={`email-choice-${applicationType}`}
                    value="different"
                    checked={emailChoice === 'different'}
                    onChange={() => handleSelectEmailChoice('different')}
                    disabled={otpSent && !isEditingEmail}
                  />
                  <div className="salo-email-choice-body">
                    <strong>Use a different email address</strong>
                    <span>Enter another email address specifically for this application</span>
                  </div>
                </label>
              </div>
            ) : null}

            {(emailChoice === 'different' || !accountEmail) && (
              <div className="salo-alt-email-wrap animate-fade-in">
                <Input
                  id={`${applicationType}-app-email`}
                  type="email"
                  label="Application Email Address"
                  placeholder="e.g. contact@example.com"
                  value={emailInput}
                  onChange={(e) => handleAlternativeEmailChange(e.target.value)}
                  disabled={otpSent && !isEditingEmail}
                  required
                  error={errors.email}
                  helper="We will send a 6-digit verification code to this email address."
                />
              </div>
            )}

            {(!otpSent || isEditingEmail) && (
              <div className="verify-action-row animate-fade-in">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleSendOtp}
                  loading={sendingOtp}
                  disabled={sendingOtp || !activeEmail}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  <span>Send Verification Code →</span>
                </Button>
              </div>
            )}

            {otpSent && !isEditingEmail && (
              <div className="otp-verification-panel animate-slide-up">
                <div className="otp-target-bar">
                  <div className="target-copy">
                    <span className="target-label">Enter the 6-digit code sent to:</span>
                    <strong className="target-address">{activeEmail}</strong>
                  </div>
                  <button
                    type="button"
                    className="btn-edit-target"
                    onClick={() => setIsEditingEmail(true)}
                  >
                    Change Email
                  </button>
                </div>

                <div className="otp-input-section">
                  <label htmlFor="otp-box-0" className="otp-input-label">
                    Verification Code
                  </label>
                  <div className="otp-boxes-row" onPaste={handlePaste}>
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => (inputRefs.current[idx] = el)}
                        id={`otp-box-${idx}`}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(idx, e)}
                        className={`otp-digit-box ${digit ? 'filled' : ''}`}
                        aria-label={`Digit ${idx + 1}`}
                        autoComplete="one-time-code"
                      />
                    ))}
                  </div>

                  <div className="otp-controls-row">
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      onClick={handleVerifyOtp}
                      loading={verifying}
                      disabled={verifying || otpDigits.join('').length < 6}
                    >
                      Verify Email
                    </Button>

                    <div className="resend-wrapper">
                      {canResend ? (
                        <button
                          type="button"
                          className="btn-resend-active"
                          onClick={handleResend}
                          disabled={sendingOtp}
                        >
                          Resend Code
                        </button>
                      ) : (
                        <span className="resend-countdown">
                          Resend code in <strong>{secondsRemaining}s</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import Button from '../../../components/common/Button';
import { Input } from '../../../components/forms';

const COUNTDOWN_INITIAL_SECONDS = 60;

export default function EmailVerificationStep({
  data = {},
  onChange,
  currentUser = null,
  errors = {},
}) {
  const accountEmail = currentUser?.email || '';

  const [useAccountEmail, setUseAccountEmail] = useState(() => {
    if (data.isSameAsAccount !== undefined) return Boolean(data.isSameAsAccount);
    return Boolean(accountEmail);
  });

  const [companyNameInput, setCompanyNameInput] = useState(data.companyName || '');
  const [emailInput, setEmailInput] = useState(() => {
    if (data.email) return data.email;
    if (accountEmail) return accountEmail;
    return '';
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

  // Auto-sync if currentUser becomes available
  useEffect(() => {
    if (currentUser?.email && !data.email && !emailInput) {
      setEmailInput(currentUser.email);
      setUseAccountEmail(true);
      onChange?.({
        ...data,
        email: currentUser.email,
        isSameAsAccount: true,
      });
    }
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronize internal state when data updates externally
  useEffect(() => {
    if (data.email && data.email !== emailInput && !isEditingEmail) {
      setEmailInput(data.email);
    }
    if (data.companyName !== undefined && data.companyName !== companyNameInput) {
      setCompanyNameInput(data.companyName);
    }
    if (data.isSameAsAccount !== undefined && data.isSameAsAccount !== useAccountEmail) {
      setUseAccountEmail(data.isSameAsAccount);
    }
  }, [data.email, data.companyName, data.isSameAsAccount]); // eslint-disable-line react-hooks/exhaustive-deps

  // 60s cooldown timer
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

  // Auto focus first OTP digit box when OTP sent
  useEffect(() => {
    if (otpSent && !data.isVerified && inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, [otpSent, data.isVerified]);

  const handleToggleUseAccountEmail = (checked) => {
    setUseAccountEmail(checked);
    setStatusMessage(null);
    if (checked && accountEmail) {
      setEmailInput(accountEmail);
      onChange?.({
        ...data,
        email: accountEmail,
        isSameAsAccount: true,
        isVerified: false,
      });
      setOtpSent(false);
    } else {
      onChange?.({
        ...data,
        isSameAsAccount: false,
      });
    }
  };

  const handleCompanyChange = (val) => {
    setCompanyNameInput(val);
    onChange?.({
      ...data,
      companyName: val,
    });
  };

  const handleEmailInputChange = (val) => {
    setEmailInput(val);
    setStatusMessage(null);
  };

  const handleSendOtp = (e) => {
    e?.preventDefault();

    const trimmed = (emailInput || '').trim();
    if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
      setStatusMessage({
        type: 'error',
        text: 'Please enter a valid email address.',
      });
      return;
    }

    setSendingOtp(true);
    setStatusMessage(null);

    setTimeout(() => {
      setSendingOtp(false);
      setOtpSent(true);
      setIsEditingEmail(false);
      setSecondsRemaining(COUNTDOWN_INITIAL_SECONDS);
      setCanResend(false);
      setOtpDigits(['', '', '', '', '', '']);

      onChange?.({
        ...data,
        companyName: companyNameInput,
        email: trimmed,
        isSameAsAccount: useAccountEmail && trimmed === accountEmail,
        isVerified: false,
        verifiedEmail: '',
        verifiedAt: null,
      });

      setStatusMessage({
        type: 'info',
        text: `Verification code sent to ${trimmed}. Enter the code below or use prototype code 123456.`,
      });
    }, 500);
  };

  const handleDigitChange = (index, value) => {
    const cleanVal = value.replace(/\D/g, '').slice(-1);
    const updated = [...otpDigits];
    updated[index] = cleanVal;
    setOtpDigits(updated);
    setStatusMessage(null);

    // Auto-advance
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

  const handleVerifyOtp = (e) => {
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

    setTimeout(() => {
      setVerifying(false);

      if (fullCode === '000000') {
        setStatusMessage({
          type: 'error',
          text: 'Invalid verification code. Please check and try again.',
        });
        return;
      }

      if (fullCode === '999999') {
        setStatusMessage({
          type: 'error',
          text: 'Verification code has expired. Please click Resend Code.',
        });
        return;
      }

      const verifiedEmail = (emailInput || data.email || '').trim();
      const verifiedAt = new Date().toISOString();

      onChange?.({
        ...data,
        companyName: companyNameInput,
        email: verifiedEmail,
        isSameAsAccount: useAccountEmail && verifiedEmail === accountEmail,
        isVerified: true,
        verifiedEmail,
        verifiedAt,
      });

      setStatusMessage({
        type: 'success',
        text: 'Email verified successfully! You can now proceed to Business Information.',
      });
    }, 600);
  };

  const handleResend = () => {
    if (!canResend) return;

    setSecondsRemaining(COUNTDOWN_INITIAL_SECONDS);
    setCanResend(false);
    setOtpDigits(['', '', '', '', '', '']);
    setStatusMessage({
      type: 'info',
      text: `A new 6-digit verification code was sent to ${emailInput}. Enter code 123456 to verify.`,
    });
    inputRefs.current[0]?.focus();
  };

  const handleResetVerification = () => {
    setIsEditingEmail(true);
    setOtpSent(false);
    setStatusMessage(null);
    onChange?.({
      ...data,
      isVerified: false,
      verifiedEmail: '',
      verifiedAt: null,
    });
  };

  return (
    <div className="wizard-step-container">
      {/* Header */}
      <div className="wizard-step-header">
        <h2 className="wizard-step-heading">Account & Email Verification</h2>
        <p className="wizard-step-subheading">
          Verify your official email address with a 6-digit one-time code to secure your restaurant application and activate partner onboarding.
        </p>
      </div>

      <div className="wizard-email-verify-card">
        {/* Prototype Alert */}
        <div className="wizard-mock-pill-alert" role="status">
          <span className="pill-alert-icon" aria-hidden="true">💡</span>
          <div className="pill-alert-copy">
            <strong>Prototype Mode:</strong> No actual email is sent.
            Use <strong>123456</strong> to verify instantly. (Code <em>000000</em> tests invalid error; <em>999999</em> tests expired code).
          </div>
        </div>

        {/* Status / Error Message */}
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

        {/* Phase 3: Already Verified State */}
        {data.isVerified ? (
          <div className="verify-success-box animate-fade-in">
            <div className="success-icon-badge" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="success-heading">Email Address Verified</h3>
            <p className="success-text">
              <strong>{data.verifiedEmail || emailInput}</strong> has been successfully verified with SALO Onboarding Systems.
            </p>
            {companyNameInput && (
              <p className="success-company-subtext">
                Restaurant / Brand: <strong>{companyNameInput}</strong>
              </p>
            )}
            <div className="verified-meta-pill">
              Verified on {data.verifiedAt ? new Date(data.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'} · Step 1 Passed ✓
            </div>

            <button
              type="button"
              className="btn-change-email"
              onClick={handleResetVerification}
            >
              Change Email or Re-verify
            </button>
          </div>
        ) : (
          /* Phase 1 & 2: Form & OTP Input */
          <div className="verify-flow-container">
            {/* Account Email Option Card */}
            {accountEmail && (
              <div className="account-email-option-card">
                <label className="checkbox-control-row">
                  <input
                    type="checkbox"
                    checked={useAccountEmail}
                    onChange={(e) => handleToggleUseAccountEmail(e.target.checked)}
                  />
                  <div className="checkbox-control-text">
                    <strong>Use my SALO account email ({accountEmail})</strong>
                    <span>Use your logged-in account to receive restaurant onboarding updates with less hassle.</span>
                  </div>
                </label>
              </div>
            )}

            <div className="wizard-form-grid">
              <div className="grid-cols-2">
                <Input
                  id="biz-quick-name"
                  label="Restaurant / Brand Name (Optional)"
                  placeholder="e.g. Barrio Fiesta Bistro"
                  value={companyNameInput}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  disabled={otpSent && !isEditingEmail}
                  helper="Your primary restaurant brand name."
                />

                <Input
                  id="biz-app-email"
                  type="email"
                  label="Official Business Email Address"
                  placeholder="e.g. contact@restaurant.ph"
                  value={emailInput}
                  onChange={(e) => handleEmailInputChange(e.target.value)}
                  disabled={otpSent && !isEditingEmail}
                  required
                  error={errors.email}
                  helper={
                    useAccountEmail && accountEmail === emailInput
                      ? 'Using your verified SALO account email.'
                      : 'We will send a 6-digit verification code to this email.'
                  }
                />
              </div>
            </div>

            {/* Request OTP Button */}
            {(!otpSent || isEditingEmail) && (
              <div className="verify-action-row animate-fade-in">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleSendOtp}
                  loading={sendingOtp}
                  disabled={sendingOtp || !emailInput.trim()}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  <span>Receive OTP Verification Code →</span>
                </Button>
              </div>
            )}

            {/* OTP Entry Section */}
            {otpSent && !isEditingEmail && (
              <div className="otp-verification-panel animate-slide-up">
                <div className="otp-target-bar">
                  <div className="target-copy">
                    <span className="target-label">Enter 6-digit code sent to:</span>
                    <strong className="target-address">{emailInput}</strong>
                  </div>
                  <button
                    type="button"
                    className="btn-edit-target"
                    onClick={() => setIsEditingEmail(true)}
                  >
                    Edit Email
                  </button>
                </div>

                <div className="otp-input-section">
                  <label htmlFor="otp-box-0" className="otp-input-label">
                    Enter 6-Digit Verification Code
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
                        autoComplete="off"
                      />
                    ))}
                  </div>

                  <div className="otp-controls-row">
                    <span className="otp-countdown-text">
                      {secondsRemaining > 0 ? (
                        `Resend code in ${secondsRemaining}s`
                      ) : (
                        <button
                          type="button"
                          className="btn-resend-link"
                          onClick={handleResend}
                          disabled={!canResend}
                        >
                          Resend Code
                        </button>
                      )}
                    </span>

                    <span className="prototype-hint">
                      💡 Prototype code: <code>123456</code>
                    </span>
                  </div>

                  <div className="otp-verify-action-bar">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleVerifyOtp}
                      loading={verifying}
                      disabled={verifying || otpDigits.join('').length < 6}
                    >
                      Verify & Continue
                    </Button>
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

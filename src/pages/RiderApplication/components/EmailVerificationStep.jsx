import { useState, useEffect, useRef } from 'react';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { Input } from '../../../components/forms';

const COUNTDOWN_INITIAL_SECONDS = 60;

export default function EmailVerificationStep({
  data = {},
  onChange,
  errors = {},
  currentUser = null,
}) {
  const [emailInput, setEmailInput] = useState(data.email || '');
  const [companyNameInput, setCompanyNameInput] = useState(data.companyName || '');
  const [otpSent, setOtpSent] = useState(Boolean(data.isVerified));
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [secondsRemaining, setSecondsRemaining] = useState(COUNTDOWN_INITIAL_SECONDS);
  const [canResend, setCanResend] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [isEditingEmail, setIsEditingEmail] = useState(false);

  const inputRefs = useRef([]);

  // Prefill email and company if currentUser is present and fields are empty
  useEffect(() => {
    if (currentUser && !data.email && !emailInput) {
      const defaultEmail = currentUser.email || '';
      setEmailInput(defaultEmail);
      onChange?.({
        ...data,
        email: defaultEmail,
      });
    }
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronize internal state if data props change externally
  useEffect(() => {
    if (data.email && data.email !== emailInput && !isEditingEmail) {
      setEmailInput(data.email);
    }
    if (data.companyName !== undefined && data.companyName !== companyNameInput) {
      setCompanyNameInput(data.companyName);
    }
  }, [data.email, data.companyName]); // eslint-disable-line react-hooks/exhaustive-deps

  // 60-second cooldown timer
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

  // Focus first OTP box when OTP is sent and not verified
  useEffect(() => {
    if (otpSent && !data.isVerified && inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, [otpSent, data.isVerified]);

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

  // Step 1: Send OTP Simulation (Frontend ready for backend POST /api/v1/auth/email-otp)
  const handleSendOtp = (e) => {
    e?.preventDefault();

    const trimmed = (emailInput || '').trim();
    if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
      setStatusMessage({
        type: 'error',
        text: 'Please enter a valid company or personal email address.',
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
        isVerified: false,
        verifiedEmail: '',
        verifiedAt: null,
      });

      setStatusMessage({
        type: 'info',
        text: `Verification code sent to ${trimmed}. Check your inbox or use prototype code 123456.`,
      });
    }, 600);
  };

  const handleDigitChange = (index, value) => {
    const cleanVal = value.replace(/\D/g, '').slice(-1);
    const updated = [...otpDigits];
    updated[index] = cleanVal;
    setOtpDigits(updated);
    setStatusMessage(null);

    // Auto advance
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

  // Step 2: Verify OTP Simulation (Frontend ready for backend POST /api/v1/auth/verify-otp)
  const handleVerifyOtp = () => {
    const fullCode = otpDigits.join('');
    if (fullCode.length < 6) {
      setStatusMessage({
        type: 'error',
        text: 'Please enter all 6 digits of the OTP verification code.',
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
          text: 'Invalid verification code. Please check your code or request a new one.',
        });
        return;
      }

      if (fullCode === '999999') {
        setStatusMessage({
          type: 'error',
          text: 'This verification code has expired. Please click "Resend Code" to receive a fresh one.',
        });
        return;
      }

      // Success
      const verifiedTimestamp = new Date().toISOString();
      setStatusMessage({
        type: 'success',
        text: 'Email verified successfully! You may now proceed to Personal Information.',
      });

      onChange?.({
        ...data,
        companyName: companyNameInput,
        email: emailInput,
        isVerified: true,
        verifiedEmail: emailInput,
        verifiedAt: verifiedTimestamp,
      });
    }, 600);
  };

  const handleResend = () => {
    if (!canResend) return;

    setSendingOtp(true);
    setStatusMessage(null);

    setTimeout(() => {
      setSendingOtp(false);
      setSecondsRemaining(COUNTDOWN_INITIAL_SECONDS);
      setCanResend(false);
      setOtpDigits(['', '', '', '', '', '']);
      setStatusMessage({
        type: 'info',
        text: `A new 6-digit verification code has been dispatched to ${emailInput}.`,
      });
      inputRefs.current[0]?.focus();
    }, 500);
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

  return (
    <div className="wizard-step-container">
      {/* Step Header */}
      <div className="wizard-step-header">
        <div className="wizard-step-header-with-badge">
          <div>
            <h2 className="wizard-step-heading">Company & Email Verification</h2>
            <p className="wizard-step-subheading">
              Verify your company or courier contact email to start your application.
              Receiving and confirming your OTP code is mandatory to proceed to the next step.
            </p>
          </div>
          <Badge variant={data.isVerified ? 'success' : 'warning'} size="md">
            {data.isVerified ? 'Verified ✓' : 'Verification Required'}
          </Badge>
        </div>
      </div>

      <div className="wizard-email-verify-card">
        {/* Prototype Demonstration Alert */}
        <div className="wizard-mock-pill-alert" role="status">
          <span className="pill-alert-icon" aria-hidden="true">💡</span>
          <div className="pill-alert-copy">
            <strong>Frontend Prototype Mode:</strong> No actual email is dispatched.
            Use <strong>123456</strong> (or any 6 digits) to simulate successful verification.
            (Code <em>000000</em> tests invalid error; <em>999999</em> tests expired code).
          </div>
        </div>

        {/* Status / Error Message */}
        {statusMessage && (
          <div
            className={`wizard-status-banner ${statusMessage.type}`}
            role="alert"
          >
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
              <strong>{data.verifiedEmail || emailInput}</strong> has been successfully authenticated with SALO Onboarding Systems.
            </p>
            {companyNameInput && (
              <p className="success-company-subtext">
                Registered Fleet / Entity: <strong>{companyNameInput}</strong>
              </p>
            )}
            <div className="verified-meta-pill">
              Verified on {data.verifiedAt ? new Date(data.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'} · OTP Gate Passed
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
            <div className="wizard-form-grid">
              <div className="grid-cols-2">
                <Input
                  id="rider-company-name"
                  label="Company / Fleet Operator Name (Optional)"
                  placeholder="e.g. Swift Deliveries Inc. or Independent"
                  value={companyNameInput}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  disabled={otpSent && !isEditingEmail}
                  helper="Leave blank if applying as an independent courier."
                />

                <Input
                  id="rider-company-email"
                  type="email"
                  label="Official Company / Rider Email"
                  placeholder="e.g. courier@company.ph"
                  value={emailInput}
                  onChange={(e) => handleEmailInputChange(e.target.value)}
                  disabled={otpSent && !isEditingEmail}
                  required
                  error={errors.email}
                  helper="We will send a 6-digit one-time passcode (OTP) to this address."
                />
              </div>
            </div>

            {/* Request OTP Button (shown before OTP is sent or during email edit) */}
            {(!otpSent || isEditingEmail) && (
              <div className="verify-action-row animate-fade-in">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleSendOtp}
                  loading={sendingOtp}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  <span>Receive OTP Verification Code →</span>
                </Button>
              </div>
            )}

            {/* OTP Entry Section (shown after OTP is sent) */}
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
                    Enter Verification Code (OTP)
                  </label>
                  <div className="otp-boxes-row" onPaste={handlePaste}>
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        id={`otp-box-${idx}`}
                        ref={(el) => (inputRefs.current[idx] = el)}
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
                      disabled={otpDigits.join('').length < 6}
                    >
                      Verify & Continue
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

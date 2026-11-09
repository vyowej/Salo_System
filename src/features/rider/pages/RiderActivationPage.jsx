import { useState } from 'react';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import useScenario from '../hooks/useScenario';
import { OTP_DIGIT_COUNT, createEmptyOtp } from '../constants/riderConstants';
import './RiderActivationPage.css';

export default function RiderActivationPage() {
  const scenario = useScenario();
  const [digits, setDigits] = useState(createEmptyOtp);
  const [submitted, setSubmitted] = useState(false);

  function updateDigit(index, value) {
    const next = [...digits];
    next[index] = value.replace(/\D/g, '').slice(0, 1);
    setDigits(next);
    const nextInput = document.getElementById(`otp-${index + 1}`);
    if (nextInput && value) nextInput.focus();
  }

  const filledCount = digits.filter(Boolean).length;

  return (
    <div className="rider-page-shell">
      <PageHeader title="Activate account" subtitle={`Enter the ${OTP_DIGIT_COUNT}-digit verification code sent to your device.`} eyebrow="Account activation" />
      <StateView state={scenario === 'default' ? 'ready' : scenario} emptyTitle="Activation unavailable" emptyMessage="No activation code is available in this preview." onRetry={() => setDigits(createEmptyOtp())}>
        {submitted ? (
          <Card>
            <CardBody className="rider-activation-card">
              <span className="rider-activation-icon" aria-hidden="true">✓</span>
              <h2>Activation preview complete</h2>
              <p>The sample account was verified in this design view only.</p>
              <Button variant="primary" onClick={() => setSubmitted(false)}>Try again</Button>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardBody className="rider-activation-card">
              <div className="rider-otp-inputs" aria-label="One-time password entry">
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    id={`otp-${index + 1}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    aria-label={`OTP digit ${index + 1}`}
                    value={digit}
                    onChange={(event) => updateDigit(index, event.target.value)}
                  />
                ))}
              </div>

              <div className="rider-activation-meta">
                <Button variant="outline" size="sm">Resend code</Button>
                <span>{filledCount === OTP_DIGIT_COUNT ? 'Code ready' : 'Wait 30 seconds to resend'}</span>
              </div>

              <Button variant="primary" onClick={() => setSubmitted(true)} disabled={filledCount !== OTP_DIGIT_COUNT}>Verify account</Button>
            </CardBody>
          </Card>
        )}
      </StateView>
    </div>
  );
}

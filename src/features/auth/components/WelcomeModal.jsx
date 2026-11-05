import { useState } from 'react';
import Modal from '../../../components/common/Modal';
import { Input, Select } from '../../../components/forms';
import Button from '../../../components/common/Button';
import { useAuth } from '../../../hooks/useAuth';

/**
 * SALO Customer Welcome Onboarding Modal
 * Welcomes new customers, optionally collects phone & primary delivery address.
 * Fully skippable as per requirement (Explore First principle).
 */
export default function WelcomeModal({ open, onClose }) {
  const { user, updateUser } = useAuth();

  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState({
    label: 'Home',
    street: '',
    city: 'Metro Manila',
    notes: '',
  });

  const handleSaveAndFinish = () => {
    updateUser({
      phone: phone || user?.phone,
      defaultAddress: address.street ? address : null,
      onboardingCompleted: true,
    });
    onClose();
  };

  const handleSkip = () => {
    updateUser({ onboardingCompleted: true });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleSkip}
      title=""
      size="md"
      hideClose={false}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <Button variant="ghost" size="sm" onClick={handleSkip}>
            Skip for now
          </Button>

          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {step === 1 ? (
              <Button variant="primary" size="sm" onClick={() => setStep(2)}>
                Next: Add Address
              </Button>
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button variant="primary" size="sm" onClick={handleSaveAndFinish}>
                  Complete & Explore
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: 'var(--radius-xl)',
          background: 'var(--accent-subtle)',
          color: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          margin: '0 auto var(--space-3)',
        }}>
          🍲
        </div>
        <span className="fiesta-pill fiesta-pill-gold" style={{ marginBottom: 6 }}>Tuloy po kayo!</span>
        <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 'var(--space-1)' }}>
          Kain tayo, {user?.name || 'Kasamahan'}!
        </h2>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
          Maligayang pagdating sa SALO. Where good food brings us together.
        </p>
      </div>

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{
            padding: 'var(--space-4)',
            background: 'var(--surface-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-secondary)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}>
            Add a contact number so delivery riders and restaurants can reach you about your orders and reservations.
          </div>

          <Input
            id="onboarding-phone"
            type="tel"
            label="Mobile Phone Number (Optional)"
            placeholder="09XX XXX XXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            helper="We'll only use this for active delivery notifications."
          />
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{
            padding: 'var(--space-4)',
            background: 'var(--surface-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-secondary)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}>
            Set your primary delivery destination. Remember, with SALO you can have multiple restaurants delivered to different addresses in a single order!
          </div>

          <div className="grid-cols-2" style={{ gap: 'var(--space-3)' }}>
            <Select
              id="onboarding-label"
              label="Address Label"
              value={address.label}
              onChange={(e) => setAddress({ ...address, label: e.target.value })}
            >
              <option value="Home">Home</option>
              <option value="Office">Office</option>
              <option value="School">School</option>
              <option value="Other">Other</option>
            </Select>

            <Input
              id="onboarding-city"
              label="City / Municipality"
              value={address.city}
              onChange={(e) => setAddress({ ...address, city: e.target.value })}
            />
          </div>

          <Input
            id="onboarding-street"
            label="Street & Unit / Building"
            placeholder="e.g. Unit 4B, Emerald Tower, F. Ortigas Jr. Rd"
            value={address.street}
            onChange={(e) => setAddress({ ...address, street: e.target.value })}
          />

          <Input
            id="onboarding-notes"
            label="Delivery Instructions"
            placeholder="e.g. Leave with building reception"
            value={address.notes}
            onChange={(e) => setAddress({ ...address, notes: e.target.value })}
          />
        </div>
      )}
    </Modal>
  );
}

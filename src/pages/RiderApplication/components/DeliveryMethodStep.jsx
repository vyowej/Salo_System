import { useState } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { DELIVERY_METHODS } from '../constants/riderApplicationDefaults';

export default function DeliveryMethodStep({
  selectedMethod = 'motorcycle',
  hasExistingVehicleData = false,
  onSelectMethod,
}) {
  const [pendingMethod, setPendingMethod] = useState(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const handleCardClick = (methodKey) => {
    if (methodKey === selectedMethod) return;

    // If applicant already entered vehicle details for another mode, confirm change
    if (hasExistingVehicleData) {
      setPendingMethod(methodKey);
      setConfirmModalOpen(true);
    } else {
      onSelectMethod?.(methodKey);
    }
  };

  const handleConfirmSwitch = () => {
    if (pendingMethod) {
      onSelectMethod?.(pendingMethod, true); // true = reset vehicle data
      setPendingMethod(null);
    }
    setConfirmModalOpen(false);
  };

  return (
    <div className="rider-step-container">
      <div className="rider-step-header">
        <h2 className="rider-step-heading">Select Your Delivery Method</h2>
        <p className="rider-step-subheading">
          Choose the transport mode you will use for fulfilling food orders.
          Subsequent vehicle information and document requirements will automatically adapt to your selection.
        </p>
      </div>

      <div className="delivery-methods-grid">
        {DELIVERY_METHODS.map((method) => {
          const isSelected = method.key === selectedMethod;

          return (
            <div
              key={method.key}
              className={`delivery-method-card ${isSelected ? 'selected' : ''}`}
              onClick={() => handleCardClick(method.key)}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleCardClick(method.key);
              }}
            >
              <div className="method-card-top">
                <span className="method-icon" aria-hidden="true">{method.icon}</span>
                <div className="method-badge-wrap">
                  {isSelected ? (
                    <Badge variant="warning" size="sm">Selected</Badge>
                  ) : (
                    <span className="method-radius-badge">{method.maxRadius}</span>
                  )}
                </div>
              </div>

              <div className="method-card-body">
                <span className="method-tagline">{method.tagline}</span>
                <h3 className="method-title">{method.label}</h3>
                <p className="method-desc">{method.description}</p>
                <div className="method-requirements-box">
                  <strong>Requirements:</strong>
                  <span>{method.requirementsSummary}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal when switching vehicle mode with existing data */}
      <Modal
        open={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Change Delivery Transport Mode?"
        size="sm"
      >
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '0 0 var(--space-4)' }}>
          You have already entered vehicle details for your current delivery method.
          Changing your method will reset vehicle-specific information and document requirements.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="ghost" type="button" onClick={() => setConfirmModalOpen(false)}>
            Keep Current
          </Button>
          <Button variant="primary" type="button" onClick={handleConfirmSwitch}>
            Switch Mode & Reset
          </Button>
        </div>
      </Modal>
    </div>
  );
}

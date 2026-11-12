import { useRef, useState } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import { DELIVERY_METHODS } from '../constants/riderApplicationDefaults';
import { SelectionCheckIcon, VehicleTypeIcon } from './VehicleTypeIcons';

export default function DeliveryMethodStep({
  selectedMethod = 'motorcycle',
  hasExistingVehicleData = false,
  onSelectMethod,
}) {
  const [pendingMethod, setPendingMethod] = useState(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const cardRefs = useRef([]);

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

  const handleCardKeyDown = (event, index) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      handleCardClick(DELIVERY_METHODS[index].key);
      return;
    }

    const direction = ['ArrowRight', 'ArrowDown'].includes(event.key)
      ? 1
      : ['ArrowLeft', 'ArrowUp'].includes(event.key)
        ? -1
        : 0;

    if (direction) {
      event.preventDefault();
      const nextIndex = (index + direction + DELIVERY_METHODS.length) % DELIVERY_METHODS.length;
      cardRefs.current[nextIndex]?.focus();
      handleCardClick(DELIVERY_METHODS[nextIndex].key);
    }
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

      <div className="delivery-methods-grid" role="radiogroup" aria-label="Delivery method">
        {DELIVERY_METHODS.map((method, index) => {
          const isSelected = method.key === selectedMethod;

          return (
            <div
              key={method.key}
              className={`delivery-method-card ${isSelected ? 'selected' : ''}`}
              ref={(element) => { cardRefs.current[index] = element; }}
              onClick={() => handleCardClick(method.key)}
              role="radio"
              aria-checked={isSelected}
              aria-label={method.label}
              tabIndex={isSelected ? 0 : -1}
              onKeyDown={(event) => handleCardKeyDown(event, index)}
            >
              {isSelected && (
                <span className="method-selected-check" aria-hidden="true">
                  <SelectionCheckIcon />
                </span>
              )}
              <span className="method-icon-wrap" aria-hidden="true">
                <VehicleTypeIcon name={method.icon} />
              </span>
              <span className="method-title">{method.displayLabel}</span>
              <span className="method-distance">{method.maxRadius}</span>
              <span className="method-requirements">{method.requirementsSummary}</span>
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

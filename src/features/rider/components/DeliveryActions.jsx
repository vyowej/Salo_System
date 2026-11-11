import Button from '../../../components/common/Button';
import './DeliveryFlow.css';

export default function DeliveryActions({ actions = [], className = '' }) {
  return (
    <div className={`delivery-actions ${className}`.trim()}>
      {actions.map((action) => {
        if (!action) return null;

        const buttonProps = {
          variant: action.variant || 'outline',
          size: action.size || 'md',
          fullWidth: action.fullWidth ?? true,
          className: action.className || '',
          onClick: action.onClick,
          disabled: action.disabled,
          loading: action.loading,
          type: action.type || 'button',
        };

        if (action.as) {
          return (
            <Button
              key={action.key || action.label}
              as={action.as}
              {...buttonProps}
              {...action.props}
            >
              {action.label}
            </Button>
          );
        }

        return (
          <Button
            key={action.key || action.label}
            {...buttonProps}
          >
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import './BackButton.css';

export default function BackButton({
  fallbackTo = '/customer',
  label = 'Back',
  className = '',
}) {
  const navigate = useNavigate();

  const handleBack = () => {
    const historyIdx = window.history.state?.idx;
    if (typeof historyIdx === 'number' && historyIdx > 0) {
      navigate(-1);
    } else {
      navigate(fallbackTo);
    }
  };

  return (
    <button
      type="button"
      className={`salo-back-button ${className}`.trim()}
      onClick={handleBack}
      aria-label="Go back"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      <span className="salo-back-button-label">{label}</span>
    </button>
  );
}

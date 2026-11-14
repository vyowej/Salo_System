import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TOAST_EVENT } from './toastService';
import './modal.css';

export function AdminToastViewport() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    function handleToast(event) {
      const next = event.detail;
      if (!next?.message) return;
      setToasts((prev) => [...prev.slice(-3), next]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== next.id));
      }, 3600);
    }
    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, []);

  if (!toasts.length) return null;

  return createPortal(
    <div className="admin-toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`admin-toast admin-toast--${toast.tone}`} role="status">
          <span>{toast.message}</span>
          <button
            type="button"
            className="admin-toast__close"
            aria-label="Dismiss notification"
            onClick={() => setToasts((prev) => prev.filter((item) => item.id !== toast.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

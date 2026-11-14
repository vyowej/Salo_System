import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import './Popover.css';

export default function Popover({
  open,
  onClose,
  anchorRef,
  label = 'Popover menu',
  width = 360,
  header,
  footer,
  children,
  className = '',
}) {
  const popoverRef = useRef(null);
  const prevOpenRef = useRef(open);
  const { pathname } = useLocation();
  const [style, setStyle] = useState({});

  useLayoutEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const anchor = anchorRef?.current;
      const popover = popoverRef.current;
      if (!anchor || !popover) return;

      const rect = anchor.getBoundingClientRect();
      const margin = 12;
      const popWidth = Math.min(width, window.innerWidth * 0.92, window.innerWidth - margin * 2);
      const popHeight = Math.min(popover.offsetHeight || 360, 420);
      const left = Math.min(
        Math.max(margin, rect.right - popWidth),
        window.innerWidth - popWidth - margin,
      );
      const openUpward = rect.bottom + popHeight + 10 > window.innerHeight - margin;
      const top = openUpward
        ? Math.max(margin, rect.top - popHeight - 10)
        : Math.min(rect.bottom + 10, window.innerHeight - popHeight - margin);

      setStyle({
        left: `${left}px`,
        top: `${top}px`,
        width: `${popWidth}px`,
      });
    };

    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (
        !anchorRef?.current?.contains(event.target)
        && !popoverRef.current?.contains(event.target)
      ) {
        onClose?.();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    if (open) {
      onClose?.();
    }
    // Close on route change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (prevOpenRef.current && !open) {
      anchorRef?.current?.focus();
    }
    prevOpenRef.current = open;
  }, [open, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className={`salo-popover ${className}`.trim()}
      role="dialog"
      aria-label={label}
      style={style}
    >
      {header && <div className="salo-popover-header">{header}</div>}
      <div className="salo-popover-body">{children}</div>
      {footer && <div className="salo-popover-footer">{footer}</div>}
    </div>,
    document.body,
  );
}

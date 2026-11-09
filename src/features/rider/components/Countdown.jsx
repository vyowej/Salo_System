import { useEffect, useState } from 'react';

function getRemaining(expiresAt) {
  if (!expiresAt) return 0;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, diff);
}

export default function Countdown({ expiresAt }) {
  const [remaining, setRemaining] = useState(() => getRemaining(expiresAt));

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(getRemaining(expiresAt));
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  if (!expiresAt) {
    return <span className="rider-countdown">—</span>;
  }

  if (remaining <= 0) {
    return <span className="rider-countdown expired">Offer expired</span>;
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return <span className="rider-countdown">{minutes}:{String(seconds).padStart(2, '0')}</span>;
}

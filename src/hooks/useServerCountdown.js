import { useEffect, useState } from 'react';

/**
 * Compute remaining whole seconds from a server ISO timestamp using a server-now offset.
 * Backend remains the single source of truth; this is strictly for display countdowns.
 */
export function useServerCountdown(targetIso, serverNowIso, onExpire) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!targetIso) {
      setSecondsLeft(0);
      return undefined;
    }

    const targetMs = new Date(targetIso).getTime();
    if (!Number.isFinite(targetMs)) {
      setSecondsLeft(0);
      return undefined;
    }

    const serverMs = serverNowIso ? new Date(serverNowIso).getTime() : Date.now();
    const clockOffsetMs = Number.isFinite(serverMs) ? serverMs - Date.now() : 0;

    let expiredNotified = false;

    const tick = () => {
      const estimatedServerNow = Date.now() + clockOffsetMs;
      const diff = Math.max(0, Math.ceil((targetMs - estimatedServerNow) / 1000));
      setSecondsLeft(diff);

      if (diff <= 0 && !expiredNotified) {
        expiredNotified = true;
        if (typeof onExpire === 'function') {
          onExpire();
        }
      }
    };

    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [targetIso, serverNowIso, onExpire]);

  return secondsLeft;
}

export function formatMinutesSeconds(totalSeconds) {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

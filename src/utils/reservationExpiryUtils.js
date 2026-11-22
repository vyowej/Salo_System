export function formatTimeUntilExpiry(expiresAt, now = new Date()) {
  if (!expiresAt) return null;
  const targetMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(targetMs)) return null;

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const diffMs = targetMs - nowMs;

  if (diffMs <= 0) {
    return { expired: true, label: 'Expired' };
  }

  const totalMinutes = Math.max(1, Math.ceil(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return {
      expired: false,
      label: remHours > 0 ? `${days}d ${remHours}h` : `${days}d`,
    };
  }

  if (hours > 0) {
    return {
      expired: false,
      label: minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`,
    };
  }

  return { expired: false, label: `${totalMinutes}m` };
}

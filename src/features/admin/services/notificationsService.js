export function getAdminNotifications() {
  return [];
}

export function getPendingApplicationsCount() {
  return 0;
}

export function getOpenSupportCount() {
  return 0;
}

export function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (Number.isNaN(diffMs)) return '';
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

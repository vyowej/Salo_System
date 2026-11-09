const STORAGE_KEY = 'salo_admin_audit_log';

export function getAdminAuditLog() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function appendAdminAuditLog(entry) {
  const record = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: new Date().toISOString(),
    ...entry,
  };
  const history = getAdminAuditLog();
  localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...history]));
  return record;
}

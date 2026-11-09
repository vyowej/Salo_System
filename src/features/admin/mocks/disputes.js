import { ADMIN_MOCK_DATA } from './data';

const STORAGE_KEY = 'salo_admin_dispute_cases';

export function getAdminDisputes() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : ADMIN_MOCK_DATA.disputes;
}

export function saveAdminDisputes(disputes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(disputes));
  return disputes;
}

export function createAdminDispute(dispute) {
  const current = getAdminDisputes();
  const record = {
    id: `CASE-${Date.now()}`,
    status: 'Open',
    assignedAdminId: null,
    priority: 'Normal',
    createdAt: new Date().toISOString(),
    evidence: [],
    notes: [],
    timeline: [{ title: 'Case opened', description: 'Escalated from reservation monitoring.', time: new Date().toISOString() }],
    ...dispute,
  };
  saveAdminDisputes([record, ...current]);
  return record;
}

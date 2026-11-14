import { ADMIN_MOCK_DATA } from './data';

const STORAGE_KEY = 'salo_admin_applications_state_v1';

const RESTAURANT_REQUIRED_DOCS = [
  { key: 'business_permit', label: 'Business / Mayor’s Permit' },
  { key: 'dti_sec', label: 'DTI / SEC Registration' },
  { key: 'bir', label: 'BIR Certificate of Registration' },
  { key: 'sanitary', label: 'Sanitary Permit' },
  { key: 'valid_id', label: 'Owner Government ID' },
];

const RIDER_REQUIRED_DOCS = [
  { key: 'drivers_license', label: 'Driver’s License' },
  { key: 'or_cr', label: 'Vehicle OR / CR' },
  { key: 'clearance', label: 'NBI / Police Clearance' },
  { key: 'valid_id', label: 'Government Valid ID' },
  { key: 'photo', label: 'Applicant Selfie / Photo' },
];

function readState() {
  if (typeof window === 'undefined') return { restaurant: {}, rider: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { restaurant: {}, rider: {} };
  } catch {
    return { restaurant: {}, rider: {} };
  }
}

function writeState(state) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeStatus(item, kind) {
  if (item.applicationStatus === 'Needs Revision' || item.status === 'Needs Revision') return 'Needs Revision';
  if (item.applicationStatus === 'Under Review') return 'Under Review';
  if (item.applicationStatus === 'Rejected' || item.status === 'Rejected') return 'Rejected';
  if (item.applicationStatus === 'Approved' || item.status === 'Active' || item.status === 'Suspended') return 'Approved';
  if (kind === 'restaurant' && item.status === 'Pending Approval') return 'Pending';
  if (kind === 'rider' && item.status === 'Pending Verification') return 'Pending';
  return 'Pending';
}

function buildDefaultDocs(item, kind, savedDocs) {
  const defs = kind === 'restaurant' ? RESTAURANT_REQUIRED_DOCS : RIDER_REQUIRED_DOCS;
  const approved = item.applicationStatus === 'Approved' || item.status === 'Active' || item.status === 'Suspended';
  return defs.map((def, idx) => {
    const saved = savedDocs?.[def.key];
    const defaultStatus = approved ? 'Verified' : idx < 3 ? 'Verified' : 'Pending';
    return {
      key: def.key,
      label: def.label,
      status: saved?.status || defaultStatus,
      reason: saved?.reason || '',
      checked: saved?.checked ?? (saved?.status === 'Verified' || defaultStatus === 'Verified'),
      previewTitle: `${def.label} — ${item.name}`,
      fileName: `${def.key}-${item.id}.pdf`,
    };
  });
}

function hydrateRecord(record, kind, savedEntry) {
  const merged = savedEntry ? { ...record, ...savedEntry.patch } : { ...record };
  const normalizedStatus = normalizeStatus(merged, kind);
  const documentsList = buildDefaultDocs(merged, kind, savedEntry?.documents);
  const verifiedCount = documentsList.filter((doc) => doc.status === 'Verified').length;
  const history = savedEntry?.history || [
    {
      id: `hist-${merged.id}-1`,
      time: `${merged.joinedDate || '2026-11-01'}T09:00:00+08:00`,
      actor: kind === 'restaurant' ? merged.ownerName : merged.name,
      action: 'Application submitted',
      detail: 'Submitted onboarding form and required verification documents.',
    },
  ];
  return {
    ...merged,
    applicationId: `APP-${kind === 'restaurant' ? 'REST' : 'RIDER'}-${String(merged.id).replace(/\D+/g, '') || '1'}`,
    reviewStatus: normalizedStatus,
    operatingHours: merged.operatingHours || '09:00 AM – 09:00 PM',
    emergencyContact: merged.emergencyContact || 'Elena Soriano · 0917 555 0192',
    preferredZones: merged.preferredZones || [merged.zone || 'Quezon City'],
    documentsList,
    verifiedDocsCount: verifiedCount,
    totalDocsCount: documentsList.length,
    internalNotes: savedEntry?.internalNotes || '',
    history,
  };
}

export function syncApplicationsToMockData() {
  const state = readState();
  ADMIN_MOCK_DATA.restaurants.forEach((item, index) => {
    const saved = state.restaurant?.[item.id];
    if (saved?.patch) {
      ADMIN_MOCK_DATA.restaurants[index] = { ...item, ...saved.patch };
    }
  });
  ADMIN_MOCK_DATA.riders.forEach((item, index) => {
    const saved = state.rider?.[item.id];
    if (saved?.patch) {
      ADMIN_MOCK_DATA.riders[index] = { ...item, ...saved.patch };
    }
  });
}

syncApplicationsToMockData();

export function getRestaurantApplications() {
  syncApplicationsToMockData();
  const state = readState();
  return ADMIN_MOCK_DATA.restaurants.map((item) => hydrateRecord(item, 'restaurant', state.restaurant?.[item.id]));
}

export function getRiderApplications() {
  syncApplicationsToMockData();
  const state = readState();
  return ADMIN_MOCK_DATA.riders.map((item) => hydrateRecord(item, 'rider', state.rider?.[item.id]));
}

export function saveApplicationDraft(kind, id, { documents, internalNotes }) {
  const state = readState();
  const bucket = kind === 'restaurant' ? 'restaurant' : 'rider';
  const prev = state[bucket]?.[id] || {};
  const docMap = {};
  (documents || []).forEach((doc) => {
    docMap[doc.key] = { status: doc.status, reason: doc.reason || '', checked: Boolean(doc.checked) };
  });
  state[bucket][id] = {
    ...prev,
    documents: docMap,
    internalNotes: internalNotes ?? prev.internalNotes ?? '',
  };
  writeState(state);
}

export function applyApplicationDecision(kind, id, { decision, documents, internalNotes, reason, actor }) {
  const state = readState();
  const bucket = kind === 'restaurant' ? 'restaurant' : 'rider';
  const list = kind === 'restaurant' ? ADMIN_MOCK_DATA.restaurants : ADMIN_MOCK_DATA.riders;
  const target = list.find((item) => item.id === id);
  if (!target) return null;

  const prev = state[bucket]?.[id] || {};
  const existing = hydrateRecord(target, kind, prev);
  const nowIso = new Date().toISOString();

  let patch = {};
  let actionLabel = '';
  if (decision === 'approve') {
    patch = kind === 'restaurant'
      ? {
          status: 'Active',
          applicationStatus: 'Approved',
          verificationStatus: 'Verified',
          operatingStatus: 'Open',
        }
      : {
          status: 'Active',
          applicationStatus: 'Approved',
          verificationStatus: 'Verified',
          shifts: target.shifts?.[0] === 'Not assigned' ? ['09:00–17:00'] : target.shifts,
          codStatus: target.codStatus === 'Not applicable' ? 'Clear' : target.codStatus,
        };
    actionLabel = 'Application approved';
  } else if (decision === 'revision') {
    patch = {
      status: 'Needs Revision',
      applicationStatus: 'Needs Revision',
      verificationStatus: 'Needs Revision',
    };
    actionLabel = 'Revision requested';
  } else if (decision === 'reject') {
    patch = {
      status: 'Rejected',
      applicationStatus: 'Rejected',
      verificationStatus: 'Rejected',
    };
    actionLabel = 'Application rejected';
  } else if (decision === 'under_review') {
    patch = {
      applicationStatus: 'Under Review',
    };
    actionLabel = 'Marked under review';
  }

  const docMap = {};
  (documents || existing.documentsList).forEach((doc) => {
    docMap[doc.key] = {
      status: decision === 'approve' ? 'Verified' : doc.status,
      reason: doc.reason || '',
      checked: decision === 'approve' ? true : Boolean(doc.checked),
    };
  });

  const nextHistory = [
    {
      id: `hist-${id}-${Date.now()}`,
      time: nowIso,
      actor: actor || 'Administrator',
      action: actionLabel,
      detail: reason || internalNotes || actionLabel,
    },
    ...existing.history,
  ];

  state[bucket][id] = {
    patch,
    documents: docMap,
    internalNotes: internalNotes ?? existing.internalNotes ?? '',
    history: nextHistory,
  };
  writeState(state);
  syncApplicationsToMockData();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('salo-admin-data-updated'));
  }

  return hydrateRecord(
    list.find((item) => item.id === id),
    kind,
    state[bucket][id],
  );
}

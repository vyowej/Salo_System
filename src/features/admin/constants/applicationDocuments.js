/**
 * Shared constants, label maps, status buckets, and helpers for Admin Applications.
 */

export const APPLICATION_DOCUMENT_LABELS = {
  // Restaurant documents
  bank_proof: 'Bank Proof',
  proof_of_address: 'Proof of Address',
  mayors_permit: "Mayor's Permit",
  government_id: 'Government ID',
  dti_certificate: 'DTI Certificate',
  sec_certificate: 'SEC Certificate',
  cda_certificate: 'CDA Certificate',
  other_registration: 'Business Registration',
  authorization_letter: 'Authorization Letter',
  bir_2303: 'BIR Form 2303',
  barangay_clearance: 'Barangay Clearance',
  sanitary_permit: 'Sanitary Permit',
  fire_safety_permit: 'Fire Safety Permit',

  // Rider documents
  government_id_front: 'Government ID (Front)',
  government_id_back: 'Government ID (Back)',
  selfie: 'Selfie with ID',
  driver_license: "Driver's License",
  lto_or: 'LTO Official Receipt (OR)',
  lto_cr: 'LTO Certificate of Registration (CR)',
  motorcycle_photo: 'Motorcycle Photo',
  vehicle_authorization: 'Vehicle Authorization',
  motor_insurance: 'Motor Insurance',
  bicycle_photo: 'Bicycle Photo',
  bicycle_proof: 'Bicycle Ownership Proof',
  ebike_photo: 'E-Bike Photo',
  ebike_proof: 'E-Bike Ownership Proof',
  escooter_photo: 'E-Scooter Photo',
  escooter_proof: 'E-Scooter Ownership Proof',

  // Shared / requested
  requested_document: 'Requested Document',
};

export const DOCUMENT_REJECTION_REASONS = [
  'Blurry',
  'Expired',
  'Wrong document',
  'Name does not match',
  'Other',
];

export const NEEDS_ACTION_STATUSES = [
  'submitted',
  'pending_review',
  'under_review',
  'resubmitted',
];

export const WAITING_FOR_APPLICANT_STATUSES = [
  'additional_documents_required',
];

export const APPLICATION_FILTER_TABS = [
  { value: 'needs_action', label: 'Needs action' },
  { value: 'waiting', label: 'Waiting for applicant' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

export function getDocumentLabel(code) {
  if (!code) return 'Document';
  if (APPLICATION_DOCUMENT_LABELS[code]) {
    return APPLICATION_DOCUMENT_LABELS[code];
  }
  return String(code)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function isNeedsActionStatus(status) {
  return NEEDS_ACTION_STATUSES.includes(String(status || '').toLowerCase());
}

export function matchesApplicationFilter(status, filterValue) {
  const normalized = String(status || '').toLowerCase();
  switch (filterValue) {
    case 'needs_action':
      return NEEDS_ACTION_STATUSES.includes(normalized);
    case 'waiting':
      return WAITING_FOR_APPLICANT_STATUSES.includes(normalized);
    case 'approved':
      return normalized === 'approved';
    case 'rejected':
      return normalized === 'rejected';
    case 'all':
    default:
      return true;
  }
}

export function countApplicationsByFilter(items = []) {
  const counts = {
    needs_action: 0,
    waiting: 0,
    approved: 0,
    rejected: 0,
    all: items.length,
  };

  for (const item of items) {
    const status = String(item?.application_status || '').toLowerCase();
    if (NEEDS_ACTION_STATUSES.includes(status)) counts.needs_action += 1;
    else if (WAITING_FOR_APPLICANT_STATUSES.includes(status)) counts.waiting += 1;
    else if (status === 'approved') counts.approved += 1;
    else if (status === 'rejected') counts.rejected += 1;
  }

  return counts;
}

export function isPdfDocument(doc) {
  const mime = String(doc?.mime_type || '').toLowerCase();
  const filename = String(doc?.original_filename || '').toLowerCase();
  return mime === 'application/pdf' || filename.endsWith('.pdf');
}

export function formatShortSubmittedDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(date);
}

export function buildRejectedDocumentsSummary(rejectedDocs = []) {
  if (!rejectedDocs.length) return '';
  const parts = rejectedDocs.map((doc) => {
    const label = getDocumentLabel(doc.document_code);
    return doc.review_note ? `${label} (${doc.review_note})` : label;
  });
  return `Please re-upload the following document(s): ${parts.join('; ')}`;
}

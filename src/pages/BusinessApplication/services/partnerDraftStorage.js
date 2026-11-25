/**
 * SALO — Partner (Restaurant) Application Draft Persistence Service
 * Persists form data in localStorage and binary File/Blob objects in IndexedDB (via draftFileStore).
 */

import { saveDraftFiles, loadDraftFiles, clearDraftFiles } from '../../../services/draftFileStore.js';
import { stripFilesFromAddressDraft } from '../utils/branchHelpers.js';

export const PARTNER_DRAFT_STORAGE_KEY = 'salo_partner_app_draft_v1';
export const LEGACY_PARTNER_SESSION_KEY = 'salo_partner_app_draft';

export function getPartnerDraftScope(ownerUserId) {
  return ownerUserId ? `partner_${ownerUserId}` : 'partner_anon';
}

export function isPartnerDraftOwnedByUser(parsed, currentUser) {
  if (!parsed || typeof parsed !== 'object') return false;
  if (!currentUser) return true;

  const userId = currentUser.id ?? currentUser.user_id ?? null;
  const userEmail = String(currentUser.email || '').trim().toLowerCase();
  const draftUserId = parsed._ownerUserId ?? null;
  const draftEmail = String(parsed._ownerEmail || '').trim().toLowerCase();

  if (!draftUserId || !draftEmail) return false;
  if (userId !== null && Number(draftUserId) !== Number(userId)) return false;
  if (userEmail && draftEmail !== userEmail) return false;
  return true;
}

function collectPartnerDraftFiles(formData) {
  const filesMap = {};

  Object.entries(formData?.documents || {}).forEach(([docId, entry]) => {
    if (entry && (entry.file || entry.dataUrl || entry.previewUrl?.startsWith('data:'))) {
      filesMap[`doc:${docId}`] = entry;
    }
  });

  if (formData?.payout?.proofDocument) {
    const proof = formData.payout.proofDocument;
    if (proof.file || proof.dataUrl || proof.previewUrl?.startsWith('data:')) {
      filesMap['payout:proofDocument'] = proof;
    }
  }

  if (formData?.configuration?.logo?.file) {
    filesMap['config:logo'] = {
      file: formData.configuration.logo.file,
      name: formData.configuration.logo.name || formData.configuration.logo.file.name,
    };
  }

  if (formData?.configuration?.coverPhoto?.file) {
    filesMap['config:coverPhoto'] = {
      file: formData.configuration.coverPhoto.file,
      name: formData.configuration.coverPhoto.name || formData.configuration.coverPhoto.file.name,
    };
  }

  (formData?.configuration?.menuItems || []).forEach((item, idx) => {
    if (item?.photoFile) {
      filesMap[`menu:${idx}`] = {
        file: item.photoFile,
        name: item.photoName || item.photoFile.name || `menu_${idx}.jpg`,
      };
    }
  });

  (formData?.address?.branches || []).forEach((branch, idx) => {
    if (branch?.permitFile) {
      filesMap[`branch:${idx}`] = {
        file: branch.permitFile,
        name: branch.permitFile.name || `branch_${idx}_permit.pdf`,
      };
    }
  });

  return filesMap;
}

export async function savePartnerDraft({
  formData,
  currentStep,
  completedSteps,
  ownerUserId = null,
  ownerEmail = null,
}) {
  const scope = getPartnerDraftScope(ownerUserId);
  const filesMap = collectPartnerDraftFiles(formData);
  await saveDraftFiles(scope, filesMap);

  const savedAt = new Date().toISOString();
  const serializableData = {
    ...formData,
    _ownerUserId: ownerUserId ?? null,
    _ownerEmail: ownerEmail ? String(ownerEmail).trim().toLowerCase() : null,
    _currentStep: currentStep ?? 1,
    _completedSteps: Array.isArray(completedSteps) ? completedSteps : [],
    _savedAt: savedAt,
    address: stripFilesFromAddressDraft(formData?.address),
    documents: {},
    payout: {
      ...(formData?.payout || {}),
      proofDocument: null,
    },
    configuration: {
      ...(formData?.configuration || {}),
      logo: formData?.configuration?.logo ? { name: formData.configuration.logo.name } : null,
      coverPhoto: formData?.configuration?.coverPhoto ? { name: formData.configuration.coverPhoto.name } : null,
      menuItems: (formData?.configuration?.menuItems || []).map((item) => ({
        ...item,
        photoUrl: null,
        photoFile: null,
      })),
    },
  };

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(PARTNER_DRAFT_STORAGE_KEY, JSON.stringify(serializableData));
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(LEGACY_PARTNER_SESSION_KEY);
    } catch {
      // ignore
    }
  }

  return { savedAt };
}

export function loadPartnerDraftMetadata(currentUser = null) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PARTNER_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (currentUser && !isPartnerDraftOwnedByUser(parsed, currentUser)) {
      localStorage.removeItem(PARTNER_DRAFT_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function restorePartnerDraftFiles(formData, ownerUserId = null) {
  const scope = getPartnerDraftScope(ownerUserId);
  const files = await loadDraftFiles(scope);
  if (!files || Object.keys(files).length === 0) {
    return formData;
  }

  const nextDocuments = { ...(formData?.documents || {}) };
  Object.entries(files).forEach(([slotKey, entry]) => {
    if (slotKey.startsWith('doc:')) {
      const docId = slotKey.slice(4);
      nextDocuments[docId] = {
        id: docId,
        name: entry.name,
        size: entry.size,
        type: entry.type,
        previewUrl: entry.previewUrl || entry.src || null,
        dataUrl: entry.dataUrl || null,
        file: entry.file || null,
        uploadedAt: entry.uploadedAt || new Date().toISOString(),
      };
    }
  });

  const proofEntry = files['payout:proofDocument'];
  const nextProof = proofEntry
    ? {
        id: 'bank_proof',
        name: proofEntry.name,
        size: proofEntry.size,
        type: proofEntry.type,
        previewUrl: proofEntry.previewUrl || proofEntry.src || null,
        dataUrl: proofEntry.dataUrl || null,
        file: proofEntry.file || null,
        uploadedAt: proofEntry.uploadedAt || new Date().toISOString(),
      }
    : formData?.payout?.proofDocument || null;

  const logoEntry = files['config:logo'];
  const nextLogo = logoEntry
    ? { name: logoEntry.name, src: logoEntry.previewUrl || logoEntry.src, file: logoEntry.file }
    : formData?.configuration?.logo || null;

  const coverEntry = files['config:coverPhoto'];
  const nextCover = coverEntry
    ? { name: coverEntry.name, src: coverEntry.previewUrl || coverEntry.src, file: coverEntry.file }
    : formData?.configuration?.coverPhoto || null;

  const nextMenuItems = (formData?.configuration?.menuItems || []).map((item, idx) => {
    const entry = files[`menu:${idx}`];
    if (!entry) return item;
    return {
      ...item,
      photoName: entry.name,
      photoUrl: entry.previewUrl || entry.src || null,
      photoFile: entry.file || null,
    };
  });

  const nextBranches = (formData?.address?.branches || []).map((branch, idx) => {
    const entry = files[`branch:${idx}`];
    if (!entry) return branch;
    return {
      ...branch,
      permitFile: entry.file || null,
      hadPendingPermitFile: false,
    };
  });

  return {
    ...formData,
    documents: nextDocuments,
    payout: {
      ...(formData?.payout || {}),
      proofDocument: nextProof,
    },
    configuration: {
      ...(formData?.configuration || {}),
      logo: nextLogo,
      coverPhoto: nextCover,
      menuItems: nextMenuItems,
    },
    address: {
      ...(formData?.address || {}),
      branches: nextBranches,
    },
  };
}

export async function clearPartnerDraft(ownerUserId = null) {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(PARTNER_DRAFT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(LEGACY_PARTNER_SESSION_KEY);
    } catch {
      // ignore
    }
  }
  await clearDraftFiles(getPartnerDraftScope(ownerUserId));
}

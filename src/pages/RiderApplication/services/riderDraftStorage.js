/**
 * SALO — Rider Application Draft Persistence Service
 * Safe local storage manager with canvas image compression and quota detection.
 */

import { CAMERA_CONFIG } from '../constants/cameraConfig.js';
import { saveDraftFiles, loadDraftFiles, clearDraftFiles } from '../../../services/draftFileStore.js';

export const RIDER_DRAFT_STORAGE_KEY = 'salo_rider_app_draft_v1';
export const RIDER_APPLICATIONS_STORAGE_KEY = 'salo_rider_applications';

export function getRiderDraftScope(ownerUserId) {
  return ownerUserId ? `rider_${ownerUserId}` : 'rider_anon';
}

/**
 * Compresses an image (Blob, File, or DataURL) to a JPEG data URL via HTML Canvas.
 * Caps the longest dimension and applies compression quality.
 */
export async function compressImageToDataUrl(imageSource, options = {}) {
  const maxDim = options.maxDimension || CAMERA_CONFIG.compression.maxDimension;
  const quality = options.quality || CAMERA_CONFIG.compression.quality;
  const mimeType = options.mimeType || CAMERA_CONFIG.compression.mimeType;

  // In Node.js or SSR environment without window/Image
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return typeof imageSource === 'string' ? imageSource : null;
  }

  return new Promise((resolve, reject) => {
    let srcUrl = '';
    let shouldRevoke = false;

    if (typeof imageSource === 'string') {
      srcUrl = imageSource;
    } else if (imageSource instanceof Blob || (typeof File !== 'undefined' && imageSource instanceof File)) {
      srcUrl = URL.createObjectURL(imageSource);
      shouldRevoke = true;
    } else {
      resolve(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Downscale proportionally if larger than maxDim
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (shouldRevoke) URL.revokeObjectURL(srcUrl);
          resolve(srcUrl);
          return;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL(mimeType, quality);

        if (shouldRevoke) URL.revokeObjectURL(srcUrl);
        resolve(compressedDataUrl);
      } catch (err) {
        if (shouldRevoke) URL.revokeObjectURL(srcUrl);
        reject(err);
      }
    };

    img.onerror = (err) => {
      if (shouldRevoke) URL.revokeObjectURL(srcUrl);
      reject(err);
    };

    img.src = srcUrl;
  });
}

/**
 * Normalizes document metadata for storage serialization, converting File/Blob to compressed data URLs.
 */
async function serializeDocEntry(entry) {
  if (!entry) return null;

  // If already a serialized data object with dataUrl
  let dataUrl = entry.dataUrl || (entry.previewUrl && entry.previewUrl.startsWith('data:') ? entry.previewUrl : null);

  // If there's an actual File or Blob, compress it
  if (!dataUrl && entry.file && (entry.file instanceof Blob || (typeof File !== 'undefined' && entry.file instanceof File))) {
    if (entry.file.type.startsWith('image/')) {
      try {
        dataUrl = await compressImageToDataUrl(entry.file);
      } catch (e) {
        console.warn('Could not compress image file for draft storage', e);
      }
    }
  }

  return {
    id: entry.id,
    name: entry.name || 'document.jpg',
    size: entry.size || 0,
    type: entry.type || 'image/jpeg',
    dataUrl: dataUrl || null,
    previewUrl: dataUrl || null,
    uploadedAt: entry.uploadedAt || new Date().toISOString(),
    isCaptured: Boolean(entry.isCaptured),
  };
}

/**
 * Recursively prepares form data for JSON serialization, handling document dictionaries.
 */
export async function serializeFormData(formData) {
  if (!formData) return {};

  const serialized = { ...formData };

  // Identity photos
  if (formData.identity) {
    serialized.identity = {
      ...formData.identity,
      frontPhoto: await serializeDocEntry(formData.identity.frontPhoto),
      backPhoto: await serializeDocEntry(formData.identity.backPhoto),
      selfiePhoto: await serializeDocEntry(formData.identity.selfiePhoto),
    };
  }

  // Vehicle photo
  if (formData.vehicleInfo) {
    serialized.vehicleInfo = {
      ...formData.vehicleInfo,
      vehiclePhoto: await serializeDocEntry(formData.vehicleInfo.vehiclePhoto),
    };
  }

  // Vehicle documents
  if (formData.vehicleDocuments) {
    const serializedVehDocs = {};
    for (const [docId, doc] of Object.entries(formData.vehicleDocuments)) {
      if (doc) {
        serializedVehDocs[docId] = await serializeDocEntry(doc);
      }
    }
    serialized.vehicleDocuments = serializedVehDocs;
  }

  // Clearance documents
  if (formData.clearanceDocuments) {
    const serializedClearances = {};
    for (const [docId, doc] of Object.entries(formData.clearanceDocuments)) {
      if (doc) {
        serializedClearances[docId] = await serializeDocEntry(doc);
      }
    }
    serialized.clearanceDocuments = serializedClearances;
  }

  // Payout proof
  if (formData.payout) {
    serialized.payout = {
      ...formData.payout,
      proofDocument: await serializeDocEntry(formData.payout.proofDocument),
    };
  }

  return serialized;
}

export function isRiderDraftOwnedByUser(draft, currentUser) {
  if (!draft || typeof draft !== 'object') return false;
  if (!currentUser) return true;

  const userId = currentUser.id ?? currentUser.user_id ?? null;
  const userEmail = String(currentUser.email || '').trim().toLowerCase();

  // If a logged-in user is present, reject legacy unscoped drafts or drafts from another user/email
  const draftUserId = draft.ownerUserId ?? null;
  const draftEmail = String(draft.ownerEmail || '').trim().toLowerCase();

  if (!draftUserId || !draftEmail) {
    return false;
  }

  if (userId !== null && Number(draftUserId) !== Number(userId)) {
    return false;
  }

  if (userEmail && draftEmail !== userEmail) {
    return false;
  }

  return true;
}

function collectRiderDraftFiles(formData) {
  const filesMap = {};
  if (!formData) return filesMap;

  if (formData.identity) {
    ['frontPhoto', 'backPhoto', 'selfiePhoto'].forEach((k) => {
      if (formData.identity[k]) filesMap[`identity:${k}`] = formData.identity[k];
    });
  }
  if (formData.vehicleInfo?.vehiclePhoto) {
    filesMap['vehicle:vehiclePhoto'] = formData.vehicleInfo.vehiclePhoto;
  }
  Object.entries(formData.vehicleDocuments || {}).forEach(([docId, doc]) => {
    if (doc) filesMap[`vehDoc:${docId}`] = doc;
  });
  Object.entries(formData.clearanceDocuments || {}).forEach(([docId, doc]) => {
    if (doc) filesMap[`clrDoc:${docId}`] = doc;
  });
  if (formData.payout?.proofDocument) {
    filesMap['payout:proofDocument'] = formData.payout.proofDocument;
  }
  return filesMap;
}

export async function restoreRiderDraftFiles(formData, ownerUserId = null) {
  const files = await loadDraftFiles(getRiderDraftScope(ownerUserId));
  if (!files || Object.keys(files).length === 0) return formData;

  const mergeEntry = (existing, restored) => {
    if (!restored) return existing;
    return {
      ...(existing || {}),
      ...restored,
      previewUrl: restored.previewUrl || existing?.previewUrl || restored.dataUrl || existing?.dataUrl || null,
    };
  };

  const next = { ...formData };
  if (next.identity) {
    next.identity = {
      ...next.identity,
      frontPhoto: mergeEntry(next.identity.frontPhoto, files['identity:frontPhoto']),
      backPhoto: mergeEntry(next.identity.backPhoto, files['identity:backPhoto']),
      selfiePhoto: mergeEntry(next.identity.selfiePhoto, files['identity:selfiePhoto']),
    };
  }
  if (next.vehicleInfo) {
    next.vehicleInfo = {
      ...next.vehicleInfo,
      vehiclePhoto: mergeEntry(next.vehicleInfo.vehiclePhoto, files['vehicle:vehiclePhoto']),
    };
  }
  if (next.vehicleDocuments) {
    const nextVeh = { ...next.vehicleDocuments };
    Object.entries(files).forEach(([slot, restored]) => {
      if (slot.startsWith('vehDoc:')) {
        const docId = slot.slice(7);
        nextVeh[docId] = mergeEntry(nextVeh[docId], restored);
      }
    });
    next.vehicleDocuments = nextVeh;
  }
  if (next.clearanceDocuments) {
    const nextClr = { ...next.clearanceDocuments };
    Object.entries(files).forEach(([slot, restored]) => {
      if (slot.startsWith('clrDoc:')) {
        const docId = slot.slice(7);
        nextClr[docId] = mergeEntry(nextClr[docId], restored);
      }
    });
    next.clearanceDocuments = nextClr;
  }
  if (next.payout) {
    next.payout = {
      ...next.payout,
      proofDocument: mergeEntry(next.payout.proofDocument, files['payout:proofDocument']),
    };
  }
  return next;
}

/**
 * Saves rider application progress to localStorage + IndexedDB (for binary files/PDFs).
 * Throws an Error with friendly message if storage quota is exceeded.
 */
export async function saveRiderDraft({
  formData,
  currentStep = 1,
  completedSteps = [],
  ownerUserId = null,
  ownerEmail = null,
}) {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Local storage is not available in this browser environment.');
  }

  await saveDraftFiles(getRiderDraftScope(ownerUserId), collectRiderDraftFiles(formData));

  const timestamp = new Date().toISOString();
  const serializedData = await serializeFormData(formData);

  const payload = {
    version: 1,
    savedAt: timestamp,
    ownerUserId: ownerUserId !== null && ownerUserId !== undefined ? Number(ownerUserId) : null,
    ownerEmail: ownerEmail ? String(ownerEmail).trim().toLowerCase() : null,
    currentStep: Number(currentStep) || 1,
    completedSteps: Array.isArray(completedSteps) ? completedSteps : [],
    formData: serializedData,
  };

  const jsonString = JSON.stringify(payload);

  try {
    window.localStorage.setItem(RIDER_DRAFT_STORAGE_KEY, jsonString);
    return {
      success: true,
      savedAt: timestamp,
    };
  } catch (error) {
    if (
      error.name === 'QuotaExceededError' ||
      error.code === 22 ||
      error.code === 1014 ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    ) {
      throw new Error(
        'Browser storage quota exceeded. Please remove some large documents or retake photos to free space.',
        { cause: error }
      );
    }
    throw new Error(error.message || 'Failed to save draft to storage.', { cause: error });
  }
}

/**
 * Loads the saved draft from localStorage. Returns null if not found, corrupted, or owned by another user.
 */
export function loadRiderDraft(currentUser = null) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(RIDER_DRAFT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.formData) return null;

    const draft = {
      formData: parsed.formData,
      currentStep: parsed.currentStep || 1,
      completedSteps: Array.isArray(parsed.completedSteps) ? parsed.completedSteps : [],
      savedAt: parsed.savedAt || null,
      ownerUserId: parsed.ownerUserId ?? null,
      ownerEmail: parsed.ownerEmail ?? null,
    };

    if (currentUser && !isRiderDraftOwnedByUser(draft, currentUser)) {
      clearRiderDraft();
      return null;
    }

    return draft;
  } catch (err) {
    console.warn('Failed to parse rider application draft from localStorage', err);
    return null;
  }
}

/**
 * Clears the saved draft from localStorage and IndexedDB.
 */
export function clearRiderDraft(ownerUserId = null) {
  clearDraftFiles(getRiderDraftScope(ownerUserId)).catch(() => {});
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(RIDER_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Checks if a saved draft exists.
 */
export function hasRiderDraft() {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    return Boolean(window.localStorage.getItem(RIDER_DRAFT_STORAGE_KEY));
  } catch {
    return false;
  }
}

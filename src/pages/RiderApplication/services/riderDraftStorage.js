/**
 * SALO — Rider Application Draft Persistence Service
 * Safe local storage manager with canvas image compression and quota detection.
 */

import { CAMERA_CONFIG } from '../constants/cameraConfig.js';

export const RIDER_DRAFT_STORAGE_KEY = 'salo_rider_app_draft_v1';
export const RIDER_APPLICATIONS_STORAGE_KEY = 'salo_rider_applications';

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

/**
 * Saves rider application progress to localStorage.
 * Throws an Error with friendly message if storage quota is exceeded.
 */
export async function saveRiderDraft({ formData, currentStep = 1, completedSteps = [1] }) {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Local storage is not available in this browser environment.');
  }

  const timestamp = new Date().toISOString();
  const serializedData = await serializeFormData(formData);

  const payload = {
    version: 1,
    savedAt: timestamp,
    currentStep: Number(currentStep) || 1,
    completedSteps: Array.isArray(completedSteps) ? completedSteps : [1],
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
 * Loads the saved draft from localStorage. Returns null if not found or corrupted.
 */
export function loadRiderDraft() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(RIDER_DRAFT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.formData) return null;

    return {
      formData: parsed.formData,
      currentStep: parsed.currentStep || 1,
      completedSteps: parsed.completedSteps || [1],
      savedAt: parsed.savedAt || null,
    };
  } catch (err) {
    console.warn('Failed to parse rider application draft from localStorage', err);
    return null;
  }
}

/**
 * Clears the saved draft from localStorage.
 */
export function clearRiderDraft() {
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

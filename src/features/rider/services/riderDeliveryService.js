const STORAGE_KEY = 'salo_rider_delivery_progress';
const memoryProgress = new Map();

function readStoredProgress() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProgress() {
  try {
    const stored = readStoredProgress();
    const serializable = {};

    memoryProgress.forEach((progress, orderId) => {
      serializable[orderId] = {
        status: progress.status,
        pickupPhoto: progress.pickupPhoto?.dataUrl
          ? {
              dataUrl: progress.pickupPhoto.dataUrl,
              capturedAt: progress.pickupPhoto.capturedAt,
            }
          : undefined,
      };
    });

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, ...serializable }));
  } catch {
    // Keep in-memory progress when browser storage is unavailable or full.
  }
}

export function getDeliveryProgress(orderId) {
  if (!orderId) return null;
  if (memoryProgress.has(orderId)) return memoryProgress.get(orderId);

  const progress = readStoredProgress()[orderId];
  if (!progress) return null;
  memoryProgress.set(orderId, progress);
  return progress;
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

export async function uploadPickupPhoto(orderId, blob, capturedAt = new Date().toISOString()) {
  if (!orderId || !(blob instanceof Blob) || !blob.type.startsWith('image/')) {
    throw new Error('A valid pickup photo is required.');
  }

  const dataUrl = await readBlobAsDataUrl(blob);
  return { blob, dataUrl, capturedAt };
}

export function advanceDeliveryStep(orderId, status, pickupPhoto) {
  if (!orderId || !['arrived', 'picked_up'].includes(status)) {
    throw new Error('The requested delivery step is not supported.');
  }
  if (status === 'picked_up' && !pickupPhoto?.blob && !pickupPhoto?.dataUrl) {
    throw new Error('A pickup photo is required before confirming pickup.');
  }

  const previous = getDeliveryProgress(orderId) || {};
  memoryProgress.set(orderId, {
    ...previous,
    status,
    ...(pickupPhoto ? { pickupPhoto } : {}),
  });
  saveProgress();
  return memoryProgress.get(orderId);
}

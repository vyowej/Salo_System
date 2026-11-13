/**
 * SALO — Business / Restaurant Partner Application Camera Configuration
 * MediaDevices / getUserMedia constraints and compression parameters.
 */

export const CAMERA_FACING_MODES = {
  USER: 'user', // Front-facing camera
  ENVIRONMENT: 'environment', // Rear-facing camera for documents/permits
};

export const PHOTO_DOC_TYPES = [
  'government_id',
  'dti_certificate',
  'sec_certificate',
  'cda_certificate',
  'other_registration',
  'bir_2303',
  'mayors_permit',
  'barangay_clearance',
  'proof_of_address',
  'authorization_letter',
  'sanitary_permit',
  'fire_safety_permit',
  'bank_proof',
];

export const CAMERA_CONFIG = {
  videoConstraints: {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
  },

  compression: {
    maxDimension: 1280,
    mimeType: 'image/jpeg',
    quality: 0.82,
  },

  facingModeMap: {
    government_id: CAMERA_FACING_MODES.ENVIRONMENT,
    default: CAMERA_FACING_MODES.ENVIRONMENT,
  },

  errorMessages: {
    NotAllowedError: 'Camera permission was denied. Please allow camera access in your browser settings, or upload a document file instead.',
    NotFoundError: 'No camera found on this device. Please connect a camera or upload a file.',
    NotReadableError: 'Your camera is currently in use by another application. Please close other camera apps and try again.',
    OverconstrainedError: 'Requested camera resolution is not supported by your device.',
    SecurityError: 'Camera access requires a secure connection (HTTPS or localhost).',
    UnsupportedError: 'In-app camera is not supported in this browser environment. Please upload an image or PDF file.',
    GenericError: 'Unable to access camera. Please check permissions or upload a photo from your device.',
  },
};

export function isPhotoRequirement(docId) {
  if (!docId) return true;
  return true; // All business documents can be captured via camera
}

export function getPreferredFacingMode(docId) {
  if (!docId) return CAMERA_FACING_MODES.ENVIRONMENT;
  return CAMERA_CONFIG.facingModeMap[docId] || CAMERA_FACING_MODES.ENVIRONMENT;
}

/**
 * Compresses an image (Blob, File, or DataURL) to a JPEG data URL via HTML Canvas.
 */
export async function compressImageToDataUrl(imageSource, options = {}) {
  const maxDim = options.maxDimension || CAMERA_CONFIG.compression.maxDimension;
  const quality = options.quality || CAMERA_CONFIG.compression.quality;
  const mimeType = options.mimeType || CAMERA_CONFIG.compression.mimeType;

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return typeof imageSource === 'string' ? imageSource : null;
  }

  return new Promise((resolve) => {
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
          resolve(srcUrl);
          if (shouldRevoke) URL.revokeObjectURL(srcUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL(mimeType, quality);
        if (shouldRevoke) URL.revokeObjectURL(srcUrl);
        resolve(dataUrl);
      } catch (err) {
        console.warn('Image compression fallback', err);
        resolve(srcUrl);
        if (shouldRevoke) URL.revokeObjectURL(srcUrl);
      }
    };

    img.onerror = () => {
      if (shouldRevoke) URL.revokeObjectURL(srcUrl);
      resolve(null);
    };

    img.src = srcUrl;
  });
}

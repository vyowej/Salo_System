/**
 * SALO — Rider Application Camera Configuration
 * Native MediaDevices / getUserMedia constraints and compression parameters.
 */

export const CAMERA_FACING_MODES = {
  USER: 'user', // Front-facing camera for selfies and profile photos
  ENVIRONMENT: 'environment', // Rear-facing camera for documents and vehicle photos
};

export const PHOTO_DOC_TYPES = [
  'selfie_photo',
  'id_front',
  'id_back',
  'driver_license',
  'motorcycle_photo',
  'bicycle_photo',
  'ebike_photo',
  'escooter_photo',
];

export const CAMERA_CONFIG = {
  // Video constraints
  videoConstraints: {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
  },

  // Image compression parameters for canvas capture & local storage safety
  compression: {
    maxDimension: 1280, // Downscale longest edge to max 1280px
    mimeType: 'image/jpeg',
    quality: 0.82, // 82% quality achieves ~100-250KB per image
  },

  // Facing mode preference by document category / type
  facingModeMap: {
    selfie_photo: CAMERA_FACING_MODES.USER,
    id_front: CAMERA_FACING_MODES.ENVIRONMENT,
    id_back: CAMERA_FACING_MODES.ENVIRONMENT,
    motorcycle_photo: CAMERA_FACING_MODES.ENVIRONMENT,
    bicycle_photo: CAMERA_FACING_MODES.ENVIRONMENT,
    ebike_photo: CAMERA_FACING_MODES.ENVIRONMENT,
    escooter_photo: CAMERA_FACING_MODES.ENVIRONMENT,
    default: CAMERA_FACING_MODES.ENVIRONMENT,
  },

  // Friendly human error messages for getUserMedia errors
  errorMessages: {
    NotAllowedError: 'Camera permission was denied. Please allow camera access in your browser settings, or upload an image file instead.',
    NotFoundError: 'No camera found on this device. Please connect a camera or upload a file.',
    NotReadableError: 'Your camera is currently in use by another application. Please close other camera apps and try again.',
    OverconstrainedError: 'Requested camera resolution is not supported by your device.',
    SecurityError: 'Camera access requires a secure connection (HTTPS or localhost).',
    UnsupportedError: 'In-app camera is not supported in this browser environment. Please upload an image file.',
    GenericError: 'Unable to access camera. Please check permissions or upload a photo from your device.',
  },
};

/**
 * Returns whether a document type prefers or supports camera capture.
 */
export function isPhotoRequirement(docId) {
  if (!docId) return false;
  return PHOTO_DOC_TYPES.includes(docId) || docId.toLowerCase().includes('photo');
}

/**
 * Returns preferred facing mode for a document requirement.
 */
export function getPreferredFacingMode(docId) {
  return CAMERA_CONFIG.facingModeMap[docId] || CAMERA_CONFIG.facingModeMap.default;
}

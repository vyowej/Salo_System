import { useState, useEffect, useRef, useCallback } from 'react';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import {
  CAMERA_CONFIG,
  CAMERA_FACING_MODES,
  getPreferredFacingMode,
  compressImageToDataUrl,
} from '../constants/cameraConfig';
import './CameraCaptureModal.css';

function createCaptureFilename(docId) {
  return `${docId || 'document'}_capture_${Date.now()}.jpg`;
}

function createCaptureTimestamp() {
  return new Date().toISOString();
}

export default function CameraCaptureModal({
  isOpen,
  open,
  onClose,
  onCapture,
  onFallbackToFile,
  onTriggerNativeCamera,
  docConfig = {},
}) {
  const isModalOpen = Boolean(open ?? isOpen);
  const { id: docId, title = 'Document Photo' } = docConfig;
  const initialFacingMode = getPreferredFacingMode(docId);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [facingMode, setFacingMode] = useState(initialFacingMode);
  const [cameraState, setCameraState] = useState('init'); // 'init' | 'streaming' | 'captured' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // Stop all active media tracks cleanly
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      try {
        const tracks = streamRef.current.getTracks();
        tracks.forEach((track) => track.stop());
      } catch (err) {
        console.warn('Error stopping media tracks', err);
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Check if device has multiple cameras (front/rear)
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      })
      .catch(() => {});
  }, []);

  // Start video stream when modal is open and in streaming/init mode
  const startCamera = useCallback(
    async (mode) => {
      stopStream();
      setErrorMessage(null);
      setCameraState('init');

      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMessage(CAMERA_CONFIG.errorMessages.UnsupportedError);
        setCameraState('error');
        return;
      }

      try {
        let stream;
        try {
          const constraints = {
            audio: false,
            video: mode
              ? {
                  facingMode: { ideal: mode },
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                }
              : {
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                },
          };
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
          // Fallback to basic unconstrained video
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraState('streaming');
      } catch (err) {
        console.warn('getUserMedia error:', err?.name, err?.message);
        const userMsg =
          CAMERA_CONFIG.errorMessages[err?.name] || CAMERA_CONFIG.errorMessages.GenericError;
        setErrorMessage(userMsg);
        setCameraState('error');
      }
    },
    [stopStream]
  );

  // Initialize camera when opened
  useEffect(() => {
    if (isModalOpen) {
      setCapturedDataUrl(null);
      setFacingMode(initialFacingMode);
      startCamera(initialFacingMode);
    } else {
      stopStream();
      setCameraState('init');
      setCapturedDataUrl(null);
      setErrorMessage(null);
    }

    return () => {
      stopStream();
    };
  }, [isModalOpen, initialFacingMode, startCamera, stopStream]);

  // Flip between front and rear cameras
  const handleToggleFacingMode = () => {
    const nextMode =
      facingMode === CAMERA_FACING_MODES.USER
        ? CAMERA_FACING_MODES.ENVIRONMENT
        : CAMERA_FACING_MODES.USER;
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Capture frame from active video element to HTML5 Canvas
  const handleCaptureSnapshot = () => {
    const video = videoRef.current;
    if (!video || cameraState !== 'streaming') return;

    try {
      const naturalWidth = video.videoWidth || 1280;
      const naturalHeight = video.videoHeight || 720;

      const canvas = document.createElement('canvas');
      canvas.width = naturalWidth;
      canvas.height = naturalHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        setErrorMessage('Failed to capture frame from camera.');
        return;
      }

      // If user front camera, mirror image back for natural view
      if (facingMode === CAMERA_FACING_MODES.USER) {
        ctx.translate(naturalWidth, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0, naturalWidth, naturalHeight);

      const rawDataUrl = canvas.toDataURL(
        CAMERA_CONFIG.compression.mimeType,
        CAMERA_CONFIG.compression.quality
      );

      setCapturedDataUrl(rawDataUrl);
      setCameraState('captured');
      stopStream();
    } catch (err) {
      console.warn('Canvas capture error', err);
      setErrorMessage('Could not capture photo. Please try again or upload a file.');
    }
  };

  // Retake photo
  const handleRetake = () => {
    setCapturedDataUrl(null);
    startCamera(facingMode);
  };

  const handleCloseModal = () => {
    stopStream();
    onClose?.();
  };

  // Confirm photo
  const handleConfirmPhoto = async () => {
    if (!capturedDataUrl) return;

    setIsProcessing(true);
    try {
      const compressedDataUrl = await compressImageToDataUrl(capturedDataUrl);
      const estSize = Math.round((compressedDataUrl.length * 3) / 4);

      onCapture?.(docId, {
        dataUrl: compressedDataUrl,
        previewUrl: compressedDataUrl,
        name: createCaptureFilename(docId),
        size: estSize,
        type: 'image/jpeg',
        uploadedAt: createCaptureTimestamp(),
        isCaptured: true,
      });

      handleCloseModal();
    } catch (err) {
      console.warn('Photo processing failed', err);
      setErrorMessage('Failed to process captured image.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTriggerNativeFallback = () => {
    handleCloseModal();
    onTriggerNativeCamera?.();
  };

  const handleTriggerFileFallback = () => {
    handleCloseModal();
    onFallbackToFile?.();
  };

  return (
    <Modal
      open={isModalOpen}
      isOpen={isModalOpen}
      onClose={handleCloseModal}
      title={`Take Photo: ${title}`}
      size="md"
    >
      <div className="camera-modal-container">
        {/* Error State */}
        {cameraState === 'error' && (
          <div className="camera-modal-error-view">
            <div className="camera-error-icon" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h4 className="camera-error-title">Camera Unavailable</h4>
            <p className="camera-error-message">{errorMessage}</p>

            <div className="camera-error-actions">
              <Button type="button" variant="primary" onClick={handleTriggerNativeFallback}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>Use Device Native Camera</span>
              </Button>

              <Button type="button" variant="outline" onClick={handleTriggerFileFallback}>
                <span>Choose Document from Device</span>
              </Button>
            </div>
          </div>
        )}

        {/* Live Video Viewfinder */}
        {cameraState === 'streaming' && (
          <div className="camera-viewfinder-wrapper">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`camera-video-feed ${facingMode === CAMERA_FACING_MODES.USER ? 'mirrored' : ''}`}
            />

            {/* Document Guide Overlay */}
            <div className="camera-overlay-frame document-frame">
              <div className="frame-corner top-left" />
              <div className="frame-corner top-right" />
              <div className="frame-corner bottom-left" />
              <div className="frame-corner bottom-right" />
              <div className="frame-guide-label">Center document inside frame</div>
            </div>

            {/* Top controls: Camera Flip */}
            {hasMultipleCameras && (
              <div className="camera-top-controls">
                <button
                  type="button"
                  className="camera-ctrl-btn"
                  onClick={handleToggleFacingMode}
                  title="Switch camera"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" />
                    <polyline points="4 8 8 4 12 8" />
                    <polyline points="20 16 16 20 12 16" />
                  </svg>
                  <span>Flip</span>
                </button>
              </div>
            )}

            {/* Bottom Shutter Controls */}
            <div className="camera-shutter-bar">
              <button
                type="button"
                className="camera-shutter-btn"
                onClick={handleCaptureSnapshot}
                title="Take photo"
                aria-label="Capture photo"
              >
                <span className="shutter-inner-ring" />
              </button>
            </div>
          </div>
        )}

        {/* Captured Snapshot Review View */}
        {cameraState === 'captured' && capturedDataUrl && (
          <div className="camera-preview-wrapper">
            <div className="camera-preview-image-box">
              <img src={capturedDataUrl} alt="Captured preview" className="camera-preview-image" />
              <div className="camera-preview-badge">Snapshot Captured ✓</div>
            </div>

            <div className="camera-preview-actions">
              <Button type="button" variant="outline" onClick={handleRetake} disabled={isProcessing}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                <span>Retake</span>
              </Button>

              <Button
                type="button"
                variant="primary"
                onClick={handleConfirmPhoto}
                loading={isProcessing}
                disabled={isProcessing}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Use This Photo</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

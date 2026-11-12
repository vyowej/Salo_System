import { useState, useEffect, useRef, useCallback } from 'react';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import {
  CAMERA_CONFIG,
  CAMERA_FACING_MODES,
  getPreferredFacingMode,
} from '../constants/cameraConfig';
import { compressImageToDataUrl } from '../services/riderDraftStorage';
import './CameraCaptureModal.css';

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
        tracks.forEach((track) => {
          track.stop();
        });
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
      .catch(() => {
        // Ignore device enumeration errors
      });
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
          // Attempt 1: Optimal resolution & preferred facingMode
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
        } catch (firstErr) {
          // Attempt 2: If overconstrained, fallback to basic unconstrained video
          if (
            firstErr.name === 'OverconstrainedError' ||
            firstErr.name === 'ConstraintNotSatisfiedError' ||
            firstErr.name === 'NotFoundError'
          ) {
            stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
          } else {
            throw firstErr;
          }
        }

        streamRef.current = stream;
        setCameraState('streaming');

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {
            // Autoplay policies might delay play until user interaction; ignore
          }
        }
      } catch (err) {
        console.warn('getUserMedia error:', err);
        const errorKey = err.name || 'GenericError';
        const userMsg =
          CAMERA_CONFIG.errorMessages[errorKey] ||
          CAMERA_CONFIG.errorMessages.GenericError;
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

  // Ensure video element receives stream once rendered
  useEffect(() => {
    if (videoRef.current && streamRef.current && cameraState === 'streaming') {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [cameraState]);

  // Flip facing mode
  const handleToggleFacingMode = () => {
    const nextMode =
      facingMode === CAMERA_FACING_MODES.USER
        ? CAMERA_FACING_MODES.ENVIRONMENT
        : CAMERA_FACING_MODES.USER;
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Capture current video frame onto canvas
  const handleCaptureFrame = async () => {
    if (!videoRef.current || cameraState !== 'streaming') return;

    setIsProcessing(true);
    try {
      const video = videoRef.current;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');

      // Mirror horizontally if using front/selfie camera so preview matches mirror expectation
      if (facingMode === CAMERA_FACING_MODES.USER) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0, width, height);

      // Raw capture data URL
      const rawDataUrl = canvas.toDataURL('image/jpeg', 0.95);

      // Apply storage-safe compression
      const compressedDataUrl = await compressImageToDataUrl(rawDataUrl, {
        maxDimension: CAMERA_CONFIG.compression.maxDimension,
        quality: CAMERA_CONFIG.compression.quality,
      });

      // Pause and stop the live stream while reviewing captured photo
      stopStream();
      setCapturedDataUrl(compressedDataUrl);
      setCameraState('captured');
    } catch (err) {
      console.warn('Error capturing photo from video stream', err);
      setErrorMessage('Failed to capture frame from camera. Please try again.');
      setCameraState('error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Retake photo: discard snapshot and restart stream
  const handleRetake = () => {
    setCapturedDataUrl(null);
    startCamera(facingMode);
  };

  // Confirm photo usage
  const handleUsePhoto = () => {
    if (!capturedDataUrl) return;

    const timestamp = Date.now();
    const fileName = `${docId || 'photo'}_${timestamp}.jpg`;

    // Estimate file size in bytes from base64 string
    const stringLength = capturedDataUrl.length - 'data:image/jpeg;base64,'.length;
    const estimatedSizeBytes = Math.round(stringLength * 0.75);

    const docPayload = {
      id: docId,
      name: fileName,
      size: estimatedSizeBytes,
      type: 'image/jpeg',
      dataUrl: capturedDataUrl,
      previewUrl: capturedDataUrl,
      uploadedAt: new Date().toISOString(),
      isCaptured: true,
    };

    stopStream();
    onCapture?.(docId, docPayload);
    onClose?.();
  };

  // Fallback to file picker if camera fails or user prefers
  const handleFallback = () => {
    stopStream();
    onClose?.();
    onFallbackToFile?.();
  };

  // Trigger device native camera directly
  const handleTriggerNativeCamera = () => {
    stopStream();
    onClose?.();
    if (onTriggerNativeCamera) {
      onTriggerNativeCamera();
    } else {
      onFallbackToFile?.();
    }
  };

  const handleModalClose = () => {
    stopStream();
    onClose?.();
  };

  const isSelfie = docId === 'selfie_photo';

  return (
    <Modal
      open={isModalOpen}
      isOpen={isModalOpen}
      onClose={handleModalClose}
      title={`Take Photo — ${title}`}
      size="md"
    >
      <div className="camera-modal-content">
        <div className="camera-viewfinder-container">
          {cameraState === 'captured' && capturedDataUrl ? (
            <div className="camera-preview-frozen">
              <img
                src={capturedDataUrl}
                alt={`Captured ${title}`}
                className="camera-captured-img"
              />
              <div className="camera-overlay-badge">
                <span>Preview Capture</span>
              </div>
            </div>
          ) : (
            <div className="camera-video-wrapper">
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                onLoadedMetadata={() => {
                  if (videoRef.current && streamRef.current) {
                    videoRef.current.play().catch(() => {});
                  }
                }}
                className={`camera-video-stream ${facingMode === CAMERA_FACING_MODES.USER ? 'is-mirrored' : ''}`}
              />

              {/* Viewfinder guides */}
              <div className={`camera-viewfinder-overlay ${isSelfie ? 'selfie-guide' : 'card-guide'}`}>
                <div className="camera-guide-frame" />
                <span className="camera-guide-label">
                  {isSelfie ? 'Position your face within the frame' : 'Align document within borders'}
                </span>
              </div>

              {cameraState === 'init' && (
                <div className="camera-loading-overlay">
                  <div className="camera-spinner" />
                  <span>Connecting to camera...</span>
                </div>
              )}
            </div>
          )}

          {cameraState === 'error' && (
            <div className="camera-error-banner" role="alert">
              <div className="camera-error-icon" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <p className="camera-error-text">{errorMessage}</p>
              <div className="camera-error-actions">
                <Button type="button" variant="primary" size="sm" onClick={() => startCamera(facingMode)}>
                  Retry Camera
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleTriggerNativeCamera}>
                  Use Device Camera App
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={handleFallback}>
                  Upload File Instead
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls Toolbar */}
        <div className="camera-modal-actions">
          {cameraState === 'captured' ? (
            <div className="camera-controls-row">
              <Button
                type="button"
                variant="outline"
                onClick={handleRetake}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
                </svg>
                <span>Retake Photo</span>
              </Button>

              <Button
                type="button"
                variant="primary"
                onClick={handleUsePhoto}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Use Photo</span>
              </Button>
            </div>
          ) : (
            <div className="camera-controls-row">
              {hasMultipleCameras && cameraState === 'streaming' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleToggleFacingMode}
                  title="Switch front/rear camera"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M23 4v6h-6" />
                    <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                  </svg>
                  <span>Flip Camera</span>
                </Button>
              )}

              <Button
                type="button"
                variant="primary"
                onClick={handleCaptureFrame}
                disabled={cameraState !== 'streaming' || isProcessing}
                loading={isProcessing}
                className="camera-shutter-btn"
              >
                <span className="shutter-circle-icon" aria-hidden="true" />
                <span>Capture Photo</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTriggerNativeCamera}
                title="Use phone or operating system camera app"
              >
                Device Camera App
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleFallback}
                title="Switch to file upload"
              >
                Upload File Instead
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import {
  CAMERA_CONFIG,
  CAMERA_FACING_MODES,
  compressImageToDataUrl,
} from '../../pages/BusinessApplication/constants/cameraConfig';
import './CameraCaptureModal.css';

function createCaptureFilename(docId) {
  return `${docId || 'document'}_capture_${Date.now()}.jpg`;
}

/**
 * Shared Camera Capture Modal for Restaurant Partner and Rider Applications.
 * Supports distinct states: permission/request (init), live preview (streaming),
 * captured preview (captured), and error fallback (error).
 */
export default function CameraCaptureModal({
  isOpen,
  open,
  onClose,
  onCapture,
  onFallbackToFile,
  onTriggerNativeCamera,
  docConfig = {},
  preferredFacingMode,
}) {
  const isModalOpen = Boolean(open ?? isOpen);
  const { id: docId, title = 'Document Photo', description = '' } = docConfig;
  const isSelfie = docId === 'selfie_photo' || docConfig?.guideType === 'selfie';
  const initialFacingMode =
    preferredFacingMode || (isSelfie ? CAMERA_FACING_MODES.USER : CAMERA_FACING_MODES.ENVIRONMENT);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [facingMode, setFacingMode] = useState(initialFacingMode);
  const [cameraState, setCameraState] = useState('init'); // 'init' | 'streaming' | 'captured' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.warn('Error stopping media tracks', err);
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

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

  const attachStreamToVideo = useCallback(async (stream) => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch {
        // Ignore autoplay interruption; onLoadedMetadata handles playback
      }
    }
  }, []);

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
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        streamRef.current = stream;
        await attachStreamToVideo(stream);
        setCameraState('streaming');
      } catch (err) {
        console.warn('getUserMedia error:', err?.name, err?.message);
        const userMsg =
          CAMERA_CONFIG.errorMessages[err?.name] || CAMERA_CONFIG.errorMessages.GenericError;
        setErrorMessage(userMsg);
        setCameraState('error');
      }
    },
    [stopStream, attachStreamToVideo]
  );

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

  const handleToggleFacingMode = () => {
    const nextMode =
      facingMode === CAMERA_FACING_MODES.USER
        ? CAMERA_FACING_MODES.ENVIRONMENT
        : CAMERA_FACING_MODES.USER;
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

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
        setCameraState('error');
        return;
      }

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
      setCameraState('error');
    }
  };

  const handleRetake = () => {
    setCapturedDataUrl(null);
    startCamera(facingMode);
  };

  const handleCloseModal = () => {
    stopStream();
    onClose?.();
  };

  const handleConfirmPhoto = async () => {
    if (!capturedDataUrl) return;

    setIsProcessing(true);
    try {
      const compressedDataUrl = await compressImageToDataUrl(capturedDataUrl);
      const base64Length = (compressedDataUrl || '').split(',')[1]?.length || 0;
      const estSize = Math.round(base64Length * 0.75);

      onCapture?.(docId, {
        id: docId,
        dataUrl: compressedDataUrl,
        previewUrl: compressedDataUrl,
        name: createCaptureFilename(docId),
        size: estSize,
        type: 'image/jpeg',
        uploadedAt: new Date().toISOString(),
        isCaptured: true,
      });

      handleCloseModal();
    } catch (err) {
      console.warn('Photo processing failed', err);
      setErrorMessage('Failed to process captured image. Please try again.');
      setCameraState('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTriggerNativeFallback = () => {
    handleCloseModal();
    if (onTriggerNativeCamera) {
      onTriggerNativeCamera();
    } else {
      onFallbackToFile?.();
    }
  };

  const handleTriggerFileFallback = () => {
    handleCloseModal();
    onFallbackToFile?.();
  };

  const instructionText =
    description ||
    (isSelfie
      ? 'Position your face clearly in the center with good lighting and no sunglasses.'
      : 'Place the entire document inside the frame on a flat, well-lit surface so all text is readable.');

  return (
    <Modal
      open={isModalOpen}
      isOpen={isModalOpen}
      onClose={handleCloseModal}
      title={`Take Photo: ${title}`}
      size="md"
    >
      <div className="salo-camera-modal">
        {/* Clear Instruction Banner */}
        <div className="salo-camera-instructions">
          <span className="salo-camera-instruction-icon" aria-hidden="true">
            {isSelfie ? '🤳' : '📄'}
          </span>
          <p className="salo-camera-instruction-text">{instructionText}</p>
        </div>

        {/* Viewport Stage */}
        <div className="salo-camera-stage">
          {/* State 1 & 2: Permission / Requesting & Live Preview */}
          {(cameraState === 'init' || cameraState === 'streaming') && (
            <div className="salo-camera-viewfinder">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={() => {
                  if (videoRef.current && streamRef.current) {
                    videoRef.current.play().catch(() => {});
                  }
                }}
                className={`salo-camera-video ${facingMode === CAMERA_FACING_MODES.USER ? 'is-mirrored' : ''}`}
              />

              {cameraState === 'init' && (
                <div className="salo-camera-permission-overlay" role="status">
                  <div className="salo-camera-spinner" aria-hidden="true" />
                  <strong className="salo-camera-status-title">Requesting Camera Access</strong>
                  <span className="salo-camera-status-hint">
                    Allow camera permission in your browser prompt to continue.
                  </span>
                </div>
              )}

              {cameraState === 'streaming' && (
                <>
                  <div className={`salo-camera-guide ${isSelfie ? 'is-selfie' : 'is-document'}`}>
                    <div className="salo-camera-guide-box">
                      <span className="guide-corner tl" />
                      <span className="guide-corner tr" />
                      <span className="guide-corner bl" />
                      <span className="guide-corner br" />
                    </div>
                    <span className="salo-camera-guide-caption">
                      {isSelfie ? 'Center your face within the oval' : 'Align document inside frame'}
                    </span>
                  </div>

                  {hasMultipleCameras && (
                    <button
                      type="button"
                      className="salo-camera-flip-btn"
                      onClick={handleToggleFacingMode}
                      title="Switch between front and rear camera"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M20 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" />
                        <polyline points="4 8 8 4 12 8" />
                        <polyline points="20 16 16 20 12 16" />
                      </svg>
                      <span>Flip Camera</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* State 4: Captured Photo Preview */}
          {cameraState === 'captured' && capturedDataUrl && (
            <div className="salo-camera-preview">
              <img
                src={capturedDataUrl}
                alt={`Captured preview for ${title}`}
                className="salo-camera-preview-img"
              />
              <span className="salo-camera-preview-badge">Photo Captured ✓</span>
            </div>
          )}

          {/* Error / Unavailable State */}
          {cameraState === 'error' && (
            <div className="salo-camera-error" role="alert">
              <div className="salo-camera-error-icon" aria-hidden="true">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h4 className="salo-camera-error-title">Camera Unavailable</h4>
              <p className="salo-camera-error-msg">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* Consistent Footer Controls */}
        <div className="salo-camera-footer">
          {cameraState === 'init' && (
            <>
              <Button type="button" variant="outline" size="md" onClick={handleTriggerFileFallback}>
                Upload File Instead
              </Button>
              <Button type="button" variant="ghost" size="md" onClick={handleCloseModal}>
                Cancel
              </Button>
            </>
          )}

          {cameraState === 'streaming' && (
            <>
              <Button type="button" variant="outline" size="md" onClick={handleTriggerFileFallback}>
                Upload File
              </Button>
              <Button type="button" variant="primary" size="md" onClick={handleCaptureSnapshot}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>Capture Photo</span>
              </Button>
            </>
          )}

          {cameraState === 'captured' && (
            <>
              <Button type="button" variant="outline" size="md" onClick={handleRetake} disabled={isProcessing}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                <span>Retake Photo</span>
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleConfirmPhoto}
                loading={isProcessing}
                disabled={isProcessing}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Use This Photo</span>
              </Button>
            </>
          )}

          {cameraState === 'error' && (
            <>
              <Button type="button" variant="outline" size="md" onClick={handleTriggerFileFallback}>
                Upload File
              </Button>
              {onTriggerNativeCamera && (
                <Button type="button" variant="outline" size="md" onClick={handleTriggerNativeFallback}>
                  Device Camera
                </Button>
              )}
              <Button type="button" variant="primary" size="md" onClick={() => startCamera(facingMode)}>
                Retry Camera
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

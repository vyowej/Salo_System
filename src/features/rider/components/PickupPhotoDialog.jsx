import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '../../../components/common/Button';
import { formatDateTime } from '../utils/format';
import './PickupPhotoDialog.css';

const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1280;

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    const tryQuality = (quality) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('The photo could not be processed. Please try again.'));
          return;
        }
        if (blob.size <= MAX_PHOTO_BYTES) {
          resolve(blob);
          return;
        }
        const nextQuality = quality - 0.1;
        if (nextQuality < 0.4) {
          reject(new Error('The photo is too large to use. Please take another photo.'));
          return;
        }
        tryQuality(nextQuality);
      }, 'image/jpeg', quality);
    };

    tryQuality(0.7);
  });
}

async function optimizeImage(blob) {
  if (!blob.type.startsWith('image/')) {
    throw new Error('Choose an image file to continue.');
  }

  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('The photo could not be processed. Please try again.');
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasToJpeg(canvas);
}

export default function PickupPhotoDialog({ open, onClose, onConfirm }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);
  const previewUrlRef = useRef('');
  const [cameraAvailable, setCameraAvailable] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraAvailable(false);
  }

  function clearPhoto() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = '';
    setPhoto(null);
    setError('');
  }

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const panel = dialogRef.current;
    panel?.querySelector('button')?.focus();
    setPhoto(null);
    setError('');

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;

      const focusable = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled)')]
        .filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.classList.add('pickup-photo-dialog-open');
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('pickup-photo-dialog-open');
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
      previousFocus?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    async function startCamera() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraMessage('Camera access is unavailable here. You can take or choose a photo instead.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        setCameraAvailable(true);
        setCameraMessage('');
      } catch {
        setCameraMessage('Camera access was denied or no camera was found. You can take or choose a photo instead.');
      }
    }

    startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [cameraAttempt, open]);

  useEffect(() => {
    if (cameraAvailable && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {
        setCameraMessage('Camera preview could not start. You can take or choose a photo instead.');
        stopCamera();
      });
    }
  }, [cameraAvailable]);

  if (!open) return null;

  async function processImageFile(blob) {
    try {
      const optimizedBlob = await optimizeImage(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = URL.createObjectURL(optimizedBlob);
      setPhoto({ blob: optimizedBlob, previewUrl: previewUrlRef.current, capturedAt: new Date().toISOString() });
      setError('');
      stopCamera();
    } catch (imageError) {
      setError(imageError.message || 'The selected image could not be processed.');
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) {
      setError('Wait for the camera preview, then try again.');
      return;
    }

    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      setError('The photo could not be processed. Please try again.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedAt = new Date().toISOString();
    try {
      const blob = await canvasToJpeg(canvas);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = URL.createObjectURL(blob);
      setPhoto({ blob, previewUrl: previewUrlRef.current, capturedAt });
      setError('');
      stopCamera();
    } catch (captureError) {
      setError(captureError.message || 'The photo could not be processed. Please try again.');
      stopCamera();
    }
  }

  function retakePhoto() {
    clearPhoto();
    setCameraMessage('Starting camera...');
    setCameraAttempt((attempt) => attempt + 1);
  }

  async function confirmPickup() {
    if (!photo) return;
    setIsSaving(true);
    try {
      await onConfirm(photo.blob, photo.capturedAt);
      onClose();
    } catch (confirmError) {
      setError(confirmError.message || 'Pickup could not be confirmed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return createPortal(
    <div
      className="pickup-photo-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="pickup-photo-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pickup-photo-title"
        tabIndex="-1"
      >
        <header className="pickup-photo-header">
          <div>
            <h2 id="pickup-photo-title">Take pickup photo</h2>
            <p>Take a clear photo of the order bag or receipt.</p>
          </div>
          <button type="button" className="pickup-photo-close" onClick={onClose} aria-label="Close dialog">×</button>
        </header>

        <div className="pickup-photo-content">
          {photo ? (
            <div className="pickup-photo-preview-wrap">
              <img src={photo.previewUrl} alt="Pickup photo preview" className="pickup-photo-preview" />
              <p className="pickup-photo-time">Captured {formatDateTime(photo.capturedAt)} (Manila time)</p>
            </div>
          ) : (
            <>
              {cameraAvailable && (
                <div className="pickup-camera-preview-wrap">
                  <video ref={videoRef} className="pickup-camera-preview" autoPlay playsInline muted aria-label="Live camera preview" />
                  <Button type="button" variant="primary" onClick={capturePhoto}>Capture</Button>
                </div>
              )}
              {cameraMessage && <p className="pickup-camera-message" role="status">{cameraMessage}</p>}
              <input
                ref={fileInputRef}
                className="pickup-photo-file-input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) processImageFile(file);
                  event.target.value = '';
                }}
              />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                Take or choose photo
              </Button>
            </>
          )}
          {error && <p className="pickup-photo-error" role="alert">{error}</p>}
        </div>

        <footer className="pickup-photo-footer">
          {photo ? (
            <>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
              <Button type="button" variant="outline" onClick={retakePhoto} disabled={isSaving}>Retake</Button>
              <Button type="button" variant="primary" onClick={confirmPickup} disabled={!photo || isSaving} loading={isSaving}>Confirm pickup</Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}

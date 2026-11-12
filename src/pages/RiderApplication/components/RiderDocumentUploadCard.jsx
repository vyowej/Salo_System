import { useState, useRef } from 'react';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import CameraCaptureModal from './CameraCaptureModal';
import { isPhotoRequirement } from '../constants/cameraConfig';
import { compressImageToDataUrl } from '../services/riderDraftStorage';
import './RiderDocumentUploadCard.css';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const VALID_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function RiderDocumentUploadCard({
  docConfig,
  currentDoc = null,
  onUpload,
  onRemove,
  error = null,
}) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [localError, setLocalError] = useState(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);

  const {
    id,
    title,
    description,
    required = false,
    acceptedFormats = 'JPG, PNG, PDF',
  } = docConfig;

  const isPhoto = isPhotoRequirement(id) || id === 'driver_license';
  const isSelfie = id === 'selfie_photo';

  const handleFileProcess = async (file) => {
    if (!file) return;

    setLocalError(null);

    if (!VALID_MIME_TYPES.includes(file.type)) {
      setLocalError(`Unsupported file format. Please upload a JPG, PNG, or PDF file.`);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setLocalError(`File size exceeds 10 MB limit (${formatBytes(file.size)}). Please choose a smaller file.`);
      return;
    }

    setUploadProgress(20);

    try {
      let previewUrl = null;
      let dataUrl = null;

      if (file.type.startsWith('image/')) {
        // Compress image to compact JPEG data URL for local storage compatibility
        dataUrl = await compressImageToDataUrl(file);
        previewUrl = dataUrl;
      } else {
        previewUrl = URL.createObjectURL(file);
      }

      setUploadProgress(70);

      setTimeout(() => {
        setUploadProgress(100);

        onUpload?.(id, {
          file: file.type.startsWith('image/') ? null : file,
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl,
          previewUrl,
          uploadedAt: new Date().toISOString(),
          isCaptured: false,
        });

        setUploadProgress(null);
      }, 200);
    } catch (err) {
      console.warn('Failed to process uploaded file', err);
      setLocalError('Failed to process image file. Please try another image.');
      setUploadProgress(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileProcess(e.target.files[0]);
    }
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    if (currentDoc?.previewUrl && !currentDoc?.previewUrl.startsWith('data:')) {
      try {
        URL.revokeObjectURL(currentDoc.previewUrl);
      } catch {
        // ignore
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
    setLocalError(null);
    onRemove?.(id);
  };

  // Called when camera captures photo successfully
  const handleCameraCapture = (_docId, payload) => {
    setLocalError(null);
    onUpload?.(id, payload);
  };

  // Open in-app live camera modal, or trigger device native camera
  const handleOpenPhotoCapture = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      setCameraModalOpen(true);
    } else if (cameraInputRef.current) {
      cameraInputRef.current.click();
    } else {
      fileInputRef.current?.click();
    }
  };

  const isUploaded = Boolean(currentDoc && (currentDoc.name || currentDoc.dataUrl || currentDoc.previewUrl));
  const isImage = currentDoc?.type?.startsWith('image/') || Boolean(currentDoc?.dataUrl) || isPhoto;
  const imageSrc = currentDoc?.dataUrl || currentDoc?.previewUrl;

  return (
    <div className={`rider-doc-card ${isUploaded ? 'uploaded' : ''} ${error || localError ? 'has-error' : ''}`}>
      <div className="rider-doc-header">
        <div className="rider-doc-titles">
          <div className="rider-doc-badges">
            <h4 className="rider-doc-title">{title}</h4>
            {required ? (
              <Badge variant="warning" size="sm">Required</Badge>
            ) : (
              <Badge variant="neutral" size="sm">Optional</Badge>
            )}
            {isPhoto && (
              <Badge variant="info" size="sm">Camera Supported</Badge>
            )}
          </div>
          {description && <p className="rider-doc-desc">{description}</p>}
        </div>
      </div>

      {/* Hidden file input for file picker fallback */}
      <input
        ref={fileInputRef}
        type="file"
        id={`rider-doc-input-${id}`}
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        className="rider-file-input"
        onChange={handleInputChange}
        aria-label={`Upload ${title}`}
      />

      {/* Hidden camera input for direct native device camera capture */}
      <input
        ref={cameraInputRef}
        type="file"
        id={`rider-doc-camera-${id}`}
        accept="image/*"
        capture={isSelfie ? 'user' : 'environment'}
        className="rider-file-input"
        onChange={handleInputChange}
        aria-label={`Capture photo of ${title}`}
      />

      {uploadProgress !== null && (
        <div className="rider-uploading-progress" role="status">
          <div className="rider-progress-label">
            <span>Processing document...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="rider-progress-track">
            <div className="rider-progress-bar" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {isUploaded && uploadProgress === null ? (
        <div className="rider-file-preview-card">
          <div className="rider-preview-left">
            {isImage && imageSrc ? (
              <div className="rider-thumb-wrap">
                <img src={imageSrc} alt={currentDoc.name || title} className="rider-img-thumb" />
              </div>
            ) : (
              <div className="rider-icon-badge" aria-label="PDF Document">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <line x1="10" y1="9" x2="8" y2="9" />
                </svg>
                <span className="rider-icon-sub">PDF</span>
              </div>
            )}

            <div className="rider-meta-info">
              <span className="rider-filename" title={currentDoc.name || 'Captured Document'}>
                {currentDoc.name || 'Photo captured'}
              </span>
              <span className="rider-filesize">
                {formatBytes(currentDoc.size)} • {currentDoc.isCaptured ? 'Captured via camera ✓' : 'File uploaded ✓'}
              </span>
            </div>
          </div>

          <div className="rider-preview-actions">
            {isPhoto && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenPhotoCapture}
                title="Retake photo using camera"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>Retake</span>
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Replace
            </Button>
            <Button
              type="button"
              variant="danger-outline"
              size="sm"
              onClick={handleRemove}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="rider-upload-options-container">
          {/* If photo requirement: present prominent Take Photo button + file dropzone */}
          {isPhoto ? (
            <div className="rider-photo-actions-grid">
              <button
                type="button"
                className="rider-camera-trigger-card"
                onClick={handleOpenPhotoCapture}
              >
                <div className="camera-trigger-icon-circle">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <div className="camera-trigger-text">
                  <strong className="camera-trigger-title">Take Photo with Camera</strong>
                  <span className="camera-trigger-hint">Use your front or rear camera directly</span>
                </div>
              </button>

              <div
                className={`rider-dropzone rider-dropzone-compact ${dragOver ? 'drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              >
                <div className="rider-dropzone-content">
                  <div className="rider-dropzone-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <div className="rider-dropzone-text">
                    <span className="rider-dropzone-prompt">
                      Or <strong className="rider-link-text">upload file</strong> from device
                    </span>
                    <span className="rider-dropzone-hint">{acceptedFormats} (Max 10 MB)</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              className={`rider-dropzone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            >
              <div className="rider-dropzone-content">
                <div className="rider-dropzone-icon" aria-hidden="true">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div className="rider-dropzone-text">
                  <span className="rider-dropzone-prompt">
                    <strong className="rider-link-text">Click to upload</strong> or drag and drop
                  </span>
                  <span className="rider-dropzone-hint">{acceptedFormats} (Max 10 MB)</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {(localError || error) && (
        <div className="rider-doc-error-message" role="alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{localError || error}</span>
        </div>
      )}

      {/* Real In-App Live Camera Modal with Native Fallback */}
      <CameraCaptureModal
        open={cameraModalOpen}
        isOpen={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCapture={handleCameraCapture}
        onFallbackToFile={() => fileInputRef.current?.click()}
        onTriggerNativeCamera={() => cameraInputRef.current?.click()}
        docConfig={docConfig}
      />
    </div>
  );
}

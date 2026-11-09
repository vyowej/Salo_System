import { useState, useRef } from 'react';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
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
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [localError, setLocalError] = useState(null);

  const {
    id,
    title,
    description,
    required = false,
    acceptedFormats = 'JPG, PNG, PDF',
  } = docConfig;

  const handleFileProcess = (file) => {
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

    // Simulated progress bar
    setUploadProgress(15);
    const step1 = setTimeout(() => setUploadProgress(65), 100);
    const step2 = setTimeout(() => {
      setUploadProgress(100);
      const isImage = file.type.startsWith('image/');
      const previewUrl = isImage ? URL.createObjectURL(file) : null;

      onUpload?.(id, {
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        previewUrl,
        uploadedAt: new Date().toISOString(),
      });

      setUploadProgress(null);
    }, 250);

    return () => {
      clearTimeout(step1);
      clearTimeout(step2);
    };
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
    if (currentDoc?.previewUrl) {
      try {
        URL.revokeObjectURL(currentDoc.previewUrl);
      } catch {
        // ignore
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setLocalError(null);
    onRemove?.(id);
  };

  const isUploaded = Boolean(currentDoc && currentDoc.name);
  const isImage = currentDoc?.type?.startsWith('image/');

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
          </div>
          {description && <p className="rider-doc-desc">{description}</p>}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        id={`rider-doc-input-${id}`}
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        className="rider-file-input"
        onChange={handleInputChange}
        aria-label={`Upload ${title}`}
      />

      {uploadProgress !== null && (
        <div className="rider-uploading-progress" role="status">
          <div className="rider-progress-label">
            <span>Uploading document...</span>
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
            {isImage && currentDoc.previewUrl ? (
              <div className="rider-thumb-wrap">
                <img src={currentDoc.previewUrl} alt={currentDoc.name} className="rider-img-thumb" />
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
              <span className="rider-filename" title={currentDoc.name}>{currentDoc.name}</span>
              <span className="rider-filesize">{formatBytes(currentDoc.size)} • Ready for review</span>
            </div>
          </div>

          <div className="rider-preview-actions">
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
    </div>
  );
}

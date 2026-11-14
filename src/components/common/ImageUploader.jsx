import { useCallback, useEffect, useId, useRef, useState } from 'react';
import restaurantService, { buildRestaurantStoragePath } from '../../services/restaurantService';
import Button from './Button';
import './ImageUploader.css';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MIN_DIMENSION = 300;

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function validateFileBasic(file) {
  if (!file) return 'Choose an image to upload.';
  if (!ACCEPTED_TYPES.has(file.type)) {
    return 'Unsupported file format. Please choose a JPG, PNG, or WebP image.';
  }
  if (file.size > MAX_FILE_BYTES) {
    return `The selected image is ${formatFileSize(file.size)}. Maximum allowed size is 5 MB.`;
  }
  return null;
}

function inspectImageDimensions(file) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined' || typeof URL === 'undefined') {
      resolve({ width: MIN_DIMENSION, height: MIN_DIMENSION });
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width || 0;
      const height = img.naturalHeight || img.height || 0;
      URL.revokeObjectURL(objectUrl);
      resolve({ width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The selected file could not be decoded as a valid image.'));
    };
    img.src = objectUrl;
  });
}

function ImagePreview({ image, alt, onAltChange, onRemove, onMove, onError, busy }) {
  const [src, setSrc] = useState(image?.src || '');
  const imageId = image?.id;
  const imageSource = image?.src;

  useEffect(() => {
    let active = true;
    if (imageId) {
      restaurantService.getImageUrl({ id: imageId, src: imageSource, path: image?.path }).then((url) => {
        if (active) setSrc(url || '');
      }).catch((error) => {
        if (active) {
          setSrc('');
          onError?.(error.message || 'Unable to load the saved image preview.');
        }
      });
    } else {
      setSrc(imageSource || '');
    }

    return () => {
      active = false;
    };
  }, [imageId, imageSource, image?.path, onError]);

  return (
    <div className="image-uploader-item">
      <div className="image-uploader-item-frame">
        {src ? <img src={src} alt={alt || ''} className="image-uploader-preview" /> : (
          <div className="image-uploader-preview image-uploader-preview-empty" aria-label="Image preview unavailable">No preview</div>
        )}
      </div>
      <label className="image-uploader-alt">
        Alt text
        <input
          type="text"
          value={alt || ''}
          onChange={(event) => onAltChange(event.target.value)}
          disabled={busy}
          placeholder="Describe this image for customers"
        />
      </label>
      <div className="image-uploader-item-actions">
        {onMove && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => onMove(-1)} disabled={busy} aria-label="Move image left">Move left</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onMove(1)} disabled={busy} aria-label="Move image right">Move right</Button>
          </>
        )}
        <Button type="button" variant="danger-outline" size="sm" onClick={onRemove} disabled={busy}>Remove</Button>
      </div>
    </div>
  );
}

function ImageUploader({
  value = null,
  onChange,
  onStagedPreviewChange,
  label = 'Image',
  id,
  deferCleanup = false,
  variant = 'default',
  restaurantId = '{restaurant_id}',
  storageCategory = 'menu',
  stageBeforeUpload = false,
  helperText,
}) {
  const generatedId = useId();
  const inputId = id || `image-upload-${generatedId}`;
  const inputRef = useRef(null);
  const temporaryUrlRef = useRef(null);
  const progressTimerRef = useRef(null);

  const [savedPreviewUrl, setSavedPreviewUrl] = useState(value?.src || '');
  const [stagedFile, setStagedFile] = useState(null);
  const [stagedMeta, setStagedMeta] = useState(null);
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState('');
  const [alt, setAlt] = useState(value?.alt || '');
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setAlt(value?.alt || '');
  }, [value?.alt]);

  useEffect(() => {
    let active = true;
    if (value?.id || value?.path) {
      restaurantService.getImageUrl({ id: value.id, src: value.src, path: value.path }).then((url) => {
        if (active) setSavedPreviewUrl(url || '');
      }).catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load the saved image preview.');
      });
    } else {
      setSavedPreviewUrl(value?.src || '');
    }

    return () => {
      active = false;
    };
  }, [value?.id, value?.src, value?.path]);

  useEffect(() => () => {
    if (temporaryUrlRef.current) URL.revokeObjectURL(temporaryUrlRef.current);
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
  }, []);

  function clearStagedSelection() {
    if (temporaryUrlRef.current) {
      URL.revokeObjectURL(temporaryUrlRef.current);
      temporaryUrlRef.current = null;
    }
    setStagedFile(null);
    setStagedMeta(null);
    setStagedPreviewUrl('');
    onStagedPreviewChange?.(null);
  }

  function startProgressSimulation() {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    setUploadProgress(18);
    progressTimerRef.current = setInterval(() => {
      setUploadProgress((prev) => (prev < 88 ? prev + 14 : prev));
    }, 90);
  }

  function finishProgressSimulation() {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setUploadProgress(100);
  }

  async function executeUpload(fileToUpload, meta = null) {
    setError('');
    setBusy(true);
    startProgressSimulation();

    try {
      const image = await restaurantService.uploadImage(fileToUpload);
      const src = await restaurantService.getImageUrl(image);
      const relativePath = meta?.targetPath || buildRestaurantStoragePath(restaurantId, storageCategory, fileToUpload.name);
      finishProgressSimulation();

      if (temporaryUrlRef.current) {
        URL.revokeObjectURL(temporaryUrlRef.current);
        temporaryUrlRef.current = null;
      }
      setStagedFile(null);
      setStagedMeta(null);
      setStagedPreviewUrl('');
      onStagedPreviewChange?.(null);

      const uploaded = {
        ...image,
        src,
        alt,
        path: relativePath,
      };
      setSavedPreviewUrl(src || '');
      onChange?.(uploaded);

      if (value?.id && !deferCleanup) {
        try {
          await restaurantService.removeImage(value);
        } catch (cleanupError) {
          setError(`Image uploaded, but the previous image could not be removed: ${cleanupError.message}`);
        }
      }
    } catch (uploadError) {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setUploadProgress(0);
      const uploadMessage = uploadError.message || 'Unable to upload the selected image.';
      setError(uploadMessage);
    } finally {
      setBusy(false);
    }
  }

  async function handleFileSelect(file) {
    if (!file) return;
    setConfirmRemove(false);
    const basicError = validateFileBasic(file);
    if (basicError) {
      setError(basicError);
      return;
    }

    try {
      const dimensions = await inspectImageDimensions(file);
      if (dimensions.width < MIN_DIMENSION || dimensions.height < MIN_DIMENSION) {
        setError(`Image dimensions (${dimensions.width} × ${dimensions.height} px) are too small. Minimum required is ${MIN_DIMENSION} × ${MIN_DIMENSION} pixels.`);
        return;
      }

      setError('');
      if (temporaryUrlRef.current) URL.revokeObjectURL(temporaryUrlRef.current);
      const tempUrl = URL.createObjectURL(file);
      temporaryUrlRef.current = tempUrl;

      const targetPath = buildRestaurantStoragePath(restaurantId, storageCategory, file.name);
      const meta = {
        name: file.name,
        size: file.size,
        width: dimensions.width,
        height: dimensions.height,
        type: file.type,
        targetPath,
      };

      if (stageBeforeUpload) {
        setStagedFile(file);
        setStagedMeta(meta);
        setStagedPreviewUrl(tempUrl);
        onStagedPreviewChange?.({ src: tempUrl, alt: alt || label, path: targetPath });
      } else {
        setStagedPreviewUrl(tempUrl);
        await executeUpload(file, meta);
      }
    } catch (validationErr) {
      setError(validationErr.message || 'Unable to read the selected image.');
    }
  }

  async function remove() {
    if (stagedFile) {
      clearStagedSelection();
      setConfirmRemove(false);
      return;
    }

    if (!value) {
      setSavedPreviewUrl('');
      setConfirmRemove(false);
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (!deferCleanup) await restaurantService.removeImage(value);
      onChange?.(null);
      setSavedPreviewUrl('');
      setAlt('');
      setConfirmRemove(false);
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove the image.');
    } finally {
      setBusy(false);
    }
  }

  const activePreviewUrl = stagedPreviewUrl || savedPreviewUrl;
  const hasSavedImage = Boolean(value && (savedPreviewUrl || value.id || value.src));
  const isStaged = Boolean(stagedFile && stagedPreviewUrl);
  const targetStoragePath = stagedMeta?.targetPath
    || value?.path
    || buildRestaurantStoragePath(restaurantId, storageCategory, value?.name || `${storageCategory}-image.webp`);

  const variantClass = variant === 'logo'
    ? ' image-uploader--logo'
    : variant === 'cover'
      ? ' image-uploader--cover'
      : '';

  return (
    <section className={`image-uploader${variantClass}`} aria-label={label}>
      <div className="image-uploader-header">
        <div>
          <span className="image-uploader-title">{label}</span>
          {variant === 'logo' && (
            <span className="image-uploader-subtitle">Square 1:1 emblem shown on cards & storefront header</span>
          )}
          {variant === 'cover' && (
            <span className="image-uploader-subtitle">Wide 16:9 hero banner shown across your restaurant page</span>
          )}
        </div>
        <span className={`image-uploader-badge${isStaged ? ' is-staged' : hasSavedImage ? ' is-saved' : ''}`}>
          {isStaged ? 'Preview Ready' : hasSavedImage ? 'Uploaded' : 'No Image'}
        </span>
      </div>

      <div
        className={`image-uploader-dropzone${dragging ? ' is-dragging' : ''}${activePreviewUrl ? ' has-preview' : ''}${isStaged ? ' is-staged' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFileSelect(event.dataTransfer.files?.[0]);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label={`${label}: choose an image or drag one here`}
      >
        {activePreviewUrl ? (
          <>
            <img src={activePreviewUrl} alt={alt || label} className="image-uploader-preview" />
            <div className="image-uploader-overlay">
              <span>{isStaged ? 'Click to choose a different file' : `Click or drop to replace ${label.toLowerCase()}`}</span>
            </div>
          </>
        ) : (
          <div className="image-uploader-prompt">
            <span className="image-uploader-prompt-icon" aria-hidden="true">
              {variant === 'logo' ? '🏷️' : variant === 'cover' ? '🖼️' : '📷'}
            </span>
            <strong className="image-uploader-prompt-title">
              Choose {label.toLowerCase()} or drag & drop here
            </strong>
            <span className="image-uploader-prompt-hint">
              JPG, PNG, or WebP · Up to 5 MB · Min 300 × 300 px
            </span>
          </div>
        )}

        {busy && (
          <div className="image-uploader-status" role="status">
            <div className="image-uploader-progress-track" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}>
              <div className="image-uploader-progress-fill" style={{ width: `${uploadProgress}%` }} />
            </div>
            <span>Uploading & optimizing image ({uploadProgress}%)...</span>
          </div>
        )}
      </div>

      {isStaged && stagedMeta && (
        <div className="image-uploader-staged-bar" role="region" aria-label="Selected image preview details">
          <div className="image-uploader-staged-info">
            <strong>Selected preview: {stagedMeta.name}</strong>
            <span>
              {stagedMeta.width} × {stagedMeta.height} px · {formatFileSize(stagedMeta.size)} · Ready to upload
            </span>
            <code className="image-uploader-storage-path" title="Target Laravel public disk relative path">
              storage/app/public/{stagedMeta.targetPath}
            </code>
          </div>
          <div className="image-uploader-staged-actions">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => executeUpload(stagedFile, stagedMeta)}
              loading={busy}
            >
              Confirm & upload
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearStagedSelection}
              disabled={busy}
            >
              Cancel selection
            </Button>
          </div>
        </div>
      )}

      {!isStaged && hasSavedImage && (
        <div className="image-uploader-meta">
          <span>
            {value?.width && value?.height ? `${value.width} × ${value.height} px` : 'Optimized WebP'}
            {value?.size ? ` · ${formatFileSize(value.size)}` : ''}
          </span>
          <code className="image-uploader-storage-path" title="Relative path for MySQL storage">
            /storage/{targetStoragePath}
          </code>
        </div>
      )}

      <label className="image-uploader-alt">
        Alt text (accessibility description)
        <input
          type="text"
          value={alt}
          onChange={(event) => {
            const nextAlt = event.target.value;
            setAlt(nextAlt);
            if (value) onChange?.({ ...value, alt: nextAlt });
          }}
          disabled={busy}
          placeholder={`Describe this ${label.toLowerCase()}`}
        />
      </label>

      <input
        ref={inputRef}
        id={inputId}
        className="image-uploader-input"
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        onChange={(event) => {
          handleFileSelect(event.target.files?.[0]);
          event.target.value = '';
        }}
        disabled={busy}
        aria-label={`Choose ${label.toLowerCase()}`}
        tabIndex={-1}
      />

      <div className="image-uploader-actions">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
          {hasSavedImage || isStaged ? 'Replace image' : 'Choose image'}
        </Button>
        {hasSavedImage && !isStaged && (
          <Button type="button" variant="danger-outline" size="sm" onClick={() => setConfirmRemove(true)} disabled={busy}>
            Remove image
          </Button>
        )}
      </div>

      {error && (
        <div className="image-uploader-error-banner" role="alert">
          <span className="image-uploader-error-icon" aria-hidden="true">⚠️</span>
          <p className="image-uploader-error">{error}</p>
        </div>
      )}

      {confirmRemove && (
        <div className="image-uploader-confirm" role="alertdialog" aria-modal="true" aria-labelledby={`${inputId}-confirm-title`}>
          <p id={`${inputId}-confirm-title`}>
            Remove this {label.toLowerCase()}? It will be cleared from your storefront when you save.
          </p>
          <Button type="button" variant="danger" size="sm" onClick={remove} loading={busy}>Remove</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRemove(false)} disabled={busy}>Keep image</Button>
        </div>
      )}

      <p className="image-uploader-help">
        {helperText || 'JPG, PNG, or WebP. Maximum 5 MB; minimum 300 × 300 pixels.'}
      </p>
    </section>
  );
}

export function ImageGalleryUploader({
  value = [],
  onChange,
  label = 'Image gallery',
  id,
  deferCleanup = false,
  restaurantId = '{restaurant_id}',
}) {
  const generatedId = useId();
  const inputId = id || `image-gallery-${generatedId}`;
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const images = Array.isArray(value) ? value : [];
  const handlePreviewError = useCallback((message) => setError(message), []);

  async function addFiles(files) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    setBusy(true);
    setUploadProgress(15);
    setError('');
    const uploaded = [];
    try {
      for (const file of selected) {
        const validationError = validateFileBasic(file);
        if (validationError) throw new Error(`${file.name}: ${validationError}`);
        const dims = await inspectImageDimensions(file);
        if (dims.width < MIN_DIMENSION || dims.height < MIN_DIMENSION) {
          throw new Error(`${file.name}: Image dimensions (${dims.width} × ${dims.height} px) must be at least ${MIN_DIMENSION} × ${MIN_DIMENSION} pixels.`);
        }
      }

      for (let i = 0; i < selected.length; i += 1) {
        const file = selected[i];
        const image = await restaurantService.uploadImage(file);
        const path = buildRestaurantStoragePath(restaurantId, 'gallery', file.name);
        uploaded.push({
          ...image,
          src: await restaurantService.getImageUrl(image),
          alt: '',
          path,
        });
        setUploadProgress(Math.round(((i + 1) / selected.length) * 100));
      }
      onChange?.([...images, ...uploaded]);
    } catch (uploadError) {
      const cleanupResults = await Promise.allSettled(uploaded.map((image) => restaurantService.removeImage(image)));
      const cleanupFailed = cleanupResults.some((result) => result.status === 'rejected');
      setError(`${uploadError.message || 'Unable to add gallery images.'}${cleanupFailed ? ' Some temporary images could not be removed.' : ''}`);
    } finally {
      setBusy(false);
      setUploadProgress(0);
    }
  }

  async function removeImage(image) {
    setBusy(true);
    setError('');
    try {
      if (!deferCleanup) await restaurantService.removeImage(image);
      onChange?.(images.filter((entry) => entry.id !== image.id));
      setPendingRemoval(null);
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove gallery image.');
    } finally {
      setBusy(false);
    }
  }

  function updateImage(index, updated) {
    onChange?.(images.map((image, imageIndex) => (imageIndex === index ? updated : image)));
  }

  function moveImage(index, offset) {
    const destination = index + offset;
    if (destination < 0 || destination >= images.length) return;
    const reordered = [...images];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    onChange?.(reordered);
  }

  return (
    <section
      className="image-uploader image-gallery-uploader"
      aria-label={label}
      onDragOver={(event) => {
        event.preventDefault();
        event.currentTarget.classList.add('is-dragging');
      }}
      onDragLeave={(event) => event.currentTarget.classList.remove('is-dragging')}
      onDrop={(event) => {
        event.preventDefault();
        event.currentTarget.classList.remove('is-dragging');
        addFiles(event.dataTransfer.files);
      }}
    >
      <div className="image-uploader-header">
        <div>
          <span className="image-uploader-title">{label}</span>
          <span className="image-uploader-subtitle">
            Showcase your dining room, signature dishes, and ambiance ({images.length} uploaded)
          </span>
        </div>
        <code className="image-uploader-storage-path">
          /storage/restaurants/{restaurantId}/gallery/
        </code>
      </div>

      {images.length > 0 ? (
        <div className="image-gallery-grid">
          {images.map((image, index) => (
            <ImagePreview
              key={image.id || `${image.src}-${index}`}
              image={image}
              alt={image.alt}
              busy={busy}
              onError={handlePreviewError}
              onAltChange={(nextAlt) => updateImage(index, { ...image, alt: nextAlt })}
              onMove={(offset) => moveImage(index, offset)}
              onRemove={() => setPendingRemoval(image)}
            />
          ))}
        </div>
      ) : (
        <div className="image-gallery-empty" onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}>
          <span>📸 Drop gallery photos here or click &ldquo;Add images&rdquo; below</span>
        </div>
      )}

      {busy && (
        <div className="image-uploader-inline-progress" role="status">
          <div className="image-uploader-progress-track" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}>
            <div className="image-uploader-progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span>Processing gallery images ({uploadProgress}%)...</span>
        </div>
      )}

      <input
        ref={inputRef}
        id={inputId}
        className="image-uploader-input"
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
        disabled={busy}
        aria-label={`Add images to ${label.toLowerCase()}`}
        tabIndex={-1}
      />
      <div className="image-uploader-actions">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
          Add images
        </Button>
      </div>
      {error && (
        <div className="image-uploader-error-banner" role="alert">
          <span className="image-uploader-error-icon" aria-hidden="true">⚠️</span>
          <p className="image-uploader-error">{error}</p>
        </div>
      )}
      {pendingRemoval && (
        <div className="image-uploader-confirm" role="alertdialog" aria-modal="true" aria-labelledby={`${inputId}-confirm-title`}>
          <p id={`${inputId}-confirm-title`}>Remove this gallery image?</p>
          <Button type="button" variant="danger" size="sm" onClick={() => removeImage(pendingRemoval)} loading={busy}>Remove</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPendingRemoval(null)} disabled={busy}>Keep image</Button>
        </div>
      )}
      <p className="image-uploader-help">JPG, PNG, or WebP. Maximum 5 MB and minimum 300 × 300 pixels per image.</p>
    </section>
  );
}

export default ImageUploader;

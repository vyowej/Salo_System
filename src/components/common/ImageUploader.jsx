import { useCallback, useEffect, useId, useRef, useState } from 'react';
import restaurantService from '../../services/restaurantService';
import Button from './Button';
import './ImageUploader.css';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function validateFile(file) {
  if (!file) return 'Choose an image to upload.';
  if (!ACCEPTED_TYPES.has(file.type)) return 'Choose a JPG, PNG, or WebP image.';
  if (file.size > 5 * 1024 * 1024) return 'The selected image must be 5 MB or smaller.';
  return null;
}

function ImagePreview({ image, alt, onAltChange, onRemove, onMove, onError, busy }) {
  const [src, setSrc] = useState(image?.src || '');
  const imageId = image?.id;
  const imageSource = image?.src;

  useEffect(() => {
    let active = true;
    if (imageId) {
      restaurantService.getImageUrl({ id: imageId, src: imageSource }).then((url) => {
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
  }, [imageId, imageSource, onError]);

  return (
    <div className="image-uploader-item">
      {src ? <img src={src} alt={alt || ''} className="image-uploader-preview" /> : (
        <div className="image-uploader-preview image-uploader-preview-empty" aria-label="Image preview unavailable">No preview</div>
      )}
      <label className="image-uploader-alt">
        Alt text
        <input
          type="text"
          value={alt || ''}
          onChange={(event) => onAltChange(event.target.value)}
          disabled={busy}
          placeholder="Describe this image"
        />
      </label>
      <div className="image-uploader-item-actions">
        {onMove && <>
          <Button type="button" variant="outline" size="sm" onClick={() => onMove(-1)} disabled={busy} aria-label="Move image left">Move left</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onMove(1)} disabled={busy} aria-label="Move image right">Move right</Button>
        </>}
        <Button type="button" variant="danger-outline" size="sm" onClick={onRemove} disabled={busy}>Remove</Button>
      </div>
    </div>
  );
}

function ImageUploader({ value = null, onChange, label = 'Image', id, deferCleanup = false }) {
  const generatedId = useId();
  const inputId = id || `image-upload-${generatedId}`;
  const inputRef = useRef(null);
  const temporaryUrlRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(value?.src || '');
  const [alt, setAlt] = useState(value?.alt || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setAlt(value?.alt || '');
  }, [value?.alt]);

  useEffect(() => {
    let active = true;
    if (value?.id) {
      restaurantService.getImageUrl({ id: value.id, src: value.src }).then((url) => {
        if (active) setPreviewUrl(url || '');
      }).catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load the saved image preview.');
      });
    } else {
      setPreviewUrl(value?.src || '');
    }

    return () => {
      active = false;
    };
  }, [value?.id, value?.src]);

  useEffect(() => () => {
    if (temporaryUrlRef.current) URL.revokeObjectURL(temporaryUrlRef.current);
  }, []);

  function setTemporaryPreview(file) {
    if (temporaryUrlRef.current) URL.revokeObjectURL(temporaryUrlRef.current);
    const url = URL.createObjectURL(file);
    temporaryUrlRef.current = url;
    setPreviewUrl(url);
  }

  async function upload(file) {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setTemporaryPreview(file);
    setBusy(true);
    try {
      const image = await restaurantService.uploadImage(file);
      const src = await restaurantService.getImageUrl(image);
      if (temporaryUrlRef.current) URL.revokeObjectURL(temporaryUrlRef.current);
      temporaryUrlRef.current = null;
      const uploaded = { ...image, src, alt };
      setPreviewUrl(src || '');
      onChange?.(uploaded);
      if (value?.id && !deferCleanup) {
        try {
          await restaurantService.removeImage(value);
        } catch (cleanupError) {
          setError(`Image uploaded, but the previous image could not be removed: ${cleanupError.message}`);
        }
      }
    } catch (uploadError) {
      if (temporaryUrlRef.current) URL.revokeObjectURL(temporaryUrlRef.current);
      temporaryUrlRef.current = null;
      const uploadMessage = uploadError.message || 'Unable to upload the selected image.';
      setError(uploadMessage);
      if (value?.id) {
        restaurantService.getImageUrl(value).then(setPreviewUrl).catch((previewError) => {
          setError(`${uploadMessage} The existing preview could not be loaded: ${previewError.message}`);
        });
      } else {
        setPreviewUrl(value?.src || '');
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!value) {
      setPreviewUrl('');
      setConfirmRemove(false);
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (!deferCleanup) await restaurantService.removeImage(value);
      onChange?.(null);
      setPreviewUrl('');
      setAlt('');
      setConfirmRemove(false);
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove the image.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="image-uploader" aria-label={label}>
      <div
        className={`image-uploader-dropzone${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          upload(event.dataTransfer.files?.[0]);
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
        {previewUrl ? <img src={previewUrl} alt={alt} className="image-uploader-preview" /> : (
          <span className="image-uploader-prompt">Choose an image or drag it here</span>
        )}
        {busy && <span className="image-uploader-status" role="status">Uploading image...</span>}
      </div>
      <label className="image-uploader-alt">
        Alt text
        <input
          type="text"
          value={alt}
          onChange={(event) => {
            const nextAlt = event.target.value;
            setAlt(nextAlt);
            if (value) onChange?.({ ...value, alt: nextAlt });
          }}
          disabled={busy}
          placeholder="Describe this image"
        />
      </label>
      <input
        ref={inputRef}
        id={inputId}
        className="image-uploader-input"
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        onChange={(event) => {
          upload(event.target.files?.[0]);
          event.target.value = '';
        }}
        disabled={busy}
        aria-label={`Choose ${label.toLowerCase()}`}
        tabIndex={-1}
      />
      <div className="image-uploader-actions">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
          {value ? 'Replace image' : 'Choose image'}
        </Button>
        {value && <Button type="button" variant="danger-outline" size="sm" onClick={() => setConfirmRemove(true)} disabled={busy}>Remove image</Button>}
      </div>
      {error && <p className="image-uploader-error" role="alert">{error}</p>}
      {confirmRemove && (
        <div className="image-uploader-confirm" role="alertdialog" aria-modal="true" aria-labelledby={`${inputId}-confirm-title`}>
          <p id={`${inputId}-confirm-title`}>Remove this image?</p>
          <Button type="button" variant="danger" size="sm" onClick={remove} loading={busy}>Remove</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRemove(false)} disabled={busy}>Keep image</Button>
        </div>
      )}
      <p className="image-uploader-help">JPG, PNG, or WebP. Maximum 5 MB; minimum 300 × 300 pixels.</p>
    </section>
  );
}

export function ImageGalleryUploader({ value = [], onChange, label = 'Image gallery', id, deferCleanup = false }) {
  const generatedId = useId();
  const inputId = id || `image-gallery-${generatedId}`;
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const images = Array.isArray(value) ? value : [];
  const handlePreviewError = useCallback((message) => setError(message), []);

  async function addFiles(files) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    setBusy(true);
    setError('');
    const uploaded = [];
    try {
      for (const file of selected) {
        const validationError = validateFile(file);
        if (validationError) throw new Error(`${file.name}: ${validationError}`);
      }

      for (const file of selected) {
        const image = await restaurantService.uploadImage(file);
        uploaded.push({ ...image, src: await restaurantService.getImageUrl(image), alt: '' });
      }
      onChange?.([...images, ...uploaded]);
    } catch (uploadError) {
      const cleanupResults = await Promise.allSettled(uploaded.map((image) => restaurantService.removeImage(image)));
      const cleanupFailed = cleanupResults.some((result) => result.status === 'rejected');
      setError(`${uploadError.message || 'Unable to add gallery images.'}${cleanupFailed ? ' Some temporary images could not be removed.' : ''}`);
    } finally {
      setBusy(false);
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
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>Add images</Button>
      {error && <p className="image-uploader-error" role="alert">{error}</p>}
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

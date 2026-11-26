import { useEffect, useRef, useState } from 'react';
import Button from '../../../components/common/Button';
import CameraCaptureModal from '../../../components/application/CameraCaptureModal';
import { useAuth } from '../../../hooks/useAuth';
import riderService from '../../../services/riderService';
import './RiderAvatarControl.css';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function dataUrlToFile(dataUrl, filename, mimeType) {
  const parts = String(dataUrl || '').split(',');
  if (parts.length < 2) {
    throw new Error('Invalid captured image data.');
  }
  const byteString = atob(parts[1]);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i += 1) {
    bytes[i] = byteString.charCodeAt(i);
  }
  return new File([bytes], filename || 'rider_profile.jpg', { type: mimeType || 'image/jpeg' });
}

export function RiderAvatarImage({ src, initials, className = '', alt = '' }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    setImgFailed(false);
    setImgLoaded(false);
  }, [src]);

  if (!src || imgFailed) {
    return <span>{initials}</span>;
  }

  return (
    <>
      {!imgLoaded && <span className="rider-avatar-initials-placeholder">{initials}</span>}
      <img
        src={src}
        alt={alt}
        className={`rider-avatar-img ${imgLoaded ? 'is-loaded' : 'is-loading'} ${className}`.trim()}
        loading="eager"
        decoding="async"
        onLoad={() => setImgLoaded(true)}
        onError={() => setImgFailed(true)}
      />
    </>
  );
}

export default function RiderAvatarControl({
  avatarUrl,
  displayName,
  onPhotoUpdated,
  compact = false,
}) {
  const { user, updateUser } = useAuth();
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const resolvedAvatar = avatarUrl ?? user?.avatar ?? user?.rider_profile?.profile_photo ?? null;
  const initials = String(displayName || user?.name || user?.username || 'RD')
    .trim()
    .slice(0, 2)
    .toUpperCase();

  const syncUserPhoto = (updatedProfile) => {
    const nextPhoto = updatedProfile?.profile_photo ?? null;
    updateUser?.({
      avatar: nextPhoto,
      rider_profile: {
        ...(user?.rider_profile || {}),
        profile_photo: nextPhoto,
      },
    });
    onPhotoUpdated?.(updatedProfile);
    window.dispatchEvent(new Event('salo:riderUpdated'));
  };

  const handleUploadFile = async (file) => {
    if (!file) return;
    setError('');
    setStatus('');

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError('Please choose a JPG, PNG, or WebP image.');
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setError('Profile photo must not exceed 5 MB.');
      return;
    }

    setBusy(true);
    try {
      const updated = await riderService.uploadProfilePhoto(file);
      syncUserPhoto(updated);
      setStatus('Profile photo updated.');
    } catch (err) {
      setError(err?.message || 'Unable to upload profile photo.');
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      handleUploadFile(file);
    }
  };

  const handleCameraCapture = (_docId, capture) => {
    if (!capture?.dataUrl) return;
    try {
      const file = dataUrlToFile(capture.dataUrl, capture.name, capture.type);
      handleUploadFile(file);
    } catch {
      setError('Failed to process captured photo. Please try again.');
    }
  };

  const handleRemove = async () => {
    if (!resolvedAvatar || busy) return;
    setError('');
    setStatus('');
    setBusy(true);
    try {
      const updated = await riderService.removeProfilePhoto();
      syncUserPhoto(updated);
      setStatus('Profile photo removed.');
    } catch (err) {
      setError(err?.message || 'Unable to remove profile photo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rider-avatar-control ${compact ? 'is-compact' : ''}`.trim()}>
      <div className="rider-avatar-control-row">
        <div className={`rider-avatar-preview ${busy ? 'is-busy' : ''}`.trim()} aria-label="Rider profile photo">
          <RiderAvatarImage src={resolvedAvatar} initials={initials} alt={`${displayName || 'Rider'} profile`} />
          {busy && (
            <span className="rider-avatar-loading-overlay" aria-live="polite">
              Saving...
            </span>
          )}
        </div>

        <div className="rider-avatar-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Choose profile photo file"
            onChange={handleFileChange}
          />
          <div className="rider-avatar-btn-group">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {resolvedAvatar ? 'Change photo' : 'Choose photo'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setCameraOpen(true)}
            >
              Take photo
            </Button>
            {resolvedAvatar && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={handleRemove}
              >
                Remove
              </Button>
            )}
          </div>
          <p className="rider-avatar-hint">JPG, PNG, or WebP up to 5 MB.</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rider-avatar-feedback is-error">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="rider-avatar-feedback is-success">
          {status}
        </p>
      )}

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCameraCapture}
        onFallbackToFile={() => {
          setCameraOpen(false);
          fileInputRef.current?.click();
        }}
        preferredFacingMode="user"
        docConfig={{
          id: 'selfie_photo',
          guideType: 'selfie',
          title: 'Rider Profile Photo',
          description: 'Center your face clearly in good lighting.',
        }}
      />
    </div>
  );
}

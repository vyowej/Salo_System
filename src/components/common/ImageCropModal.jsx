import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import './ImageCropModal.css';

/**
 * Reusable HTML5-Canvas image crop & reposition modal (zero external dependencies).
 * Supports Facebook-style Logo (1:1), Cover Photo (16:9 / 3:1), and Menu Item photos.
 */
export default function ImageCropModal({
  open,
  file,
  title = 'Adjust image',
  aspectRatio = 1,
  outputWidth = 800,
  outputMime = 'image/jpeg',
  onCancel,
  onConfirm,
}) {
  const [imageUrl, setImageUrl] = useState('');
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dragStartRef = useRef({ x: 0, y: 0, origX: 0, origY: 0 });
  const imgRef = useRef(null);

  useEffect(() => {
    if (!open || !file) {
      setImageUrl('');
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setError('');
      return undefined;
    }

    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError('');

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [open, file]);

  const frameWidth = 360;
  const frameHeight = Math.round(frameWidth / aspectRatio);

  const clampOffset = useCallback((nextX, nextY, nextZoom) => {
    if (!naturalSize.width || !naturalSize.height) return { x: 0, y: 0 };
    const baseScale = Math.max(frameWidth / naturalSize.width, frameHeight / naturalSize.height);
    const renderedW = naturalSize.width * baseScale * nextZoom;
    const renderedH = naturalSize.height * baseScale * nextZoom;
    const maxX = Math.max(0, (renderedW - frameWidth) / 2);
    const maxY = Math.max(0, (renderedH - frameHeight) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, nextX)),
      y: Math.max(-maxY, Math.min(maxY, nextY)),
    };
  }, [frameHeight, frameWidth, naturalSize.height, naturalSize.width]);

  const handleImageLoad = (event) => {
    const img = event.currentTarget;
    setNaturalSize({
      width: img.naturalWidth || frameWidth,
      height: img.naturalHeight || frameHeight,
    });
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    setDragging(true);
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  };

  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (event) => {
      const dx = event.clientX - dragStartRef.current.x;
      const dy = event.clientY - dragStartRef.current.y;
      setOffset(clampOffset(dragStartRef.current.origX + dx, dragStartRef.current.origY + dy, zoom));
    };
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [clampOffset, dragging, zoom]);

  const handleZoomChange = (nextZoom) => {
    setZoom(nextZoom);
    setOffset((prev) => clampOffset(prev.x, prev.y, nextZoom));
  };

  const handleApply = async () => {
    if (!imgRef.current || !naturalSize.width || !naturalSize.height || saving) return;
    setSaving(true);
    setError('');

    try {
      const outW = outputWidth;
      const outH = Math.round(outputWidth / aspectRatio);
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Unable to initialize image canvas.');

      const baseScale = Math.max(frameWidth / naturalSize.width, frameHeight / naturalSize.height);
      const totalScale = baseScale * zoom;
      const renderedW = naturalSize.width * totalScale;
      const renderedH = naturalSize.height * totalScale;

      const drawLeft = (frameWidth - renderedW) / 2 + offset.x;
      const drawTop = (frameHeight - renderedH) / 2 + offset.y;

      const ratioToOut = outW / frameWidth;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(
        imgRef.current,
        drawLeft * ratioToOut,
        drawTop * ratioToOut,
        renderedW * ratioToOut,
        renderedH * ratioToOut,
      );

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('Failed to export cropped image.'))),
          outputMime,
          0.92,
        );
      });

      const ext = outputMime === 'image/png' ? 'png' : outputMime === 'image/webp' ? 'webp' : 'jpg';
      const baseName = (file?.name || 'image').replace(/\.[^.]+$/, '');
      const croppedFile = new File([blob], `${baseName}-cropped.${ext}`, { type: outputMime });
      await onConfirm(croppedFile);
    } catch (err) {
      setError(err?.message || 'Unable to crop this image.');
    } finally {
      setSaving(false);
    }
  };

  const baseScale = naturalSize.width && naturalSize.height
    ? Math.max(frameWidth / naturalSize.width, frameHeight / naturalSize.height)
    : 1;
  const renderedW = naturalSize.width ? naturalSize.width * baseScale * zoom : frameWidth;
  const renderedH = naturalSize.height ? naturalSize.height * baseScale * zoom : frameHeight;

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onCancel}
      title={title}
      size="md"
      footer={(
        <div className="salo-crop-footer">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={handleApply} loading={saving}>
            Apply &amp; Save
          </Button>
        </div>
      )}
    >
      <div className="salo-crop-body">
        <p className="salo-crop-hint">Drag the image to reposition, and use the zoom slider to frame it.</p>
        <div
          className={`salo-crop-viewport ${dragging ? 'is-dragging' : ''}`}
          style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }}
          onPointerDown={handlePointerDown}
        >
          {imageUrl && (
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Crop preview"
              draggable={false}
              onLoad={handleImageLoad}
              style={{
                width: `${renderedW}px`,
                height: `${renderedH}px`,
                transform: `translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          )}
        </div>

        <label className="salo-crop-zoom-row">
          <span>Zoom ({zoom.toFixed(2)}×)</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
          />
        </label>

        {error && <p className="salo-crop-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

/**
 * Convert a File, Blob, { file }, or dataURL object into an uploadable File/Blob.
 */
export function resolveUploadableFile(entry, fallbackName = 'upload.jpg') {
  if (!entry) return null;
  if (entry instanceof File || entry instanceof Blob) return entry;
  if (entry.file instanceof File || entry.file instanceof Blob) return entry.file;

  const dataUrl = typeof entry === 'string'
    ? entry
    : (entry.dataUrl || entry.src || entry.previewUrl || null);

  if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/data:([^;]+);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const ext = mime.split('/')[1] || 'jpg';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const name = entry.name || `${fallbackName.replace(/\.[^.]+$/, '')}.${ext}`;
    return new File([bytes], name, { type: mime });
  }

  return null;
}

export function mapAccountTypeToEnum(label) {
  const lower = String(label || '').toLowerCase();
  if (lower.includes('e-wallet') || lower.includes('gcash') || lower.includes('maya')) return 'e_wallet';
  if (lower.includes('current') || lower.includes('checking')) return 'current_checking';
  if (lower.includes('savings')) return 'savings';
  return 'other';
}

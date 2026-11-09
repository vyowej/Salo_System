import { RiderUploadField } from './RiderUI';

export default function FileUploadField({ label, accept, maxSizeLabel, value, onChange }) {
  const preview = value && typeof value === 'string' ? value : undefined;

  return (
    <RiderUploadField
      label={label}
      accept={accept}
      preview={preview}
      onChange={onChange}
      hint={maxSizeLabel}
    />
  );
}

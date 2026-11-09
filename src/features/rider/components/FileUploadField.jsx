import { RiderUploadField } from './RiderUI';

export default function FileUploadField({ label, accept, maxSizeLabel, value, preview, onChange }) {
  return (
    <RiderUploadField
      label={label}
      accept={accept}
      preview={preview}
      onChange={onChange}
      hint={value || maxSizeLabel}
    />
  );
}

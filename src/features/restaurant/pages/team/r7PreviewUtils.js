export const PREVIEW_STATES = ['Sample data', 'Loading', 'Empty', 'Error'];

export function formatPeso(value) {
  return `₱${Number(value || 0).toLocaleString('en-PH')}`;
}

/**
 * Shared Onboarding Content & Copy
 * Keeps all shared dialog labels, skip confirmation copy, and accessibility text
 * in one dedicated configuration module.
 */

export const SHARED_ONBOARDING_CONTENT = {
  brandBadgeLabel: 'SALO Setup',
  closeAriaLabel: 'Skip onboarding setup',
  progressLabelTemplate: 'Step {current} of {total}',
  progressAriaLabel: 'Onboarding setup progress',
  skipConfirmation: {
    title: 'Skip setup for now?',
    message: 'Sigurado ka bang lalaktawan muna ito? Pwede mo itong gawin anytime.',
    confirmButton: 'Oo, laktawan',
    cancelButton: 'Ituloy ang setup',
  },
  statusLabels: {
    saving: 'Saving...',
    loading: 'Loading status...',
    completed: 'Completed',
    incomplete: 'To do',
    verified: 'Verified',
    ready: 'Ready',
    needsAttention: 'Action needed',
  },
};

export function interpolateCopy(template, values = {}) {
  if (!template) return '';
  return String(template).replace(/\{(\w+)\}/g, (_, key) => {
    const val = values[key];
    return val !== undefined && val !== null && String(val).trim() !== '' ? String(val) : '';
  });
}

export default SHARED_ONBOARDING_CONTENT;

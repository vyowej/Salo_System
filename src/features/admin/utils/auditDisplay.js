const EVENT_ONLY_ACTIONS = new Set([
  'email_otp_sent',
  'password_changed',
]);

export function formatAuditValue(value) {
  if (value === null || value === undefined || value === '') {
    return { isEmpty: true, isJson: false, text: '' };
  }
  if (typeof value === 'object') {
    return { isEmpty: false, isJson: true, text: JSON.stringify(value, null, 2) };
  }
  const str = String(value).trim();
  if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
    try {
      const parsed = JSON.parse(str);
      return { isEmpty: false, isJson: true, text: JSON.stringify(parsed, null, 2) };
    } catch {
      return { isEmpty: false, isJson: false, text: str };
    }
  }
  return { isEmpty: false, isJson: false, text: str };
}

/**
 * Determine whether an audit log entry should render as an Event Details view
 * rather than a Previous/New Value record modification diff.
 *
 * Historical event-only rows (e.g. legacy `email_otp_sent` records that stored
 * `{ email, purpose }` in `new_values`) are still presented as event context
 * instead of pretending a user record modification occurred.
 */
export function classifyAuditDisplay(record) {
  const action = String(record?.action || '').trim().toLowerCase();
  const prevFormatted = formatAuditValue(record?.previousValue);
  const nextFormatted = formatAuditValue(record?.newValue);
  const hasAnyValues = !prevFormatted.isEmpty || !nextFormatted.isEmpty;

  const isEventOnly =
    EVENT_ONLY_ACTIONS.has(action)
    || (action === 'email_otp_verified' && prevFormatted.isEmpty)
    || !hasAnyValues;

  return {
    mode: isEventOnly ? 'event' : 'diff',
    prevFormatted,
    nextFormatted,
    hasEventContext: isEventOnly && !nextFormatted.isEmpty,
  };
}

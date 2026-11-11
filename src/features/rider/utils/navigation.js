export function buildNavigationUrl(address) {
  const query = typeof address === 'string' ? address.trim() : '';

  if (!query) {
    return '#';
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

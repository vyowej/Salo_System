export function buildNavigationUrl(address) {
  const query = typeof address === 'string' ? address.trim() : '';

  if (!query) {
    return '#';
  }

  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
}

export function withScenario(path, search = '') {
  const destination = new URL(path, 'http://salo.local');
  const currentScenario = new URLSearchParams(search).get('scenario');

  if (currentScenario && !destination.searchParams.has('scenario')) {
    destination.searchParams.set('scenario', currentScenario);
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}

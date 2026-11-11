/**
 * SALO — Delivery Coverage Helper
 * Checks if a restaurant covers a given destination address.
 * Reuses restaurant.deliveryCoverage configuration if available.
 */

export function checkAddressCoverage(restaurant, address) {
  if (!address) {
    return {
      isCovered: false,
      error: 'No delivery address selected.',
    };
  }

  // If the restaurant specifies delivery coverage rules (e.g. cities list or radius)
  if (restaurant?.deliveryCoverage?.cities && Array.isArray(restaurant.deliveryCoverage.cities)) {
    const city = (address.city || '').toLowerCase();
    const isCovered = restaurant.deliveryCoverage.cities.some((c) =>
      city.includes(c.toLowerCase()) || c.toLowerCase().includes(city)
    );
    if (!isCovered) {
      return {
        isCovered: false,
        error: `${restaurant.name || 'Restaurant'} does not deliver to ${address.city || 'this area'}.`,
      };
    }
  }

  return {
    isCovered: true,
    error: null,
  };
}

export function resolveAccessDecision({ loading, authenticated, hasRestaurantAccess, canAccess }) {
  if (loading) return 'loading';
  if (!authenticated) return 'unauthenticated';
  if (!hasRestaurantAccess || !canAccess) return 'forbidden';
  return 'allowed';
}

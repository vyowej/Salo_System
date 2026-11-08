import demoAdapter from './demo/demoAdapter';

/**
 * Restaurant service boundary. Replace this adapter with authenticated API
 * implementations when the Laravel endpoints are available.
 */
export const restaurantService = {
  get dataSource() {
    return 'demo';
  },
  ...demoAdapter,
};

export default restaurantService;

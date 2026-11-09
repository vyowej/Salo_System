export const vehicleTypes = [
  { key: 'motorcycle', label: 'Motorcycle', requiredDocuments: ['Driver license', 'Vehicle registration'] },
  { key: 'bicycle', label: 'Bicycle', requiredDocuments: [] },
  { key: 'e_bike', label: 'E-bike / E-scooter', requiredDocuments: ['Government ID'] },
  { key: 'other', label: 'Other approved vehicle', requiredDocuments: ['Custom approval documents'] },
];

export default vehicleTypes;

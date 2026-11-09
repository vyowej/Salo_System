export const deliverySteps = [
  { key: 'accepted', label: 'Accepted', description: 'Order assigned and rider accepted the job.' },
  { key: 'arrived', label: 'Arrived', description: 'Reached the restaurant for pickup.' },
  { key: 'picked_up', label: 'Picked up', description: 'Food has been collected from the restaurant.' },
  { key: 'on_the_way', label: 'On the way', description: 'Delivering to the customer destination.' },
  { key: 'delivered', label: 'Delivered', description: 'Order handed over and completion recorded.' },
];

export const deliveryActionLabels = {
  accepted: 'Arrived at restaurant',
  arrived: 'Confirm pickup',
  picked_up: 'Start delivery',
  on_the_way: 'Complete delivery',
  delivered: 'Delivered',
};

export default deliverySteps;

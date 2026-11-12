function VehicleIconFrame({ children }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function MotorcycleIcon() {
  return (
    <VehicleIconFrame>
      <circle cx="6" cy="17" r="2.5" />
      <circle cx="18" cy="17" r="2.5" />
      <path d="M8.5 17h4l-3-6h4l4 6M10 11l-1.5-2H6M14 11h2.5l1.5 2M13 17h2.5M7 14h3" />
    </VehicleIconFrame>
  );
}

function BicycleIcon() {
  return (
    <VehicleIconFrame>
      <circle cx="6" cy="17" r="3" />
      <circle cx="18" cy="17" r="3" />
      <path d="m6 17 4-7 4 7H6l3-5h6M10 10H8M14 10h2l2 7" />
    </VehicleIconFrame>
  );
}

function ElectricBicycleIcon() {
  return (
    <VehicleIconFrame>
      <circle cx="5.5" cy="17" r="2.5" />
      <circle cx="17.5" cy="17" r="2.5" />
      <path d="m5.5 17 4-7 4 7h-8l3-5h6M9.5 10h-2M13.5 10h2l2 7" />
      <path d="m18.5 4-2 4h2l-1 3 3-4h-2l1-3z" />
    </VehicleIconFrame>
  );
}

function ElectricScooterIcon() {
  return (
    <VehicleIconFrame>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M8 18h8l-2-8M14 10h3M15 10l2-3M8 18l3-9h3M9 9H7" />
    </VehicleIconFrame>
  );
}

function WalkingIcon() {
  return (
    <VehicleIconFrame>
      <circle cx="14" cy="5" r="2" />
      <path d="m12 9 3 2 2 4M12 9l-3 4-1 4M13 11l-1 5 3 4M10 17l-3 3" />
    </VehicleIconFrame>
  );
}

const vehicleIcons = {
  motorcycle: MotorcycleIcon,
  bicycle: BicycleIcon,
  electricBicycle: ElectricBicycleIcon,
  electricScooter: ElectricScooterIcon,
  walking: WalkingIcon,
};

export function VehicleTypeIcon({ name }) {
  const Icon = vehicleIcons[name];

  if (!Icon) {
    throw new Error(`Unknown vehicle type icon: ${name}`);
  }

  return <Icon />;
}

export function SelectionCheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      <path d="m3 8 3.2 3.2L13 4.5" />
    </svg>
  );
}

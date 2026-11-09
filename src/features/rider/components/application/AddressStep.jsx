import './AddressStep.css';

export default function AddressStep({ form, vehicleType, vehicleTypes, onChange, onVehicleChange }) {
  return (
    <div className="rider-address-step">
      <label className="rider-field">
        <span>Residential address</span>
        <input
          placeholder="Street, barangay, city"
          value={form.address}
          onChange={(event) => onChange('address', event.target.value)}
        />
      </label>
      <label className="rider-field">
        <span>Preferred vehicle type</span>
        <select value={vehicleType} onChange={(event) => onVehicleChange(event.target.value)}>
          {vehicleTypes.map((item) => <option key={item.key} value={item.label}>{item.label}</option>)}
        </select>
      </label>
      <label className="rider-field">
        <span>Vehicle details</span>
        <input placeholder="Model, plate, and registration details" />
      </label>
    </div>
  );
}

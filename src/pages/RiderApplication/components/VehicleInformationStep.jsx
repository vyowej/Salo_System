import { Input, Select } from '../../../components/forms';
import {
  MOTORCYCLE_OWNERSHIP_OPTIONS,
  BICYCLE_TYPES,
} from '../constants/riderApplicationDefaults';

export default function VehicleInformationStep({
  deliveryMethod = 'motorcycle',
  data,
  onChange,
  errors = {},
}) {
  const handleChange = (field, value) => {
    onChange?.({
      ...data,
      [field]: value,
    });
  };

  // E. Walking / Walker
  if (deliveryMethod === 'walking') {
    return (
      <div className="rider-step-container">
        <div className="rider-step-header">
          <h2 className="rider-step-heading">Walking Delivery Configuration</h2>
          <p className="rider-step-subheading">
            You have selected Walking / Pedestrian Courier as your delivery method.
          </p>
        </div>

        <div className="walker-overview-card">
          <div className="walker-icon-wrap" aria-hidden="true">🚶</div>
          <div className="walker-copy">
            <h3 className="walker-title">No Vehicle Registration Required</h3>
            <p className="walker-text">
              Walking couriers are vital for fulfilling short-range orders within high-density dining hubs, shopping malls, office districts, and university campuses (typically within a 1–2 km radius).
            </p>
            <div className="walker-perks">
              <span className="perk-pill">✓ No vehicle fuel or maintenance expenses</span>
              <span className="perk-pill">✓ Dedicated thermal backpack provided upon onboarding</span>
              <span className="perk-pill">✓ Priority dispatch for intra-mall and neighboring food orders</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rider-step-container">
      <div className="rider-step-header">
        <h2 className="rider-step-heading">
          {deliveryMethod === 'motorcycle'
            ? 'Motorcycle Vehicle Details'
            : deliveryMethod === 'bicycle'
            ? 'Bicycle Details'
            : deliveryMethod === 'e_bike'
            ? 'E-bike / Electric Bicycle Details'
            : 'E-scooter Details'}
        </h2>
        <p className="rider-step-subheading">
          Provide technical and registration information for your selected delivery equipment.
        </p>
      </div>

      <div className="rider-form-grid">
        {/* A. Motorcycle Fields */}
        {deliveryMethod === 'motorcycle' && (
          <>
            <div className="grid-cols-2">
              <Input
                id="moto-brand"
                label="Motorcycle Brand / Make"
                placeholder="e.g. Honda, Yamaha, Suzuki, Kawasaki"
                value={data.motoBrand || ''}
                onChange={(e) => handleChange('motoBrand', e.target.value)}
                error={errors.motoBrand}
                required
              />

              <Input
                id="moto-model"
                label="Model & Displacement"
                placeholder="e.g. Click 125i, NMAX 155, Wave 110"
                value={data.motoModel || ''}
                onChange={(e) => handleChange('motoModel', e.target.value)}
                error={errors.motoModel}
                required
              />
            </div>

            <div className="grid-cols-2">
              <Input
                id="moto-year"
                type="number"
                label="Model Year"
                placeholder="e.g. 2022"
                value={data.motoYear || ''}
                onChange={(e) => handleChange('motoYear', e.target.value)}
                error={errors.motoYear}
                required
              />

              <Input
                id="moto-color"
                label="Vehicle Body Color"
                placeholder="e.g. Matte Black / Red"
                value={data.motoColor || ''}
                onChange={(e) => handleChange('motoColor', e.target.value)}
                error={errors.motoColor}
                required
              />
            </div>

            <div className="grid-cols-2">
              <Input
                id="moto-plate"
                label="License Plate Number"
                placeholder="e.g. 123-ABC or ABC-1234"
                value={data.plateNumber || ''}
                onChange={(e) => handleChange('plateNumber', e.target.value.toUpperCase())}
                error={errors.plateNumber}
                required
                helper="If new registration without plate, enter MV File Number."
              />

              <Input
                id="moto-mv"
                label="LTO MV File Number (Optional)"
                placeholder="e.g. 1384-00000000000"
                value={data.mvFileNumber || ''}
                onChange={(e) => handleChange('mvFileNumber', e.target.value)}
                helper="Shown on LTO Certificate of Registration."
              />
            </div>

            <div className="grid-cols-2">
              <Select
                id="moto-ownership"
                label="Vehicle Ownership Structure"
                value={data.ownership || MOTORCYCLE_OWNERSHIP_OPTIONS[0]}
                onChange={(e) => handleChange('ownership', e.target.value)}
                required
                helper="If borrowed or family-owned, owner authorization will be requested."
              >
                {MOTORCYCLE_OWNERSHIP_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            </div>

            {data.ownership !== 'Personally Owned' && (
              <div className="rider-subform-section">
                <h4 className="rider-subform-title">Registered Owner Information</h4>
                <p className="rider-subform-desc">
                  Since the vehicle is not registered in your name, provide the owner's details.
                </p>
                <div className="grid-cols-2" style={{ marginTop: 'var(--space-3)' }}>
                  <Input
                    id="moto-owner-name"
                    label="Registered Owner Full Name"
                    placeholder="e.g. Roberto Dela Cruz"
                    value={data.ownerName || ''}
                    onChange={(e) => handleChange('ownerName', e.target.value)}
                    error={errors.ownerName}
                    required
                  />

                  <Input
                    id="moto-owner-rel"
                    label="Relationship to Owner"
                    placeholder="e.g. Father, Spouse, Employer"
                    value={data.ownerRelationship || ''}
                    onChange={(e) => handleChange('ownerRelationship', e.target.value)}
                    error={errors.ownerRelationship}
                    required
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* B. Bicycle Fields */}
        {deliveryMethod === 'bicycle' && (
          <>
            <div className="grid-cols-2">
              <Select
                id="bike-type"
                label="Bicycle Type"
                value={data.bikeType || BICYCLE_TYPES[0]}
                onChange={(e) => handleChange('bikeType', e.target.value)}
                required
              >
                {BICYCLE_TYPES.map((bType) => (
                  <option key={bType} value={bType}>
                    {bType}
                  </option>
                ))}
              </Select>

              <Input
                id="bike-color"
                label="Bicycle Color"
                placeholder="e.g. Black / Metallic Blue"
                value={data.bikeColor || ''}
                onChange={(e) => handleChange('bikeColor', e.target.value)}
                error={errors.bikeColor}
                required
              />
            </div>

            <div className="grid-cols-2">
              <Input
                id="bike-brand"
                label="Bicycle Brand (Optional)"
                placeholder="e.g. Giant, Trek, Trinx, Foxter"
                value={data.bikeBrand || ''}
                onChange={(e) => handleChange('bikeBrand', e.target.value)}
              />

              <Input
                id="bike-model"
                label="Model (Optional)"
                placeholder="e.g. Escape 3, Marlin 5"
                value={data.bikeModel || ''}
                onChange={(e) => handleChange('bikeModel', e.target.value)}
              />
            </div>
          </>
        )}

        {/* C. E-bike Fields */}
        {deliveryMethod === 'e_bike' && (
          <>
            <div className="grid-cols-2">
              <Input
                id="ebike-brand"
                label="E-bike Brand / Make"
                placeholder="e.g. Fiido, Himo, Nakto, DYU"
                value={data.ebikeBrand || ''}
                onChange={(e) => handleChange('ebikeBrand', e.target.value)}
                error={errors.ebikeBrand}
                required
              />

              <Input
                id="ebike-model"
                label="Model & Battery Rating"
                placeholder="e.g. D4s 250W 36V, C20"
                value={data.ebikeModel || ''}
                onChange={(e) => handleChange('ebikeModel', e.target.value)}
                error={errors.ebikeModel}
                required
              />
            </div>

            <div className="grid-cols-2">
              <Input
                id="ebike-color"
                label="Color"
                placeholder="e.g. White / Orange"
                value={data.ebikeColor || ''}
                onChange={(e) => handleChange('ebikeColor', e.target.value)}
                required
              />

              <Input
                id="ebike-wattage"
                label="Motor Wattage / Classification"
                placeholder="e.g. 250W Pedal Assist (L1a)"
                value={data.ebikeWattage || ''}
                onChange={(e) => handleChange('ebikeWattage', e.target.value)}
                helper="Under 350W pedal assist does not require LTO registration."
              />
            </div>
          </>
        )}

        {/* D. E-scooter Fields */}
        {deliveryMethod === 'e_scooter' && (
          <>
            <div className="grid-cols-2">
              <Input
                id="escooter-brand"
                label="E-scooter Brand"
                placeholder="e.g. Xiaomi, Segway Ninebot, Kaabo"
                value={data.escooterBrand || ''}
                onChange={(e) => handleChange('escooterBrand', e.target.value)}
                error={errors.escooterBrand}
                required
              />

              <Input
                id="escooter-model"
                label="Model & Max Speed"
                placeholder="e.g. Pro 2 (Max 25 km/h)"
                value={data.escooterModel || ''}
                onChange={(e) => handleChange('escooterModel', e.target.value)}
                error={errors.escooterModel}
                required
              />
            </div>

            <div className="grid-cols-2">
              <Input
                id="escooter-color"
                label="Scooter Color"
                placeholder="e.g. Dark Grey"
                value={data.escooterColor || ''}
                onChange={(e) => handleChange('escooterColor', e.target.value)}
                required
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

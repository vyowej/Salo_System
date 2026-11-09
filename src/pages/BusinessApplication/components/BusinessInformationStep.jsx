import { Input, Textarea, Select, FormGroup, Label, HelperText } from '../../../components/forms';
import {
  BUSINESS_TYPES,
  OWNERSHIP_STRUCTURES,
  CUISINE_CATEGORIES,
} from '../constants/applicationDefaults';

const MAX_DESC_LENGTH = 500;

export default function BusinessInformationStep({
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

  const descLength = (data.description || '').length;

  return (
    <div className="wizard-step-container">
      <div className="wizard-step-header">
        <h2 className="wizard-step-heading">Business & Restaurant Information</h2>
        <p className="wizard-step-subheading">
          Provide primary identity and operating details for your culinary establishment.
          These details appear on your public restaurant storefront upon approval.
        </p>
      </div>

      <div className="wizard-form-grid">
        <div className="grid-cols-2">
          <Input
            id="biz-restaurant-name"
            label="Business / Restaurant Name"
            placeholder="e.g. Barrio Fiesta Bistro"
            value={data.restaurantName || ''}
            onChange={(e) => handleChange('restaurantName', e.target.value)}
            error={errors.restaurantName}
            required
            helper="The brand name familiar to dining guests and delivery customers."
          />

          <Input
            id="biz-registered-name"
            label="Registered Legal Entity Name"
            placeholder="e.g. Barrio Fiesta Food Services Inc."
            value={data.registeredName || ''}
            onChange={(e) => handleChange('registeredName', e.target.value)}
            error={errors.registeredName}
            helper="Leave blank if identical to your restaurant name."
          />
        </div>

        <div className="grid-cols-2">
          <Select
            id="biz-type"
            label="Business Type"
            value={data.businessType || BUSINESS_TYPES[0]}
            onChange={(e) => handleChange('businessType', e.target.value)}
            required
            helper="Identifies your store format in the SALO merchant directory."
          >
            {BUSINESS_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>

          <Select
            id="biz-ownership"
            label="Ownership Structure"
            value={data.ownershipStructure || OWNERSHIP_STRUCTURES[0]}
            onChange={(e) => handleChange('ownershipStructure', e.target.value)}
            required
            helper="Determines required legal permits and tax registration certificates."
          >
            {OWNERSHIP_STRUCTURES.map((structure) => (
              <option key={structure} value={structure}>
                {structure}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid-cols-2">
          <Select
            id="biz-cuisine"
            label="Primary Cuisine Category"
            value={data.cuisineType || CUISINE_CATEGORIES[0]}
            onChange={(e) => handleChange('cuisineType', e.target.value)}
            required
            helper="Helps hungry customers discover your kitchen in food search."
          >
            {CUISINE_CATEGORIES.map((cuisine) => (
              <option key={cuisine} value={cuisine}>
                {cuisine}
              </option>
            ))}
          </Select>

          <Input
            id="biz-phone"
            type="tel"
            label="Business Contact Number"
            placeholder="e.g. (02) 8-123-4567 or 0917-123-4567"
            value={data.businessPhone || ''}
            onChange={(e) => handleChange('businessPhone', e.target.value)}
            error={errors.businessPhone}
            required
            helper="For official SALO operations and order dispatch support."
          />
        </div>

        <Input
          id="biz-email"
          type="email"
          label="Official Business Email Address"
          placeholder="e.g. orders@barriofiesta.ph"
          value={data.businessEmail || ''}
          onChange={(e) => handleChange('businessEmail', e.target.value)}
          error={errors.businessEmail}
          required
          helper="Official communications, monthly sales invoices, and partner updates will be sent here."
        />

        <FormGroup>
          <div className="textarea-header-row">
            <Label htmlFor="biz-description">Restaurant Story & Description</Label>
            <span className={`char-counter ${descLength > MAX_DESC_LENGTH ? 'limit-exceeded' : ''}`}>
              {descLength} / {MAX_DESC_LENGTH}
            </span>
          </div>
          <Textarea
            id="biz-description"
            rows={4}
            placeholder="Share what makes your kitchen special, signature specialties, heritage recipes, or dining atmosphere..."
            value={data.description || ''}
            onChange={(e) => handleChange('description', e.target.value.slice(0, MAX_DESC_LENGTH))}
            error={errors.description}
          />
          <HelperText>
            A warm introduction presented to customers browsing your storefront.
          </HelperText>
        </FormGroup>
      </div>
    </div>
  );
}

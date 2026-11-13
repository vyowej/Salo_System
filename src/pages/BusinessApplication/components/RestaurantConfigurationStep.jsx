import { useState, useRef } from 'react';
import { Input, Select, Textarea, FormGroup, Label } from '../../../components/forms';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import { DAYS_OF_WEEK } from '../constants/applicationDefaults';

const MENU_CATEGORIES = [
  'Main Dishes',
  'Appetizers & Starters',
  'Salo-Salo Platters (Sharing)',
  'Soups & Noodles',
  'Desserts & Sweets',
  'Beverages & Refreshments',
  'Side Dishes & Extra Rice',
];

export default function RestaurantConfigurationStep({
  data,
  onChange,
  errors: _errors = {},
}) {
  const logoInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const menuItemImageRef = useRef(null);

  // Menu item modal state
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [editingMenuItemId, setEditingMenuItemId] = useState(null);
  const [menuItemForm, setMenuItemForm] = useState({
    name: '',
    description: '',
    category: MENU_CATEGORIES[0],
    price: '',
    available: true,
    photoUrl: null,
  });

  // 1. Branding Handlers
  const handleLogoUpload = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const preview = URL.createObjectURL(file);
      onChange?.({
        ...data,
        logo: { name: file.name, src: preview, file },
      });
    }
  };

  const handleLogoRemove = () => {
    if (data.logo?.src) URL.revokeObjectURL(data.logo.src);
    onChange?.({ ...data, logo: null });
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleCoverUpload = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const preview = URL.createObjectURL(file);
      onChange?.({
        ...data,
        coverPhoto: { name: file.name, src: preview, file },
      });
    }
  };

  const handleCoverRemove = () => {
    if (data.coverPhoto?.src) URL.revokeObjectURL(data.coverPhoto.src);
    onChange?.({ ...data, coverPhoto: null });
    if (coverInputRef.current) coverInputRef.current.value = '';
  };

  // 2. Operating Hours Handlers
  const handleDayChange = (dayKey, field, value) => {
    const currentDay = data.operatingHours[dayKey] || { isOpen: true, openTime: '10:00', closeTime: '22:00', isOvernight: false };
    const updatedDay = { ...currentDay, [field]: value };

    // Check if overnight (e.g. closeTime <= openTime)
    if (field === 'openTime' || field === 'closeTime') {
      const open = field === 'openTime' ? value : updatedDay.openTime;
      const close = field === 'closeTime' ? value : updatedDay.closeTime;
      updatedDay.isOvernight = close <= open;
    }

    onChange?.({
      ...data,
      operatingHours: {
        ...data.operatingHours,
        [dayKey]: updatedDay,
      },
    });
  };

  const copyMondayToAllDays = () => {
    const mondayConfig = data.operatingHours.monday || { isOpen: true, openTime: '10:00', closeTime: '22:00', isOvernight: false };
    const newHours = {};
    DAYS_OF_WEEK.forEach((d) => {
      newHours[d.key] = { ...mondayConfig };
    });
    onChange?.({
      ...data,
      operatingHours: newHours,
    });
  };

  // 3. Services Handlers
  const handleServiceToggle = (serviceKey) => {
    const updatedServices = {
      ...data.services,
      [serviceKey]: !data.services[serviceKey],
    };
    onChange?.({
      ...data,
      services: updatedServices,
    });
  };

  const handleReservationChange = (field, value) => {
    onChange?.({
      ...data,
      reservationSettings: {
        ...data.reservationSettings,
        [field]: value,
      },
    });
  };

  // 4. Menu Items Handlers
  const openAddMenuItemModal = () => {
    setEditingMenuItemId(null);
    setMenuItemForm({
      name: '',
      description: '',
      category: MENU_CATEGORIES[0],
      price: '',
      available: true,
      photoUrl: null,
    });
    setMenuModalOpen(true);
  };

  const openEditMenuItemModal = (item) => {
    setEditingMenuItemId(item.id);
    setMenuItemForm({ ...item });
    setMenuModalOpen(true);
  };

  const handleSaveMenuItem = (e) => {
    e.preventDefault();
    if (!menuItemForm.name.trim() || !menuItemForm.price) return;

    let updatedList = [...(data.menuItems || [])];
    if (editingMenuItemId) {
      updatedList = updatedList.map((item) => (item.id === editingMenuItemId ? { ...menuItemForm } : item));
    } else {
      const newItem = {
        ...menuItemForm,
        id: `menu-item-${Date.now()}`,
        price: parseFloat(menuItemForm.price) || 0,
      };
      updatedList.push(newItem);
    }

    onChange?.({
      ...data,
      menuItems: updatedList,
    });
    setMenuModalOpen(false);
  };

  const handleDeleteMenuItem = (itemId) => {
    const updatedList = (data.menuItems || []).filter((item) => item.id !== itemId);
    onChange?.({
      ...data,
      menuItems: updatedList,
    });
  };

  const handleMenuPhotoUpload = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const preview = URL.createObjectURL(file);
      setMenuItemForm((prev) => ({ ...prev, photoUrl: preview, photoName: file.name }));
    }
  };

  return (
    <div className="wizard-step-container">
      <div className="wizard-step-header">
        <h2 className="wizard-step-heading">Restaurant & Service Configuration</h2>
        <p className="wizard-step-subheading">
          Set up your digital branding, regular operating hours, fulfillment options, and optional initial menu items.
        </p>
      </div>

      <div className="wizard-config-sections">
        {/* Section A: Restaurant Visual Branding */}
        <section className="wizard-config-card">
          <div className="config-card-header">
            <h3 className="config-card-title">Storefront Branding & Imagery</h3>
            <p className="config-card-subtitle">
              Upload your official restaurant logo and cover banner displayed on the SALO app.
            </p>
          </div>

          <div className="branding-upload-grid">
            {/* Logo Upload */}
            <div className="branding-item-card">
              <span className="branding-label">Restaurant Logo</span>
              <div className="branding-logo-box">
                {data.logo?.src ? (
                  <div className="branding-thumb-container">
                    <img src={data.logo.src} alt="Restaurant Logo" className="branding-logo-img" />
                    <button
                      type="button"
                      className="btn-remove-badge"
                      onClick={handleLogoRemove}
                      title="Remove logo"
                      aria-label="Remove logo"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="branding-empty-box" onClick={() => logoInputRef.current?.click()}>
                    <span className="branding-empty-icon" aria-hidden="true">🖼️</span>
                    <span className="branding-empty-text">Upload Logo (Square 1:1)</span>
                  </div>
                )}
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={handleLogoUpload}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => logoInputRef.current?.click()}
              >
                {data.logo?.src ? 'Replace Logo' : 'Select Logo'}
              </Button>
            </div>

            {/* Cover Banner Upload */}
            <div className="branding-item-card branding-cover-card">
              <span className="branding-label">Storefront Banner / Cover Photo</span>
              <div className="branding-cover-box">
                {data.coverPhoto?.src ? (
                  <div className="branding-cover-container">
                    <img src={data.coverPhoto.src} alt="Cover Banner" className="branding-cover-img" />
                    <button
                      type="button"
                      className="btn-remove-badge"
                      onClick={handleCoverRemove}
                      title="Remove cover photo"
                      aria-label="Remove cover photo"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="branding-empty-cover" onClick={() => coverInputRef.current?.click()}>
                    <span className="branding-empty-icon" aria-hidden="true">📸</span>
                    <span className="branding-empty-text">Upload Landscape Banner (16:9 ratio, min 1200x675)</span>
                  </div>
                )}
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={handleCoverUpload}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => coverInputRef.current?.click()}
              >
                {data.coverPhoto?.src ? 'Replace Banner' : 'Select Banner'}
              </Button>
            </div>
          </div>
        </section>

        {/* Section B: Operating Hours */}
        <section className="wizard-config-card">
          <div className="config-card-header-with-action">
            <div>
              <h3 className="config-card-title">Weekly Operating Hours</h3>
              <p className="config-card-subtitle">
                Configure opening and closing schedules. Overnight shifts extending past midnight are supported.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyMondayToAllDays}
            >
              Copy Monday to All Days
            </Button>
          </div>

          <div className="operating-hours-table">
            {DAYS_OF_WEEK.map((day) => {
              const schedule = data.operatingHours[day.key] || {
                isOpen: true,
                openTime: '10:00',
                closeTime: '22:00',
                isOvernight: false,
              };

              return (
                <div key={day.key} className={`hours-row ${schedule.isOpen ? 'open' : 'closed'}`}>
                  <div className="hours-day-toggle">
                    <label className="hours-switch">
                      <input
                        type="checkbox"
                        checked={schedule.isOpen}
                        onChange={(e) => handleDayChange(day.key, 'isOpen', e.target.checked)}
                      />
                      <span className="hours-slider" />
                    </label>
                    <span className="hours-day-label">{day.label}</span>
                  </div>

                  {schedule.isOpen ? (
                    <div className="hours-times-group">
                      <div className="hours-time-field">
                        <span className="time-sublabel">Open:</span>
                        <input
                          type="time"
                          value={schedule.openTime}
                          onChange={(e) => handleDayChange(day.key, 'openTime', e.target.value)}
                          className="time-picker-input"
                          aria-label={`${day.label} opening time`}
                        />
                      </div>
                      <span className="hours-dash">—</span>
                      <div className="hours-time-field">
                        <span className="time-sublabel">Close:</span>
                        <input
                          type="time"
                          value={schedule.closeTime}
                          onChange={(e) => handleDayChange(day.key, 'closeTime', e.target.value)}
                          className="time-picker-input"
                          aria-label={`${day.label} closing time`}
                        />
                      </div>
                      {schedule.isOvernight && (
                        <span className="overnight-badge" title="Closes early morning of the next day">
                          +1 Day (Overnight)
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="hours-closed-badge">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Section C: Intended Services */}
        <section className="wizard-config-card">
          <div className="config-card-header">
            <h3 className="config-card-title">Fulfillment Services</h3>
            <p className="config-card-subtitle">
              Select the order modalities you wish to activate on SALO. Approval of specialized services is subject to operational onboarding review.
            </p>
          </div>

          <div className="services-selection-grid">
            <label className={`service-option-card ${data.services.delivery ? 'selected' : ''}`}>
              <input
                type="checkbox"
                checked={data.services.delivery}
                onChange={() => handleServiceToggle('delivery')}
              />
              <div className="service-card-body">
                <span className="service-icon" aria-hidden="true">🛵</span>
                <span className="service-title">Delivery</span>
                <span className="service-desc">Delivered to customers via SALO rider network.</span>
              </div>
            </label>

            <label className={`service-option-card ${data.services.pickup ? 'selected' : ''}`}>
              <input
                type="checkbox"
                checked={data.services.pickup}
                onChange={() => handleServiceToggle('pickup')}
              />
              <div className="service-card-body">
                <span className="service-icon" aria-hidden="true">🛍️</span>
                <span className="service-title">Pickup / Takeout</span>
                <span className="service-desc">Guests order ahead and pick up directly at your counter.</span>
              </div>
            </label>

            <label className={`service-option-card ${data.services.tableReservations ? 'selected' : ''}`}>
              <input
                type="checkbox"
                checked={data.services.tableReservations}
                onChange={() => handleServiceToggle('tableReservations')}
              />
              <div className="service-card-body">
                <span className="service-icon" aria-hidden="true">📅</span>
                <span className="service-title">Table Reservations</span>
                <span className="service-desc">Advance table bookings with guest headcount & policies.</span>
              </div>
            </label>
          </div>

          {/* Conditional Table Reservation Setup */}
          {data.services.tableReservations && (
            <div className="reservation-config-subpanel">
              <h4 className="reservation-config-heading">Table Reservation Settings</h4>
              <p className="reservation-config-desc">
                Configure advance notice guidelines and party capacity for online reservations.
              </p>

              <div className="grid-cols-2">
                <Input
                  id="res-min-notice"
                  type="number"
                  label="Minimum Advance Booking Notice (Hours)"
                  value={data.reservationSettings?.minNoticeHours || '2'}
                  onChange={(e) => handleReservationChange('minNoticeHours', e.target.value)}
                  helper="e.g. 2 hours before dining time."
                />

                <Input
                  id="res-max-party"
                  type="number"
                  label="Maximum Online Party Size (Guests)"
                  value={data.reservationSettings?.maxPartySize || '8'}
                  onChange={(e) => handleReservationChange('maxPartySize', e.target.value)}
                  helper="Larger parties will be asked to contact restaurant directly."
                />
              </div>

              <FormGroup>
                <Label htmlFor="res-notes">Reservation Policy & Notes (Optional)</Label>
                <Textarea
                  id="res-notes"
                  rows={2}
                  placeholder="e.g. Tables held for 15 minutes. Dress code casual. Outside cakes allowed with no corkage fee."
                  value={data.reservationSettings?.reservationNotes || ''}
                  onChange={(e) => handleReservationChange('reservationNotes', e.target.value)}
                />
              </FormGroup>
            </div>
          )}
        </section>

        {/* Section D: Initial Menu Setup (Optional) */}
        <section className="wizard-config-card">
          <div className="config-card-header-with-action">
            <div>
              <div className="config-title-with-pill">
                <h3 className="config-card-title">Initial Menu Setup</h3>
                <Badge variant="neutral" size="sm">Optional</Badge>
              </div>
              <p className="config-card-subtitle">
                Add a few signature dishes now to fast-track your storefront setup, or configure your complete menu later via the Merchant Portal.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openAddMenuItemModal}
            >
              + Add Menu Item
            </Button>
          </div>

          {(data.menuItems || []).length > 0 ? (
            <div className="menu-items-table">
              {data.menuItems.map((item) => (
                <div key={item.id} className="menu-item-row">
                  <div className="menu-item-media">
                    {item.photoUrl ? (
                      <img src={item.photoUrl} alt={item.name} className="menu-item-thumb" />
                    ) : (
                      <div className="menu-item-thumb-placeholder">🍲</div>
                    )}
                  </div>
                  <div className="menu-item-info">
                    <div className="menu-item-title-row">
                      <span className="menu-item-name">{item.name}</span>
                      <Badge variant="neutral" size="sm">{item.category}</Badge>
                      {!item.available && <Badge variant="danger" size="sm">Unavailable</Badge>}
                    </div>
                    {item.description && (
                      <p className="menu-item-desc">{item.description}</p>
                    )}
                    <span className="menu-item-price">₱{Number(item.price).toFixed(2)}</span>
                  </div>
                  <div className="menu-item-row-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditMenuItemModal(item)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="danger-outline"
                      size="sm"
                      onClick={() => handleDeleteMenuItem(item.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="menu-empty-state">
              <span className="menu-empty-icon" aria-hidden="true">📋</span>
              <p className="menu-empty-title">No menu items added yet</p>
              <p className="menu-empty-desc">
                Adding dishes is optional during application. You can add your full menu catalog with variations after approval.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openAddMenuItemModal}
              >
                Add Your First Dish
              </Button>
            </div>
          )}
        </section>
      </div>

      {/* Menu Item Add / Edit Modal */}
      <Modal
        open={menuModalOpen}
        onClose={() => setMenuModalOpen(false)}
        title={editingMenuItemId ? 'Edit Menu Item' : 'Add Initial Menu Item'}
        size="md"
      >
        <form onSubmit={handleSaveMenuItem} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Input
            id="menu-item-name"
            label="Dish / Item Name"
            placeholder="e.g. Crispy Pata Supreme"
            value={menuItemForm.name}
            onChange={(e) => setMenuItemForm({ ...menuItemForm, name: e.target.value })}
            required
          />

          <div className="grid-cols-2">
            <Select
              id="menu-item-cat"
              label="Menu Category"
              value={menuItemForm.category}
              onChange={(e) => setMenuItemForm({ ...menuItemForm, category: e.target.value })}
            >
              {MENU_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </Select>

            <Input
              id="menu-item-price"
              type="number"
              step="0.5"
              min="0"
              label="Price (₱ PHP)"
              placeholder="e.g. 550"
              value={menuItemForm.price}
              onChange={(e) => setMenuItemForm({ ...menuItemForm, price: e.target.value })}
              required
            />
          </div>

          <FormGroup>
            <Label htmlFor="menu-item-desc">Description</Label>
            <Textarea
              id="menu-item-desc"
              rows={2}
              placeholder="e.g. Deep-fried pork knuckle with crispy crackling skin, served with homemade spiced vinegar."
              value={menuItemForm.description}
              onChange={(e) => setMenuItemForm({ ...menuItemForm, description: e.target.value })}
            />
          </FormGroup>

          <div className="menu-photo-upload-field">
            <Label>Dish Photo (Optional)</Label>
            <div className="menu-photo-preview-wrap">
              {menuItemForm.photoUrl ? (
                <div className="menu-photo-thumb-box">
                  <img src={menuItemForm.photoUrl} alt="Dish" className="menu-photo-img" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setMenuItemForm((prev) => ({ ...prev, photoUrl: null }))}
                  >
                    Remove Photo
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => menuItemImageRef.current?.click()}
                >
                  Upload Dish Photo
                </Button>
              )}
            </div>
            <input
              ref={menuItemImageRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={handleMenuPhotoUpload}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button variant="ghost" type="button" onClick={() => setMenuModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {editingMenuItemId ? 'Update Item' : 'Add Item'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

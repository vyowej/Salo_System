import { useState, useEffect } from 'react';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useAuth } from '../../../hooks/useAuth';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import { Input, FormGroup, Label, Select } from '../../../components/forms';
import { adminService } from '../../../services/adminService';
import './PartnerApplicationPage.css';

const STORAGE_KEY = 'salo_partner_applications';

export default function PartnerApplicationPage() {
  const { user } = useAuth();

  // Local application tracker: { restaurant: null | { status, submittedAt, ... }, rider: null | { status, submittedAt, ... } }
  const [applications, setApplications] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : { restaurant: null, rider: null };
    } catch {
      return { restaurant: null, rider: null };
    }
  });

  // Modal open states
  const [restaurantModalOpen, setRestaurantModalOpen] = useState(false);
  const [riderModalOpen, setRiderModalOpen] = useState(false);

  // Form states
  const [restaurantForm, setRestaurantForm] = useState({
    restaurantName: '',
    cuisine: 'Filipino · Grill & BBQ',
    address: '',
    phone: '',
    seatingCapacity: '30',
    dtiNumber: '',
  });

  const [riderForm, setRiderForm] = useState({
    phone: user?.phone || '',
    vehicleType: 'Motorcycle',
    vehiclePlate: '',
    licenseNumber: '',
    zone: 'Quezon City',
  });

  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState(null);

  // Synchronize live status with adminService
  useEffect(() => {
    if (!user?.email) return;

    // Check if user's restaurant application exists in adminService
    const adminRestaurants = adminService.getRestaurants();
    const existingRest = adminRestaurants.find((r) => r.ownerEmail?.toLowerCase() === user.email.toLowerCase());

    // Check if user's rider application exists in adminService
    const adminRiders = adminService.getRiders();
    const existingRider = adminRiders.find((r) => r.email?.toLowerCase() === user.email.toLowerCase());

    setApplications((prev) => {
      const next = { ...prev };
      if (existingRest) {
        let status = 'Pending Review';
        if (existingRest.status === 'Active') status = 'Approved';
        if (existingRest.status === 'Suspended') status = 'Rejected';
        next.restaurant = {
          ...next.restaurant,
          name: existingRest.name,
          status,
          id: existingRest.id,
          submittedAt: existingRest.joinedDate || '2026-11-05',
        };
      }
      if (existingRider) {
        let status = 'Pending Review';
        if (existingRider.status === 'Active') status = 'Approved';
        if (existingRider.status === 'Suspended') status = 'Rejected';
        next.rider = {
          ...next.rider,
          name: existingRider.name,
          status,
          id: existingRider.id,
          vehicle: existingRider.vehicle,
          submittedAt: '2026-11-05',
        };
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [user]);

  // Submit Restaurant Partner Application
  const handleRestaurantSubmit = (e) => {
    e.preventDefault();
    if (!restaurantForm.restaurantName.trim() || !restaurantForm.address.trim()) {
      alert('Please fill in your restaurant name and address.');
      return;
    }

    setSubmitting(true);

    const newRest = {
      id: `rest-${Date.now().toString().slice(-4)}`,
      name: restaurantForm.restaurantName,
      cuisine: restaurantForm.cuisine,
      ownerName: user?.name || user?.username || 'Partner Applicant',
      ownerEmail: user?.email || 'applicant@salo.ph',
      address: restaurantForm.address,
      phone: restaurantForm.phone || '(02) 8-000-0000',
      status: 'Pending Approval',
      commissionRate: 10,
      rating: 0,
      joinedDate: new Date().toISOString().split('T')[0],
      dtiNumber: restaurantForm.dtiNumber,
    };

    // Push to adminService so Admin sees it in AdminRestaurantsPage!
    const currentRests = adminService.getRestaurants();
    adminService.saveRestaurants([newRest, ...currentRests]);

    const updatedApps = {
      ...applications,
      restaurant: {
        id: newRest.id,
        name: newRest.name,
        status: 'Pending Review',
        submittedAt: newRest.joinedDate,
      },
    };

    setApplications(updatedApps);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedApps));
    setSubmitting(false);
    setRestaurantModalOpen(false);
    setNotification('Restaurant Partner application submitted! Platform administrators will review your credentials.');
  };

  // Submit Rider Partner Application
  const handleRiderSubmit = (e) => {
    e.preventDefault();
    if (!riderForm.vehiclePlate.trim() || !riderForm.licenseNumber.trim()) {
      alert('Please provide your vehicle plate and LTO driver license number.');
      return;
    }

    setSubmitting(true);

    const newRider = {
      id: `rider-${Date.now().toString().slice(-4)}`,
      name: user?.name || user?.username || 'Rider Applicant',
      email: user?.email || 'rider.applicant@salo.ph',
      phone: riderForm.phone || '0917 000 0000',
      vehicle: `${riderForm.vehicleType} (${riderForm.vehiclePlate.toUpperCase()})`,
      licenseNumber: riderForm.licenseNumber.toUpperCase(),
      zone: riderForm.zone,
      status: 'Pending Verification',
      isOnline: false,
      rating: 0,
      totalTrips: 0,
      cashOnHand: 0,
      joinedDate: new Date().toISOString().split('T')[0],
    };

    // Push to adminService so Admin sees it in AdminRidersPage!
    const currentRiders = adminService.getRiders();
    adminService.saveRiders([newRider, ...currentRiders]);

    const updatedApps = {
      ...applications,
      rider: {
        id: newRider.id,
        name: newRider.name,
        status: 'Pending Review',
        vehicle: newRider.vehicle,
        submittedAt: newRider.joinedDate,
      },
    };

    setApplications(updatedApps);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedApps));
    setSubmitting(false);
    setRiderModalOpen(false);
    setNotification('Rider Partner application submitted! LTO verification is currently pending admin review.');
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <Badge variant="success" size="md">Approved</Badge>;
      case 'Pending Review':
        return <Badge variant="warning" size="md">Pending Review</Badge>;
      case 'Rejected':
        return <Badge variant="danger" size="md">Rejected</Badge>;
      default:
        return <Badge variant="neutral" size="md">Not Applied</Badge>;
    }
  };

  return (
    <CustomerLayout>
      <div className="partner-page-container">
        {/* Page Header */}
        <div className="partner-header-section">
          <span className="partner-eyebrow">Opportunities & Growth</span>
          <h1 className="partner-main-title font-heading">Become a SALO Partner</h1>
          <p className="partner-lead-text">
            Join the premier food and gathering network in the Philippines. Whether you run a beloved kitchen or ride with speed and care, SALO empowers your journey with transparent earnings and genuine hospitality.
          </p>
        </div>

        {notification && (
          <div className="partner-alert-banner" role="status">
            <span style={{ fontSize: 18 }}>✓</span>
            <span>{notification}</span>
            <button
              type="button"
              onClick={() => setNotification(null)}
              style={{ background: 'none', border: 'none', marginLeft: 'auto', cursor: 'pointer', color: 'inherit' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Partner Application Cards Grid ──────────────── */}
        <div className="partner-cards-grid">
          {/* Card 1: Restaurant Partner */}
          <div className="partner-card">
            <div className="partner-card-media">
              <img
                src="/images/landing/restaurant-interior.png"
                alt="SALO Restaurant Partner Dining Room"
                className="partner-card-img"
              />
              <div className="partner-card-status-pill">
                {getStatusBadge(applications.restaurant?.status)}
              </div>
            </div>

            <div className="partner-card-body">
              <span className="partner-type-tag">Kitchens & Dining</span>
              <h2 className="partner-card-title">Restaurant Partner</h2>
              <p className="partner-card-desc">
                Bring your restaurant to SALO and reach more customers. Benefit from consolidated multi-kitchen orders, automated table bookings, and fair 10% platform commission.
              </p>

              <div className="partner-perks-list">
                <div className="partner-perk-item">
                  <span className="perk-bullet">✓</span>
                  <span>Direct dine-in table reservation system with guest deposits</span>
                </div>
                <div className="partner-perk-item">
                  <span className="perk-bullet">✓</span>
                  <span>Single-ticket multi-order packaging and real-time kitchen tracking</span>
                </div>
                <div className="partner-perk-item">
                  <span className="perk-bullet">✓</span>
                  <span>Weekly automated bank payouts and sales analytics</span>
                </div>
              </div>

              <div className="partner-card-action">
                {applications.restaurant?.status === 'Approved' ? (
                  <a href="/owner" style={{ textDecoration: 'none', width: '100%' }}>
                    <Button variant="primary" size="lg" fullWidth>
                      Open Merchant Portal →
                    </Button>
                  </a>
                ) : applications.restaurant?.status === 'Pending Review' ? (
                  <div className="partner-status-box pending">
                    <p style={{ fontWeight: 700, margin: '0 0 4px', color: 'var(--salo-warning)' }}>Application Under Review</p>
                    <p style={{ fontSize: 12, margin: 0, color: 'var(--text-secondary)' }}>
                      Submitted on {applications.restaurant.submittedAt}. Our partner onboarding team is verifying your kitchen address and documents.
                    </p>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={() => setRestaurantModalOpen(true)}
                  >
                    Apply as a Restaurant Partner
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Delivery Rider */}
          <div className="partner-card">
            <div className="partner-card-media">
              <img
                src="/images/rider/rider-hero.png"
                alt="SALO Delivery Courier"
                className="partner-card-img"
              />
              <div className="partner-card-status-pill">
                {getStatusBadge(applications.rider?.status)}
              </div>
            </div>

            <div className="partner-card-body">
              <span className="partner-type-tag">Fleet & Courier</span>
              <h2 className="partner-card-title">Rider Partner</h2>
              <p className="partner-card-desc">
                Deliver great food and earn through SALO. Enjoy fair base fares, transparent in-app customer tips, streamlined turn-by-turn routes, and daily COD remittance.
              </p>

              <div className="partner-perks-list">
                <div className="partner-perk-item">
                  <span className="perk-bullet">✓</span>
                  <span>100% of customer in-app tips go directly to your earnings wallet</span>
                </div>
                <div className="partner-perk-item">
                  <span className="perk-bullet">✓</span>
                  <span>Flexible open dispatch job board and guaranteed multi-drop incentives</span>
                </div>
                <div className="partner-perk-item">
                  <span className="perk-bullet">✓</span>
                  <span>Instant GCash and Maya cash-on-hand remittance validation</span>
                </div>
              </div>

              <div className="partner-card-action">
                {applications.rider?.status === 'Approved' ? (
                  <a href="/rider" style={{ textDecoration: 'none', width: '100%' }}>
                    <Button variant="primary" size="lg" fullWidth>
                      Launch Courier Board →
                    </Button>
                  </a>
                ) : applications.rider?.status === 'Pending Review' ? (
                  <div className="partner-status-box pending">
                    <p style={{ fontWeight: 700, margin: '0 0 4px', color: 'var(--salo-warning)' }}>Verification Pending</p>
                    <p style={{ fontSize: 12, margin: 0, color: 'var(--text-secondary)' }}>
                      Submitted on {applications.rider.submittedAt}. LTO license and vehicle records are undergoing compliance verification.
                    </p>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={() => setRiderModalOpen(true)}
                  >
                    Apply as a Rider
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Restaurant Application Modal ───────────────── */}
        <Modal
          open={restaurantModalOpen}
          onClose={() => setRestaurantModalOpen(false)}
          title="Restaurant Partner Application"
          size="md"
        >
          <form onSubmit={handleRestaurantSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: 0 }}>
              Complete this application for your dining establishment. Our operations team reviews all submissions within 24–48 business hours.
            </p>

            <Input
              id="app-rest-name"
              label="Restaurant or Kitchen Name"
              placeholder="e.g. Barrio Fiesta Bistro"
              value={restaurantForm.restaurantName}
              onChange={(e) => setRestaurantForm({ ...restaurantForm, restaurantName: e.target.value })}
              required
            />

            <FormGroup>
              <Label htmlFor="app-rest-cuisine">Cuisine Category</Label>
              <Select
                id="app-rest-cuisine"
                value={restaurantForm.cuisine}
                onChange={(e) => setRestaurantForm({ ...restaurantForm, cuisine: e.target.value })}
              >
                <option value="Filipino · Grill & BBQ">Filipino · Grill & BBQ</option>
                <option value="Filipino · Breakfast & Bowls">Filipino · Breakfast & Bowls (Silog)</option>
                <option value="Street Food · Charcoal BBQ">Street Food · Charcoal BBQ</option>
                <option value="Seafood & Regional Delicacies">Seafood & Regional Delicacies</option>
                <option value="Pizza & Pasta · Italian">Pizza & Pasta · Italian</option>
                <option value="Burgers & Chicken Wings">Burgers & Chicken Wings</option>
                <option value="Café & Pastries">Café & Pastries</option>
              </Select>
            </FormGroup>

            <Input
              id="app-rest-address"
              label="Kitchen / Dining Address"
              placeholder="Street, Barangay, City (e.g. 15 Scout Rallos, Quezon City)"
              value={restaurantForm.address}
              onChange={(e) => setRestaurantForm({ ...restaurantForm, address: e.target.value })}
              required
            />

            <div className="grid-cols-2" style={{ gap: 'var(--space-3)' }}>
              <Input
                id="app-rest-phone"
                label="Business Phone"
                placeholder="(02) 8-123-4567"
                value={restaurantForm.phone}
                onChange={(e) => setRestaurantForm({ ...restaurantForm, phone: e.target.value })}
                required
              />
              <Input
                id="app-rest-seats"
                type="number"
                label="Dining Table Capacity"
                placeholder="Number of seats"
                value={restaurantForm.seatingCapacity}
                onChange={(e) => setRestaurantForm({ ...restaurantForm, seatingCapacity: e.target.value })}
              />
            </div>

            <Input
              id="app-rest-dti"
              label="DTI / Mayor's Permit Reference #"
              placeholder="e.g. DTI-NCR-2026-94812"
              value={restaurantForm.dtiNumber}
              onChange={(e) => setRestaurantForm({ ...restaurantForm, dtiNumber: e.target.value })}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <Button variant="ghost" type="button" onClick={() => setRestaurantModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={submitting}>
                Submit Application
              </Button>
            </div>
          </form>
        </Modal>

        {/* ── Rider Application Modal ────────────────────── */}
        <Modal
          open={riderModalOpen}
          onClose={() => setRiderModalOpen(false)}
          title="Rider Partner Application"
          size="md"
        >
          <form onSubmit={handleRiderSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: 0 }}>
              Submit your vehicle and license credentials. All drivers are screened for safety and compliance with Philippine transport regulations.
            </p>

            <Input
              id="app-rider-phone"
              label="Mobile Phone (GCash connected)"
              placeholder="0917 123 4567"
              value={riderForm.phone}
              onChange={(e) => setRiderForm({ ...riderForm, phone: e.target.value })}
              required
            />

            <div className="grid-cols-2" style={{ gap: 'var(--space-3)' }}>
              <FormGroup>
                <Label htmlFor="app-rider-veh-type">Vehicle Type</Label>
                <Select
                  id="app-rider-veh-type"
                  value={riderForm.vehicleType}
                  onChange={(e) => setRiderForm({ ...riderForm, vehicleType: e.target.value })}
                >
                  <option value="Motorcycle">Motorcycle</option>
                  <option value="Scooter">Scooter</option>
                  <option value="Bicycle">Bicycle</option>
                  <option value="E-Bike">E-Bike</option>
                </Select>
              </FormGroup>

              <Input
                id="app-rider-plate"
                label="Plate Number / Registration"
                placeholder="e.g. NQ 4821"
                value={riderForm.vehiclePlate}
                onChange={(e) => setRiderForm({ ...riderForm, vehiclePlate: e.target.value })}
                required
              />
            </div>

            <Input
              id="app-rider-license"
              label="LTO Driver's License Number"
              placeholder="e.g. N02-18-094120"
              value={riderForm.licenseNumber}
              onChange={(e) => setRiderForm({ ...riderForm, licenseNumber: e.target.value })}
              required
            />

            <FormGroup>
              <Label htmlFor="app-rider-zone">Primary Delivery Zone</Label>
              <Select
                id="app-rider-zone"
                value={riderForm.zone}
                onChange={(e) => setRiderForm({ ...riderForm, zone: e.target.value })}
              >
                <option value="Quezon City">Quezon City</option>
                <option value="Manila & Pasay">Manila & Pasay</option>
                <option value="Makati & BGC">Makati & BGC</option>
                <option value="Mandaluyong & Pasig">Mandaluyong & Pasig</option>
                <option value="Taguig & Alabang">Taguig & Alabang</option>
              </Select>
            </FormGroup>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <Button variant="ghost" type="button" onClick={() => setRiderModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={submitting}>
                Submit Application
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </CustomerLayout>
  );
}

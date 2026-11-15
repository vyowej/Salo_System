import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import Button from '../../../components/common/Button';
import { PhilippineAddressFields, SharedMap } from '../../../components/location';
import locationApiService from '../../../services/locationApiService';
import { geocodeAddress } from '../../../services/geocodingService';
import {
  ConfirmDialog,
  DataTable,
  Modal,
  PageHeader,
  StatusBadge,
  Tabs,
} from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import './AdminPages.css';

function formatAreaName(area) {
  if (area.barangay) return `Brgy. ${area.barangay}, ${area.city}`;
  if (area.city) return `${area.city} (City-wide)`;
  return `${area.province} (Province-wide)`;
}

export default function AdminServiceAreasPage() {
  const { permissions } = useAdminSession();
  const { query: globalQuery } = useAdminPageSearch({
    scopeLabel: 'Service Areas',
    placeholder: 'Search service areas by province, city, barangay, or status',
    searchableFields: ['province', 'city', 'barangay', 'areaLabel', 'status'],
  });

  const [areas, setAreas] = useState([]);
  const [overview, setOverview] = useState({ restaurants: [], active_deliveries: [] });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('Service areas & map');
  const [selectedAreaId, setSelectedAreaId] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [addressForm, setAddressForm] = useState({
    country: 'Philippines',
    province: '',
    city: '',
    barangay: '',
  });
  const [centerCoords, setCenterCoords] = useState({ lat: 14.5995, lng: 120.9842 });
  const [notes, setNotes] = useState('');
  const [pendingAreaStatus, setPendingAreaStatus] = useState(null);
  const [pendingAreaSave, setPendingAreaSave] = useState(null);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const canEdit = Boolean(permissions.serviceAreas?.some((action) => ['create', 'edit'].includes(action)));
  const canActivate = permissions.serviceAreas?.includes('activate');
  const canDeactivate = permissions.serviceAreas?.includes('deactivate');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [saList, ov] = await Promise.all([
        locationApiService.getAdminServiceAreas(),
        locationApiService.getAdminLocationsOverview().catch(() => ({ restaurants: [], active_deliveries: [] })),
      ]);
      const list = Array.isArray(saList) ? saList : [];
      setAreas(list);
      setOverview({
        restaurants: ov?.restaurants || [],
        active_deliveries: ov?.active_deliveries || [],
      });
      if (list.length > 0 && !selectedAreaId) {
        setSelectedAreaId(list[0].id);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Unable to load service areas from backend.');
    } finally {
      setLoading(false);
    }
  }, [selectedAreaId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const areaRows = useMemo(() => {
    const term = globalQuery.trim().toLowerCase();
    return areas
      .map((area) => ({
        ...area,
        areaLabel: formatAreaName(area),
      }))
      .filter(
        (area) =>
          !term ||
          [area.province, area.city, area.barangay, area.areaLabel, area.status]
            .some((v) => String(v || '').toLowerCase().includes(term)),
      );
  }, [areas, globalQuery]);

  const selectedArea = useMemo(
    () => areas.find((a) => a.id === selectedAreaId) || areaRows[0] || null,
    [areas, areaRows, selectedAreaId],
  );

  const mapMarkers = useMemo(
    () =>
      areaRows
        .filter((a) => Number.isFinite(Number(a.center_latitude)) && Number.isFinite(Number(a.center_longitude)))
        .map((a) => ({
          id: `sa-${a.id}`,
          lat: Number(a.center_latitude),
          lng: Number(a.center_longitude),
          title: formatAreaName(a),
          subtitle: `${a.status} · ${a.area_level} level · ${a.restaurant_count || 0} restaurant(s)`,
          type: a.is_active ? 'activeArea' : 'inactiveArea',
          onClick: () => setSelectedAreaId(a.id),
        })),
    [areaRows],
  );

  const mapCircles = useMemo(
    () =>
      areaRows
        .filter((a) => Number.isFinite(Number(a.center_latitude)) && Number.isFinite(Number(a.center_longitude)))
        .map((a) => ({
          id: `sa-circle-${a.id}`,
          lat: Number(a.center_latitude),
          lng: Number(a.center_longitude),
          radiusMeters: a.area_level === 'barangay' ? 1100 : a.area_level === 'city' ? 4000 : 12000,
          active: Boolean(a.is_active),
          onClick: () => setSelectedAreaId(a.id),
        })),
    [areaRows],
  );

  function openCreate() {
    setEditing(null);
    setAddressForm({ country: 'Philippines', province: '', city: '', barangay: '' });
    setCenterCoords({ lat: 14.5995, lng: 120.9842 });
    setNotes('');
    setFormOpen(true);
  }

  function openEdit(area) {
    setEditing(area);
    setAddressForm({
      country: 'Philippines',
      province: area.province || '',
      city: area.city || '',
      barangay: area.barangay || '',
    });
    setCenterCoords({
      lat: area.center_latitude ?? 14.5995,
      lng: area.center_longitude ?? 120.9842,
    });
    setNotes(area.notes || '');
    setFormOpen(true);
  }

  async function handleGeocodeAreaCenter() {
    const query = [addressForm.barangay, addressForm.city, addressForm.province, 'Philippines']
      .filter(Boolean)
      .join(', ');
    if (!query) return;
    try {
      const res = await geocodeAddress(query);
      if (res) {
        setCenterCoords({ lat: Number(res.lat.toFixed(6)), lng: Number(res.lng.toFixed(6)) });
      }
    } catch {
      // Ignore geocode failure; admin can click the map directly
    }
  }

  function saveArea(event) {
    event.preventDefault();
    setErrorMsg('');
    if (!addressForm.province.trim()) {
      setErrorMsg('Province is required.');
      return;
    }
    if (addressForm.barangay.trim() && !addressForm.city.trim()) {
      setErrorMsg('City / Municipality is required when specifying a barangay.');
      return;
    }

    setPendingAreaSave({
      editing,
      province: addressForm.province.trim(),
      city: addressForm.city.trim() || null,
      barangay: addressForm.barangay.trim() || null,
      center_latitude: centerCoords?.lat ?? null,
      center_longitude: centerCoords?.lng ?? null,
      notes: notes.trim() || null,
    });
  }

  async function confirmAreaSave({ reason }) {
    if (!pendingAreaSave) return;
    try {
      if (pendingAreaSave.editing) {
        const updated = await locationApiService.updateAdminServiceArea(pendingAreaSave.editing.id, {
          center_latitude: pendingAreaSave.center_latitude,
          center_longitude: pendingAreaSave.center_longitude,
          notes: pendingAreaSave.notes,
          reason: reason || 'Updated service area details',
        });
        setAreas((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setNotice(`${formatAreaName(updated)} was updated.`);
      } else {
        const created = await locationApiService.createAdminServiceArea({
          province: pendingAreaSave.province,
          city: pendingAreaSave.city,
          barangay: pendingAreaSave.barangay,
          center_latitude: pendingAreaSave.center_latitude,
          center_longitude: pendingAreaSave.center_longitude,
          notes: pendingAreaSave.notes,
          is_active: true,
          reason: reason || 'Activated new SALO service area',
        });
        setAreas((prev) => [...prev, created]);
        setSelectedAreaId(created.id);
        setNotice(`${formatAreaName(created)} was added and activated.`);
      }
      setFormOpen(false);
    } catch (err) {
      setErrorMsg(err?.message || 'Unable to save service area.');
    } finally {
      setPendingAreaSave(null);
    }
  }

  async function confirmAreaStatus({ reason }) {
    if (!pendingAreaStatus) return;
    const { area, nextActive } = pendingAreaStatus;
    try {
      const updated = await locationApiService.updateAdminServiceArea(area.id, {
        is_active: nextActive,
        reason: reason || (nextActive ? 'Activated service area' : 'Deactivated service area'),
      });
      setAreas((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setNotice(`${formatAreaName(updated)} is now ${updated.status.toLowerCase()}.`);
    } catch (err) {
      setErrorMsg(err?.message || 'Unable to update service area status.');
    } finally {
      setPendingAreaStatus(null);
    }
  }

  const columns = [
    { key: 'province', label: 'Province', sortable: true },
    { key: 'city', label: 'City / Municipality', sortable: true, render: (row) => row.city || 'All Cities (Province-wide)' },
    { key: 'barangay', label: 'Barangay', sortable: true, render: (row) => row.barangay || (row.city ? 'All Barangays (City-wide)' : '—') },
    { key: 'area_level', label: 'Level', sortable: true },
    { key: 'restaurant_count', label: 'Restaurants', align: 'right', sortable: true },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="admin-inline-actions">
          <Button variant="ghost" size="sm" onClick={() => setSelectedAreaId(row.id)}>
            Inspect
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
              Edit
            </Button>
          )}
          {row.is_active && canDeactivate && (
            <Button
              variant="danger-outline"
              size="sm"
              onClick={() => setPendingAreaStatus({ area: row, nextActive: false })}
            >
              Deactivate
            </Button>
          )}
          {!row.is_active && canActivate && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setPendingAreaStatus({ area: row, nextActive: true })}
            >
              Activate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AdminLayout>
      <div className="admin-page">
        <PageHeader
          eyebrow="Platform Operations"
          title="Service Area Management"
          description="Define where SALO officially operates across the Philippines (Province → City/Municipality → Barangay). Restaurant delivery coverage is strictly restricted to active platform service areas."
          actions={
            canEdit && (
              <Button variant="primary" size="md" onClick={openCreate}>
                + Add Service Area
              </Button>
            )
          }
        />

        {notice && (
          <div className="salo-loc-status-banner is-success" role="status">
            {notice}
          </div>
        )}
        {errorMsg && (
          <div className="salo-loc-status-banner is-error" role="alert">
            {errorMsg}
          </div>
        )}

        <Tabs
          tabs={['Service areas & map', 'Operational monitoring']}
          activeTab={view}
          onChange={setView}
        />

        {view === 'Service areas & map' ? (
          <>
            <div className="admin-card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <strong>SALO Operational Coverage Map</strong>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    Green = Active service area · Gray = Inactive service area. Barangay-level areas do not mark entire cities as covered.
                  </div>
                </div>
                {selectedArea && (
                  <div style={{ fontSize: '0.8125rem' }}>
                    <strong>Inspecting:</strong> {formatAreaName(selectedArea)} ({selectedArea.status})
                  </div>
                )}
              </div>

              <SharedMap
                center={
                  selectedArea && Number.isFinite(Number(selectedArea.center_latitude))
                    ? { lat: Number(selectedArea.center_latitude), lng: Number(selectedArea.center_longitude) }
                    : { lat: 12.8797, lng: 121.774 }
                }
                zoom={selectedArea && Number.isFinite(Number(selectedArea.center_latitude)) ? 13 : 6}
                height={320}
                markers={mapMarkers}
                circles={mapCircles}
                interactive
                showCoordsChip={false}
                ariaLabel="Admin service area coverage map"
              />
            </div>

            <DataTable
              columns={columns}
              rows={areaRows}
              loading={loading}
              emptyTitle="No service areas configured"
              emptyDescription="Add a Philippine province, city/municipality, or barangay to activate SALO ordering."
            />
          </>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            <div className="admin-card">
              <h3 style={{ marginTop: 0 }}>Active Restaurants ({overview.restaurants.length})</h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Registered restaurant physical locations across the platform.
              </p>
              <DataTable
                columns={[
                  { key: 'restaurant_name', label: 'Restaurant', sortable: true },
                  { key: 'address', label: 'Physical Address' },
                  { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                ]}
                rows={overview.restaurants}
                loading={loading}
              />
            </div>

            <div className="admin-card">
              <h3 style={{ marginTop: 0 }}>Active Deliveries & Live Rider Locations ({overview.active_deliveries.length})</h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Live rider GPS is shown only for riders with an active delivery assignment.
              </p>
              <DataTable
                columns={[
                  { key: 'order_reference', label: 'Order Ref', sortable: true },
                  { key: 'restaurant_name', label: 'Pickup' },
                  { key: 'delivery_address', label: 'Drop-off' },
                  { key: 'rider_name', label: 'Rider', render: (r) => r.rider_name || 'Unassigned' },
                  {
                    key: 'rider_location',
                    label: 'Latest GPS',
                    render: (r) =>
                      r.rider_location
                        ? `${r.rider_location.latitude.toFixed(5)}, ${r.rider_location.longitude.toFixed(5)}`
                        : 'Waiting for GPS',
                  },
                  { key: 'delivery_status', label: 'Status', render: (r) => <StatusBadge status={r.delivery_status} /> },
                ]}
                rows={overview.active_deliveries}
                loading={loading}
              />
            </div>
          </div>
        )}

        {/* Create / Edit Service Area Modal */}
        <Modal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title={editing ? `Edit Service Area: ${formatAreaName(editing)}` : 'Add Platform Service Area'}
          size="lg"
        >
          <form onSubmit={saveArea} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <PhilippineAddressFields
              value={addressForm}
              onChange={(next) => {
                if (!editing) setAddressForm(next);
              }}
              showStreetAndDetails={false}
              requireBarangay={false}
              requireCity={false}
              disabled={Boolean(editing)}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Click on the map to set the area center marker (optional):
              </span>
              <Button type="button" variant="outline" size="sm" onClick={handleGeocodeAreaCenter}>
                Locate on Map
              </Button>
            </div>

            <SharedMap
              center={centerCoords}
              zoom={13}
              height={220}
              pin={{ lat: centerCoords.lat, lng: centerCoords.lng, draggable: true, title: 'Service Area Center' }}
              onPinChange={({ lat, lng }) => setCenterCoords({ lat, lng })}
              ariaLabel="Service area center pin map"
            />

            <div>
              <label className="salo-ph-label" htmlFor="sa-notes">Administrative Notes (Optional)</label>
              <input
                id="sa-notes"
                type="text"
                className="salo-ph-input"
                value={notes}
                placeholder="e.g. Launch phase 1 coverage, weekday hours"
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                {editing ? 'Save Changes' : 'Add Service Area'}
              </Button>
            </div>
          </form>
        </Modal>

        <ConfirmDialog
          open={Boolean(pendingAreaSave)}
          title={pendingAreaSave?.editing ? 'Confirm Service Area Update' : 'Confirm New Service Area'}
          description="This administrative change will be recorded in SALO audit logs."
          confirmLabel="Confirm & Save"
          requireReason
          onCancel={() => setPendingAreaSave(null)}
          onConfirm={confirmAreaSave}
        />

        <ConfirmDialog
          open={Boolean(pendingAreaStatus)}
          title={pendingAreaStatus?.nextActive ? 'Activate Service Area' : 'Deactivate Service Area'}
          description={
            pendingAreaStatus?.nextActive
              ? `Activate ${pendingAreaStatus ? formatAreaName(pendingAreaStatus.area) : ''} for SALO ordering and restaurant delivery coverage?`
              : `Deactivate ${pendingAreaStatus ? formatAreaName(pendingAreaStatus.area) : ''}? Customers will no longer be able to place new delivery orders here.`
          }
          confirmLabel={pendingAreaStatus?.nextActive ? 'Activate' : 'Deactivate'}
          requireReason
          onCancel={() => setPendingAreaStatus(null)}
          onConfirm={confirmAreaStatus}
        />
      </div>
    </AdminLayout>
  );
}

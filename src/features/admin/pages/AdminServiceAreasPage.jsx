import { useMemo, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import Button from '../../../components/common/Button';
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
import { getAdminMock } from '../mocks';
import './AdminPages.css';

const INITIAL_AREAS = getAdminMock('serviceAreas').data.map((area) => ({
  ...area,
  neighborhoods: [...area.neighborhoods],
  zones: area.zones.map((zone) => ({ ...zone, riderIds: [...zone.riderIds], restaurantIds: [...zone.restaurantIds] })),
}));
const RESTAURANTS = getAdminMock('restaurants').data;
const RIDERS = getAdminMock('riders').data;

export default function AdminServiceAreasPage() {
  const { permissions } = useAdminSession();
  const { query: globalQuery } = useAdminPageSearch({ scopeLabel: 'Service Areas', placeholder: 'Search service areas by name, city, or zone', searchableFields: ['name', 'city', 'zoneNames', 'status'] });
  const [areas, setAreas] = useState(INITIAL_AREAS);
  const [view, setView] = useState('Areas and zones');
  const [selectedAreaId, setSelectedAreaId] = useState(INITIAL_AREAS[0]?.id || '');
  const [selectedZoneName, setSelectedZoneName] = useState(INITIAL_AREAS[0]?.zones[0]?.name || '');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', city: '', neighborhoods: '', zones: '' });
  const [assignments, setAssignments] = useState(null);
  const [pendingArea, setPendingArea] = useState(null);
  const [pendingAreaSave, setPendingAreaSave] = useState(null);
  const [pendingAssignments, setPendingAssignments] = useState(null);
  const [notice, setNotice] = useState('');
  const canEdit = Boolean(permissions.serviceAreas?.some((action) => ['create', 'edit'].includes(action)));
  const canActivate = permissions.serviceAreas?.includes('activate');
  const canDeactivate = permissions.serviceAreas?.includes('deactivate');
  const selectedArea = areas.find((area) => area.id === selectedAreaId);
  const selectedZone = selectedArea?.zones.find((zone) => zone.name === selectedZoneName);

  const areaRows = useMemo(() => {
    const term = globalQuery.trim().toLowerCase();
    return areas.map((area) => ({
    ...area,
    zoneNames: area.zones.map((zone) => zone.name).join(', '),
    riderCount: new Set(area.zones.flatMap((zone) => zone.riderIds)).size,
    restaurantCount: new Set(area.zones.flatMap((zone) => zone.restaurantIds)).size,
    })).filter((area) => !term || [area.name, area.city, area.zoneNames, area.status].some((v) => String(v || '').toLowerCase().includes(term)));
  }, [areas, globalQuery]);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', city: '', neighborhoods: '', zones: '' });
    setFormOpen(true);
  }

  function openEdit(area) {
    setEditing(area);
    setForm({
      name: area.name,
      city: area.city,
      neighborhoods: area.neighborhoods.join(', '),
      zones: area.zones.map((zone) => zone.name).join(', '),
    });
    setFormOpen(true);
  }

  function saveArea(event) {
    event.preventDefault();
    const neighborhoods = form.neighborhoods.split(',').map((item) => item.trim()).filter(Boolean);
    const zoneNames = form.zones.split(',').map((item) => item.trim()).filter(Boolean);
    if (!form.name.trim() || !form.city.trim() || !zoneNames.length) {
      setNotice('Enter an area name, city, and at least one delivery zone.');
      return;
    }
    setPendingAreaSave({ editing, name: form.name.trim(), city: form.city.trim(), neighborhoods, zoneNames });
  }

  function confirmAreaSave({ reason }) {
    const { editing: areaToEdit, name, city, neighborhoods, zoneNames } = pendingAreaSave;
    if (areaToEdit) {
      const currentZones = new Map(areaToEdit.zones.map((zone) => [zone.name, zone]));
      const updated = { ...areaToEdit, name, city, neighborhoods, zones: zoneNames.map((zoneName) => currentZones.get(zoneName) || { name: zoneName, riderIds: [], restaurantIds: [] }), updateReason: reason };
      setAreas((previous) => previous.map((area) => area.id === areaToEdit.id ? updated : area));
      setSelectedAreaId(areaToEdit.id);
      setSelectedZoneName(zoneNames[0] || '');
      setNotice(`${updated.name} was updated.`);
    } else {
      const area = { id: `area-${Date.now()}`, name, city, neighborhoods, zones: zoneNames.map((zoneName) => ({ name: zoneName, riderIds: [], restaurantIds: [] })), status: 'Active', updateReason: reason };
      setAreas((previous) => [...previous, area]);
      setSelectedAreaId(area.id);
      setSelectedZoneName(area.zones[0]?.name || '');
      setNotice(`${area.name} was created.`);
    }
    setPendingAreaSave(null);
    setFormOpen(false);
  }

  function requestAreaStatus(area, status) {
    setPendingArea({ area, status });
  }

  function confirmAreaStatus({ reason }) {
    const { area, status } = pendingArea;
    setAreas((previous) => previous.map((item) => item.id === area.id ? { ...item, status, statusReason: reason } : item));
    setPendingArea(null);
    setNotice(`${area.name} is now ${status.toLowerCase()}.`);
  }

  function saveAssignments() {
    if (!selectedArea || !selectedZone) return;
    setPendingAssignments({
      areaId: selectedArea.id,
      areaName: selectedArea.name,
      zoneName: selectedZone.name,
      riderIds: assignments ?? selectedZone.riderIds,
    });
  }

  function confirmAssignments({ reason }) {
    const { areaId, areaName, zoneName, riderIds } = pendingAssignments;
    setAreas((previous) => previous.map((area) => area.id === areaId ? {
      ...area,
      zones: area.zones.map((zone) => zone.name === zoneName ? { ...zone, riderIds, assignmentReason: reason } : zone),
    } : area));
    setNotice(`Rider assignments saved for ${zoneName} in ${areaName}.`);
    setPendingAssignments(null);
  }

  function toggleRider(riderId) {
    setAssignments((current) => {
      const currentAssignments = current ?? selectedZone?.riderIds ?? [];
      return currentAssignments.includes(riderId)
        ? currentAssignments.filter((id) => id !== riderId)
        : [...currentAssignments, riderId];
    });
  }

  const coverageRows = RESTAURANTS.map((restaurant) => ({
    ...restaurant,
    physicalLocation: `${restaurant.address} (${restaurant.zone})`,
    deliveryCoverage: (restaurant.serviceCoverage || []).join(', ') || 'Not declared',
    coverageStatus: (restaurant.serviceCoverage || []).some((location) => areas.some((area) => area.status === 'Active' && (area.city === location || area.name === location))) ? 'Supported' : 'Review required',
  }));
  const availabilityRows = areas.flatMap((area) => area.zones.map((zone) => {
    const assigned = RIDERS.filter((rider) => zone.riderIds.includes(rider.id));
    return {
      id: `${area.id}-${zone.name}`,
      area: area.name,
      zone: zone.name,
      assigned: assigned.length,
      online: assigned.filter((rider) => rider.isOnline).length,
      available: assigned.filter((rider) => rider.isOnline && !rider.onDelivery).length,
      status: area.status,
    };
  }));

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Service Areas and Delivery Zones" description="Manage supported cities, neighborhoods, delivery zones, restaurant coverage, and rider assignments." actions={canEdit ? <Button variant="primary" onClick={openCreate}>Create service area</Button> : null} />
        {notice && <p className="admin-inline-notice" role="status">{notice}</p>}
        <div className="admin-shell-note"><strong>Coverage policy:</strong> Delivery is blocked outside active service coverage. Pickup and reservation availability are evaluated separately from delivery coverage.</div>
        <Tabs items={['Areas and zones', 'Restaurant coverage', 'Rider availability']} value={view} onChange={setView} label="Service area views" />
        {view === 'Areas and zones' && <>
          <DataTable tableSearch={globalQuery} defaultOrder={[[0, 'asc']]} columns={[
            { key: 'name', label: 'Area / city', render: (area) => <><strong>{area.name}</strong><br /><span className="admin-muted">{area.city}</span></> },
            { key: 'neighborhoods', label: 'Neighborhoods', render: (area) => area.neighborhoods.join(', ') || 'None listed' },
            { key: 'zoneNames', label: 'Delivery zones' },
            { key: 'restaurantCount', label: 'Restaurants in zones' },
            { key: 'riderCount', label: 'Assigned riders' },
            { key: 'status', label: 'Status', render: (area) => <StatusBadge status={area.status} /> },
            { key: 'actions', label: 'Actions', render: (area) => <div className="admin-action-row">{canEdit && <button className="admin-action-button" type="button" onClick={() => openEdit(area)}>Edit</button>}{area.status === 'Active' && canDeactivate && <button className="admin-action-button admin-action-button--danger" type="button" onClick={() => requestAreaStatus(area, 'Deactivated')}>Deactivate</button>}{area.status !== 'Active' && canActivate && <button className="admin-action-button" type="button" onClick={() => requestAreaStatus(area, 'Active')}>Activate</button>}</div> },
          ]} rows={areaRows} emptyTitle="No service areas" emptyDescription="Create a service area to define supported cities and delivery zones." />
          {areas.length > 0 && <section className="admin-record-panel">
            <h2>Assign riders to zones</h2>
            <div className="admin-filter-bar">
              <label className="admin-filter-control">Service area<select aria-label="Select service area" value={selectedAreaId} onChange={(event) => { setSelectedAreaId(event.target.value); const area = areas.find((item) => item.id === event.target.value); setSelectedZoneName(area?.zones[0]?.name || ''); setAssignments(null); }} >{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
              <label className="admin-filter-control">Delivery zone<select aria-label="Select delivery zone" value={selectedZoneName} onChange={(event) => { setSelectedZoneName(event.target.value); setAssignments(null); }}>{selectedArea?.zones.map((zone) => <option key={zone.name}>{zone.name}</option>)}</select></label>
            </div>
            {selectedZone ? <div className="admin-rider-assignment-list">{RIDERS.filter((rider) => rider.status === 'Active').map((rider) => <label key={rider.id}><input type="checkbox" checked={(assignments ?? selectedZone.riderIds ?? []).includes(rider.id)} onChange={() => toggleRider(rider.id)} disabled={!canEdit} /><span><strong>{rider.name}</strong><small>{rider.isOnline ? 'Online' : 'Offline'} · {rider.zone}</small></span></label>)}</div> : <p>Select a zone to manage assignments.</p>}
            {canEdit && selectedZone && <Button variant="outline" onClick={saveAssignments}>Save rider assignments</Button>}
          </section>}
        </>}
        {view === 'Restaurant coverage' && <><p className="admin-muted">Physical restaurant location is shown separately from its declared delivery coverage.</p><DataTable tableSearch={globalQuery} defaultOrder={[[0, 'asc']]} columns={[
          { key: 'name', label: 'Restaurant', render: (restaurant) => <strong>{restaurant.name}</strong> },
          { key: 'physicalLocation', label: 'Physical location' },
          { key: 'deliveryCoverage', label: 'Declared delivery coverage' },
          { key: 'coverageStatus', label: 'Area review', render: (restaurant) => <StatusBadge status={restaurant.coverageStatus} /> },
        ]} rows={coverageRows} emptyTitle="No restaurant coverage records" emptyDescription="There are no restaurant records available for coverage review." /></>}
        {view === 'Rider availability' && <DataTable tableSearch={globalQuery} defaultOrder={[[0, 'asc']]} columns={[
          { key: 'area', label: 'Service area' },
          { key: 'zone', label: 'Delivery zone' },
          { key: 'assigned', label: 'Assigned riders' },
          { key: 'online', label: 'Online' },
          { key: 'available', label: 'Available now' },
          { key: 'status', label: 'Area status', render: (row) => <StatusBadge status={row.status} /> },
        ]} rows={availabilityRows} emptyTitle="No rider zones" emptyDescription="Create an area and zones to review rider coverage." />}
      </section>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} size="md" title={editing ? 'Edit service area' : 'Create service area'} footer={<><Button variant="ghost" type="button" onClick={() => setFormOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="service-area-form">{editing ? 'Review changes' : 'Review new area'}</Button></>}>
        <form id="service-area-form" className="admin-modal-form" onSubmit={saveArea}>


          <label className="admin-filter-control">Area name<input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="admin-filter-control">City<input required value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} /></label>
          <label className="admin-filter-control">Neighborhoods (comma-separated)<input value={form.neighborhoods} onChange={(event) => setForm((current) => ({ ...current, neighborhoods: event.target.value }))} /></label>
          <label className="admin-filter-control">Delivery zones (comma-separated)<input required value={form.zones} onChange={(event) => setForm((current) => ({ ...current, zones: event.target.value }))} /></label>
          <p>Pickup and reservation availability do not automatically follow delivery coverage.</p>
          <p className="admin-shell-note">Pickup and reservation availability do not automatically follow delivery coverage.</p>

        </form>
      </Modal>



      <ConfirmDialog
        open={Boolean(pendingAreaSave)}
        title={pendingAreaSave?.editing ? 'Confirm service-area changes' : 'Confirm new service area'}
        description="Area or zone changes affect future delivery coverage. They do not change pickup or reservation eligibility."
        confirmLabel={pendingAreaSave?.editing ? 'Save changes' : 'Create area'}
        requireReauthentication
        requireReason
        onClose={() => setPendingAreaSave(null)}
        onConfirm={confirmAreaSave}
      />
      <ConfirmDialog
        open={Boolean(pendingAssignments)}
        title={`Confirm rider assignments for ${pendingAssignments?.zoneName || 'zone'}`}
        description="Zone assignments are recorded for coverage planning."
        confirmLabel="Save assignments"
        requireReauthentication
        requireReason
        onClose={() => setPendingAssignments(null)}
        onConfirm={confirmAssignments}
      />
      <ConfirmDialog
        open={Boolean(pendingArea)}
        title={`${pendingArea?.status === 'Active' ? 'Activate' : 'Deactivate'} ${pendingArea?.area.name || 'area'}?`}
        description="Changing coverage affects future delivery eligibility. Pickup and reservations are evaluated separately; historical orders are unchanged."
        confirmLabel={pendingArea?.status === 'Active' ? 'Activate area' : 'Deactivate area'}
        requireReauthentication
        requireReason
        onClose={() => setPendingArea(null)}
        onConfirm={confirmAreaStatus}
      />
    </AdminLayout>
  );
}

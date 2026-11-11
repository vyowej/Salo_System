import { useCallback, useEffect, useState } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { EmptyState, ErrorState, LoadingSpinner } from '../../../components/feedback';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import './OwnerTablesPage.css';

const EMPTY_TABLE = { name: '', number: '', capacity: '2', description: '', area: '', status: 'Available' };

function todayLocal() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function OwnerTablesPage() {
  const access = useRestaurantAccess();
  const restaurantId = access.selectedRestaurantId;
  const [tables, setTables] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('all');
  const [capacityFilter, setCapacityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [date, setDate] = useState(todayLocal);
  const [editingTable, setEditingTable] = useState(null);
  const [tableForm, setTableForm] = useState(EMPTY_TABLE);
  const [showTableForm, setShowTableForm] = useState(false);
  const [areaForm, setAreaForm] = useState('');
  const [editingArea, setEditingArea] = useState(null);
  const [schedule, setSchedule] = useState({ tableId: null, reservations: [] });
  const [saving, setSaving] = useState(false);

  const can = (permission) => access.canAccess([permission]);

  const loadTables = useCallback(() => {
    setLoading(true);
    setError('');
    try {
      setTables(ownerService.getTables(restaurantId, date));
      setAreas(ownerService.getDiningAreas(restaurantId));
    } catch (loadError) {
      setError(loadError.message || 'Unable to load table data.');
    } finally {
      setLoading(false);
    }
  }, [date, restaurantId]);

  useEffect(() => {
    loadTables();
    window.addEventListener('salo:demoStoreUpdated', loadTables);
    return () => window.removeEventListener('salo:demoStoreUpdated', loadTables);
  }, [loadTables]);

  const visibleTables = tables.filter((table) => {
    const matchesText = `${table.name} ${table.number} ${table.description}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesArea = areaFilter === 'all' || table.area === areaFilter;
    const matchesCapacity = capacityFilter === 'all' || table.capacity >= Number(capacityFilter);
    const matchesStatus = statusFilter === 'all' || table.status === statusFilter;
    return matchesText && matchesArea && matchesCapacity && matchesStatus;
  });

  const runAction = (action) => {
    setSaving(true);
    setError('');
    try {
      action();
      loadTables();
    } catch (actionError) {
      setError(actionError.message || 'Unable to save this table change.');
    } finally {
      setSaving(false);
    }
  };

  const openNewTable = () => {
    setEditingTable(null);
    setTableForm({ ...EMPTY_TABLE, area: areas[0]?.name || '' });
    setShowTableForm(true);
  };

  const openEditTable = (table) => {
    setEditingTable(table);
    setTableForm({
      name: table.name,
      number: table.number || '',
      capacity: String(table.capacity),
      description: table.description || '',
      area: table.area,
      status: table.status === 'Unavailable' || table.status === 'Maintenance' ? table.status : 'Available',
    });
    setShowTableForm(true);
  };

  const saveTable = (event) => {
    event.preventDefault();
    runAction(() => {
      const payload = { ...tableForm, capacity: Number(tableForm.capacity) };
      if (editingTable) ownerService.updateTable(editingTable.id, payload, restaurantId);
      else ownerService.addTable(payload, restaurantId);
      setShowTableForm(false);
      setEditingTable(null);
      setTableForm(EMPTY_TABLE);
    });
  };

  const saveArea = (event) => {
    event.preventDefault();
    runAction(() => {
      if (editingArea) ownerService.updateDiningArea(editingArea, areaForm, restaurantId);
      else ownerService.addDiningArea(areaForm, restaurantId);
      setAreaForm('');
      setEditingArea(null);
    });
  };

  const toggleSchedule = (table) => {
    setError('');
    if (schedule.tableId === table.id) {
      setSchedule({ tableId: null, reservations: [] });
      return;
    }
    try {
      setSchedule({
        tableId: table.id,
        reservations: ownerService.getTableSchedule(table.id, date, restaurantId),
      });
    } catch (scheduleError) {
      setError(scheduleError.message || 'Unable to load this table schedule.');
    }
  };

  return (
    <OwnerLayout>
      <div className="owner-tables-page">
        {can('tables.add') && (
          <div className="owner-tables-header">
            <Button onClick={openNewTable}>Add table</Button>
          </div>
        )}

        {error && <div className="owner-tables-error" role="alert">{error}</div>}
        {loading ? <LoadingSpinner size="lg" label="Loading tables..." />
          : error && tables.length === 0 ? <ErrorState title="Tables could not be loaded" description={error} onRetry={loadTables} />
            : (
              <>
                <section className="owner-dining-areas" aria-labelledby="dining-areas-title">
                  <div className="owner-section-heading">
                    <div>
                      <h2 id="dining-areas-title">Dining areas</h2>
                      <p>Organize tables into restaurant spaces.</p>
                    </div>
                  </div>
                  <div className="owner-area-chips">
                    {areas.map((area) => (
                      <div className="owner-area-chip" key={area.id}>
                        <span>{area.name}</span>
                        {can('tables.edit') && (
                          <button type="button" onClick={() => { setEditingArea(area.id); setAreaForm(area.name); }} aria-label={`Rename ${area.name}`}>
                            Edit
                          </button>
                        )}
                      </div>
                    ))}
                    {can('tables.add') && (
                      <form className="owner-inline-form" onSubmit={saveArea}>
                        <label className="sr-only" htmlFor="dining-area-name">{editingArea ? 'Dining area name' : 'New dining area'}</label>
                        <input id="dining-area-name" value={areaForm} onChange={(event) => setAreaForm(event.target.value)} placeholder={editingArea ? 'Rename area' : 'New area'} required maxLength={60} />
                        <Button size="sm" type="submit" loading={saving}>{editingArea ? 'Save area' : 'Add area'}</Button>
                        {editingArea && <Button size="sm" variant="ghost" onClick={() => { setEditingArea(null); setAreaForm(''); }}>Cancel</Button>}
                      </form>
                    )}
                  </div>
                </section>

                <section className="owner-table-filters" aria-label="Table filters">
                  <label>
                    <span>Search tables</span>
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, number, description" />
                  </label>
                  <label>
                    <span>Dining area</span>
                    <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
                      <option value="all">All areas</option>
                      {areas.map((area) => <option key={area.id} value={area.name}>{area.name}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Minimum capacity</span>
                    <select value={capacityFilter} onChange={(event) => setCapacityFilter(event.target.value)}>
                      <option value="all">Any capacity</option>
                      {[2, 4, 6, 8].map((capacity) => <option key={capacity} value={capacity}>{capacity}+ guests</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Status</span>
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                      <option value="all">All statuses</option>
                      {['Available', 'Reserved', 'Occupied', 'Unavailable', 'Maintenance'].map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Schedule date</span>
                    <input type="date" value={date} onChange={(event) => { setDate(event.target.value); setSchedule({ tableId: null, reservations: [] }); }} />
                  </label>
                </section>

                {showTableForm && (
                  <form className="owner-table-form" onSubmit={saveTable}>
                    <div className="owner-section-heading">
                      <div><h2>{editingTable ? 'Edit table' : 'Add table'}</h2><p>Table availability and reservations remain restaurant-scoped.</p></div>
                    </div>
                    <div className="owner-table-form-grid">
                      <label><span>Table name *</span><input value={tableForm.name} onChange={(event) => setTableForm({ ...tableForm, name: event.target.value })} required maxLength={60} /></label>
                      <label><span>Number</span><input value={tableForm.number} onChange={(event) => setTableForm({ ...tableForm, number: event.target.value })} maxLength={20} /></label>
                      <label><span>Capacity *</span><input type="number" min="1" max="100" step="1" value={tableForm.capacity} onChange={(event) => setTableForm({ ...tableForm, capacity: event.target.value })} required /></label>
                      <label><span>Dining area *</span><select value={tableForm.area} onChange={(event) => setTableForm({ ...tableForm, area: event.target.value })} required>{areas.map((area) => <option key={area.id} value={area.name}>{area.name}</option>)}</select></label>
                      <label><span>Manual status</span><select value={tableForm.status} onChange={(event) => setTableForm({ ...tableForm, status: event.target.value })}><option>Available</option><option>Unavailable</option><option>Maintenance</option></select></label>
                      <label className="owner-table-description"><span>Description</span><textarea rows="2" value={tableForm.description} onChange={(event) => setTableForm({ ...tableForm, description: event.target.value })} maxLength={250} /></label>
                    </div>
                    <div className="owner-table-form-actions">
                      <Button type="submit" loading={saving}>{editingTable ? 'Save changes' : 'Create table'}</Button>
                      <Button variant="ghost" onClick={() => setShowTableForm(false)}>Cancel</Button>
                    </div>
                  </form>
                )}

                {!visibleTables.length ? <EmptyState title={tables.length ? 'No tables match these filters' : 'No tables yet'} description={tables.length ? 'Adjust the search or filters to see tables.' : 'Add a table to begin managing reservations.'} />
                  : (
                    <section className="owner-table-grid" aria-label="Restaurant tables">
                      {visibleTables.map((table) => (
                        <article className="owner-table-card" key={table.id}>
                          <div className="owner-table-card-heading">
                            <div><span className="owner-table-number">Table {table.number || table.name}</span><h2>{table.name}</h2></div>
                            <Badge variant={table.status === 'Available' ? 'success' : table.status === 'Reserved' ? 'warning' : 'default'}>{table.status}</Badge>
                          </div>
                          <p>{table.area} · Seats {table.capacity}</p>
                          {table.description && <p className="owner-table-description-text">{table.description}</p>}
                          <div className="owner-table-card-actions">
                            <Button size="sm" variant="outline" onClick={() => toggleSchedule(table)}>{schedule.tableId === table.id ? 'Hide schedule' : 'View schedule'}</Button>
                            {can('tables.edit') && <Button size="sm" variant="ghost" onClick={() => openEditTable(table)}>Edit</Button>}
                            {can('tables.manageAvailability') && (
                              <Button
                                size="sm"
                                variant={table.status === 'Unavailable' ? 'outline' : 'ghost'}
                                onClick={() => runAction(() => ownerService.setTableAvailability(table.id, table.status === 'Unavailable' ? 'Available' : 'Unavailable', restaurantId))}
                              >
                                {table.status === 'Unavailable' ? 'Restore' : 'Mark unavailable'}
                              </Button>
                            )}
                          </div>
                          {schedule.tableId === table.id && (
                            <div className="owner-table-schedule">
                              <h3>Reservations · {date}</h3>
                              {!schedule.reservations.length ? <p>No reservations scheduled for this date.</p> : schedule.reservations.map((reservation) => (
                                <div key={reservation.id}>
                                  <strong>{reservation.time} · {reservation.guestName}</strong>
                                  <span>{reservation.guests || reservation.partySize} guests · {reservation.status} · #{reservation.reference || reservation.id}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </article>
                      ))}
                    </section>
                  )}
              </>
            )}
      </div>
    </OwnerLayout>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import { EmptyState, ErrorState, LoadingSpinner } from '../../../components/feedback';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import { getTableEditConflicts } from '../../../services/demo/tableRules';
import { STANDARD_TIME_SLOTS } from '../../../services/demo/reservationAvailability';
import './OwnerTablesPage.css';

const TABLE_TYPES = ['Indoor', 'Outdoor', 'Private', 'Booth', 'Bar / High Top'];

const EMPTY_TABLE_FORM = {
  name: '',
  number: '',
  capacity: '4',
  type: 'Indoor',
  area: '',
  status: 'Active',
  description: '',
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function OwnerTablesPage() {
  const access = useRestaurantAccess();
  const restaurantId = access.selectedRestaurantId;

  const [tables, setTables] = useState([]);
  const [areas, setAreas] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [saving, setSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [capacityFilter, setCapacityFilter] = useState('all');
  const [scheduleDate, setScheduleDate] = useState(localDateKey);
  const [scheduleTime, setScheduleTime] = useState('all');

  // Add / Edit Modal
  const [showTableModal, setShowTableModal] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [tableForm, setTableForm] = useState(EMPTY_TABLE_FORM);
  const [formErrors, setFormErrors] = useState({});

  // Archive / Deactivate Modal
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveConflicts, setArchiveConflicts] = useState([]);

  // Dining Areas Collapsible
  const [showAreasSection, setShowAreasSection] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');
  const [editingArea, setEditingArea] = useState(null);
  const [editingAreaName, setEditingAreaName] = useState('');

  // Table Schedule Accordion
  const [expandedScheduleId, setExpandedScheduleId] = useState(null);
  const [scheduleReservations, setScheduleReservations] = useState([]);

  const can = (permission) => access.canAccess([permission]);

  const showFeedback = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3500);
  };

  const loadData = useCallback(() => {
    if (!restaurantId) return;
    setLoading(true);
    setError('');
    try {
      const activeTime = scheduleTime === 'all' ? null : scheduleTime;
      const loadedTables = ownerService.getTables(restaurantId, scheduleDate, activeTime);
      const loadedAreas = ownerService.getDiningAreas(restaurantId);
      const loadedRes = ownerService.getReservations(restaurantId);
      setTables(loadedTables || []);
      setAreas(loadedAreas || []);
      setReservations(loadedRes || []);
    } catch (err) {
      setError(err.message || 'Unable to load table data.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId, scheduleDate, scheduleTime]);

  useEffect(() => {
    loadData();
    window.addEventListener('salo:demoStoreUpdated', loadData);
    return () => window.removeEventListener('salo:demoStoreUpdated', loadData);
  }, [loadData]);

  const runAction = (action, successMsg = 'Table updated successfully.') => {
    setSaving(true);
    setError('');
    try {
      action();
      loadData();
      showFeedback(successMsg);
    } catch (err) {
      setError(err.message || 'Unable to complete this action.');
    } finally {
      setSaving(false);
    }
  };

  // ── Statistics Summary Cards ──────────────────────────────────────
  const stats = useMemo(() => {
    const total = tables.length;
    const active = tables.filter((t) => t.isActive !== false && t.status !== 'Inactive' && !t.isArchived);
    const capacity = active.reduce((sum, t) => sum + (Number(t.capacity) || 0), 0);
    const inUse = active.filter((t) => t.status === 'Reserved' || t.status === 'Occupied').length;
    const inactive = tables.filter((t) => t.isActive === false || t.status === 'Inactive' || t.isArchived).length;

    return { total, activeCount: active.length, capacity, inUse, inactive };
  }, [tables]);

  // ── Filtered Tables ───────────────────────────────────────────────
  const visibleTables = useMemo(() => {
    return tables.filter((t) => {
      const query = search.trim().toLowerCase();
      const matchesSearch = !query || [t.name, t.number, t.area, t.type, t.description]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(query));

      const isInactive = t.isActive === false || t.status === 'Inactive' || t.isArchived;

      let matchesStatus = true;
      if (statusFilter === 'Active') matchesStatus = !isInactive;
      else if (statusFilter === 'Inactive') matchesStatus = isInactive;
      else if (statusFilter !== 'all') matchesStatus = t.status === statusFilter;

      const matchesType = typeFilter === 'all' || (t.type || 'Indoor').toLowerCase() === typeFilter.toLowerCase();
      const matchesArea = areaFilter === 'all' || t.area === areaFilter;
      const matchesCapacity = capacityFilter === 'all' || Number(t.capacity) >= Number(capacityFilter);

      return matchesSearch && matchesStatus && matchesType && matchesArea && matchesCapacity;
    });
  }, [tables, search, statusFilter, typeFilter, areaFilter, capacityFilter]);

  // ── Form Validation ───────────────────────────────────────────────
  const validateForm = (formValues, currentTable = null) => {
    const errors = {};
    const trimmedName = String(formValues.name || '').trim();
    const trimmedNumber = String(formValues.number || '').trim();
    const parsedCap = Number(formValues.capacity);

    if (!trimmedName) {
      errors.name = 'Table name is required.';
    } else if (trimmedName.length > 60) {
      errors.name = 'Name must be 60 characters or less.';
    } else {
      const duplicateName = tables.find(
        (t) => (!currentTable || t.id !== currentTable.id) && t.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicateName) {
        errors.name = `A table named "${trimmedName}" already exists.`;
      }
    }

    if (trimmedNumber) {
      const duplicateNumber = tables.find(
        (t) => (!currentTable || t.id !== currentTable.id) && t.number && t.number.toLowerCase() === trimmedNumber.toLowerCase()
      );
      if (duplicateNumber) {
        errors.number = `Table #${trimmedNumber} is already taken in this restaurant.`;
      }
    }

    if (!formValues.capacity || !Number.isInteger(parsedCap) || parsedCap < 1 || parsedCap > 100) {
      errors.capacity = 'Capacity must be a whole number between 1 and 100.';
    }

    if (!formValues.area && areas.length > 0) {
      errors.area = 'Please select a dining area.';
    }

    return errors;
  };

  const handleOpenAddModal = () => {
    setEditingTable(null);
    setTableForm({
      ...EMPTY_TABLE_FORM,
      area: areas[0]?.name || 'Indoor',
    });
    setFormErrors({});
    setShowTableModal(true);
  };

  const handleOpenEditModal = (table) => {
    setEditingTable(table);
    setTableForm({
      name: table.name || '',
      number: table.number || '',
      capacity: String(table.capacity || '4'),
      type: table.type || 'Indoor',
      area: table.area || areas[0]?.name || 'Indoor',
      status: table.isActive === false || table.status === 'Inactive' || table.isArchived ? 'Inactive' : 'Active',
      description: table.description || '',
    });
    setFormErrors({});
    setShowTableModal(true);
  };

  const handleFormChange = (field, value) => {
    const updated = { ...tableForm, [field]: value };
    setTableForm(updated);

    // Live validation for field
    if (field === 'name' || field === 'number' || field === 'capacity') {
      const errors = validateForm(updated, editingTable);
      setFormErrors((prev) => ({ ...prev, [field]: errors[field] }));
    }
  };

  const handleSaveTable = (e) => {
    e.preventDefault();
    const errors = validateForm(tableForm, editingTable);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const payload = {
      name: tableForm.name.trim(),
      number: tableForm.number.trim(),
      capacity: Number(tableForm.capacity),
      type: tableForm.type,
      area: tableForm.area,
      status: tableForm.status === 'Active' ? 'Available' : 'Inactive',
      isActive: tableForm.status === 'Active',
      description: tableForm.description.trim(),
    };

    runAction(() => {
      if (editingTable) {
        ownerService.updateTable(editingTable.id, payload, restaurantId);
      } else {
        ownerService.addTable(payload, restaurantId);
      }
      setShowTableModal(false);
      setEditingTable(null);
    }, editingTable ? `Table "${payload.name}" updated successfully.` : `Table "${payload.name}" created successfully.`);
  };

  // ── Archiving / Deactivating ──────────────────────────────────────
  const handleOpenArchiveModal = (table) => {
    setArchiveTarget(table);
    try {
      const conflicts = getTableEditConflicts(table, { isActive: false, status: 'Inactive' }, reservations, 120);
      setArchiveConflicts(conflicts);
    } catch {
      setArchiveConflicts([]);
    }
  };

  const handleConfirmArchive = () => {
    if (!archiveTarget) return;
    runAction(() => {
      ownerService.archiveTable(archiveTarget.id, restaurantId);
      setArchiveTarget(null);
      setArchiveConflicts([]);
    }, `Table "${archiveTarget.name}" archived and marked Inactive.`);
  };

  const handleReactivateTable = (table) => {
    runAction(() => {
      ownerService.reactivateTable(table.id, restaurantId);
    }, `Table "${table.name}" reactivated and restored to available inventory.`);
  };

  // ── Dining Areas Actions ──────────────────────────────────────────
  const handleAddArea = (e) => {
    e.preventDefault();
    if (!newAreaName.trim()) return;
    runAction(() => {
      ownerService.addDiningArea(newAreaName.trim(), restaurantId);
      setNewAreaName('');
    }, `Dining area "${newAreaName.trim()}" added.`);
  };

  const handleUpdateArea = (e) => {
    e.preventDefault();
    if (!editingArea || !editingAreaName.trim()) return;
    runAction(() => {
      ownerService.updateDiningArea(editingArea.id, editingAreaName.trim(), restaurantId);
      setEditingArea(null);
      setEditingAreaName('');
    }, `Dining area updated.`);
  };

  // ── Table Schedule Toggle ─────────────────────────────────────────
  const handleToggleSchedule = (table) => {
    if (expandedScheduleId === table.id) {
      setExpandedScheduleId(null);
      setScheduleReservations([]);
      return;
    }
    try {
      const sched = ownerService.getTableSchedule(table.id, scheduleDate, restaurantId);
      setScheduleReservations(sched || []);
      setExpandedScheduleId(table.id);
    } catch (err) {
      setError(err.message || 'Unable to load table schedule.');
    }
  };

  return (
    <OwnerLayout>
      <div className="owner-tables-page">
        {/* ── Top Header ────────────────────────────────────────────── */}
        <header className="owner-tables__header">
          <div className="owner-tables__header-left">
            <span className="owner-tables__badge">
              🍽️ Restaurant Operations
            </span>
            <h1 className="owner-tables__title">Table Management</h1>
            <p className="owner-tables__desc">
              Manage dining layout, seating capacities, table types, and reservation availability.
            </p>
          </div>

          <div className="owner-tables__header-actions">
            <Link to="/owner/reservations" style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="sm">
                📅 Reservation Calendar
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAreasSection((prev) => !prev)}
            >
              🏢 {showAreasSection ? 'Hide Dining Areas' : 'Manage Dining Areas'}
            </Button>
            {can('tables.add') && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenAddModal}
              >
                + Add Table
              </Button>
            )}
          </div>
        </header>

        {error && <ErrorState message={error} />}
        {successMessage && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.12)',
            color: '#065f46',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: 'var(--radius-md, 10px)',
            padding: '10px 14px',
            fontSize: '13px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            ✓ {successMessage}
          </div>
        )}

        {/* ── Statistics Summary Cards (5 Cards) ──────────────────────── */}
        <section className="owner-tables-stats" aria-label="Table Statistics Summary">
          <div className="owner-tables-stat-card">
            <div className="owner-tables-stat-icon" style={{ background: 'rgba(234, 88, 12, 0.1)', color: 'var(--accent)' }}>
              🍽️
            </div>
            <div className="owner-tables-stat-info">
              <span className="owner-tables-stat-value">{stats.total}</span>
              <span className="owner-tables-stat-label">Total Tables</span>
            </div>
          </div>

          <div className="owner-tables-stat-card">
            <div className="owner-tables-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
              ✓
            </div>
            <div className="owner-tables-stat-info">
              <span className="owner-tables-stat-value">{stats.activeCount}</span>
              <span className="owner-tables-stat-label">Active Tables</span>
            </div>
          </div>

          <div className="owner-tables-stat-card">
            <div className="owner-tables-stat-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }}>
              👥
            </div>
            <div className="owner-tables-stat-info">
              <span className="owner-tables-stat-value">{stats.capacity}</span>
              <span className="owner-tables-stat-label">Total Seating Capacity</span>
            </div>
          </div>

          <div className="owner-tables-stat-card">
            <div className="owner-tables-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#d97706' }}>
              📅
            </div>
            <div className="owner-tables-stat-info">
              <span className="owner-tables-stat-value">{stats.inUse}</span>
              <span className="owner-tables-stat-label">Reserved / In Use</span>
            </div>
          </div>

          <div className="owner-tables-stat-card">
            <div className="owner-tables-stat-icon" style={{ background: 'rgba(100, 116, 139, 0.1)', color: '#64748b' }}>
              🔒
            </div>
            <div className="owner-tables-stat-info">
              <span className="owner-tables-stat-value">{stats.inactive}</span>
              <span className="owner-tables-stat-label">Inactive / Archived</span>
            </div>
          </div>
        </section>

        {/* ── Collapsible Dining Areas Section ──────────────────────── */}
        {showAreasSection && (
          <section className="owner-dining-areas" aria-label="Dining Areas Management">
            <div className="owner-dining-areas__header">
              <div>
                <h3 className="owner-dining-areas__title">Dining Areas &amp; Spaces</h3>
                <p className="owner-dining-areas__subtitle">
                  Define floor plan sections (e.g., Indoor, Outdoor, VIP, Private Dining)
                </p>
              </div>
            </div>

            <div className="owner-area-chips">
              {areas.map((area) => (
                <div key={area.id} className="owner-area-chip">
                  <span>{area.name}</span>
                  {can('tables.edit') && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingArea(area);
                        setEditingAreaName(area.name);
                      }}
                      aria-label={`Rename ${area.name}`}
                    >
                      Rename
                    </button>
                  )}
                </div>
              ))}

              {can('tables.add') && !editingArea && (
                <form className="owner-inline-area-form" onSubmit={handleAddArea}>
                  <input
                    value={newAreaName}
                    onChange={(e) => setNewAreaName(e.target.value)}
                    placeholder="New area name..."
                    maxLength={60}
                    required
                  />
                  <Button size="sm" type="submit" loading={saving}>
                    + Add Area
                  </Button>
                </form>
              )}

              {editingArea && (
                <form className="owner-inline-area-form" onSubmit={handleUpdateArea}>
                  <input
                    value={editingAreaName}
                    onChange={(e) => setEditingAreaName(e.target.value)}
                    maxLength={60}
                    required
                  />
                  <Button size="sm" type="submit" loading={saving}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingArea(null);
                      setEditingAreaName('');
                    }}
                  >
                    Cancel
                  </Button>
                </form>
              )}
            </div>
          </section>
        )}

        {/* ── Search & Filter Toolbar ───────────────────────────────── */}
        <section className="owner-tables-toolbar" aria-label="Filter tables">
          <div className="owner-toolbar-field">
            <label htmlFor="table-search">Search</label>
            <input
              id="table-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search table name, #, notes..."
            />
          </div>

          <div className="owner-toolbar-field">
            <label htmlFor="filter-status">Status</label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="Active">Active Tables</option>
              <option value="Inactive">Inactive / Archived</option>
              <option value="Available">Available</option>
              <option value="Reserved">Reserved</option>
              <option value="Occupied">Occupied</option>
            </select>
          </div>

          <div className="owner-toolbar-field">
            <label htmlFor="filter-type">Table Type</label>
            <select
              id="filter-type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All Types</option>
              {TABLE_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="owner-toolbar-field">
            <label htmlFor="filter-area">Dining Area</label>
            <select
              id="filter-area"
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
            >
              <option value="all">All Areas</option>
              {areas.map((area) => (
                <option key={area.id} value={area.name}>{area.name}</option>
              ))}
            </select>
          </div>

          <div className="owner-toolbar-field">
            <label htmlFor="filter-cap">Min Capacity</label>
            <select
              id="filter-cap"
              value={capacityFilter}
              onChange={(e) => setCapacityFilter(e.target.value)}
            >
              <option value="all">Any Capacity</option>
              <option value="2">2+ Guests</option>
              <option value="4">4+ Guests</option>
              <option value="6">6+ Guests</option>
              <option value="8">8+ Guests</option>
            </select>
          </div>

          <div className="owner-toolbar-field">
            <label htmlFor="filter-date">Schedule Date</label>
            <input
              id="filter-date"
              type="date"
              value={scheduleDate}
              onChange={(e) => {
                setScheduleDate(e.target.value);
                setExpandedScheduleId(null);
              }}
            />
          </div>

          <div className="owner-toolbar-field">
            <label htmlFor="filter-time">Time Slot</label>
            <select
              id="filter-time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
            >
              <option value="all">All Day</option>
              {STANDARD_TIME_SLOTS.map((slot) => (
                <option key={slot} value={slot}>{slot}</option>
              ))}
            </select>
          </div>
        </section>

        {/* ── Table Cards Grid ──────────────────────────────────────── */}
        {loading ? (
          <LoadingSpinner size="lg" label="Loading tables..." />
        ) : visibleTables.length === 0 ? (
          <EmptyState
            title={tables.length === 0 ? 'No Dining Tables Registered' : 'No Tables Match Filter'}
            description={
              tables.length === 0
                ? 'Add your first restaurant table to start assigning tables and managing capacity.'
                : 'Try adjusting your search keywords, status, type, or area filters.'
            }
            action={
              tables.length === 0 && can('tables.add') ? (
                <Button variant="primary" onClick={handleOpenAddModal}>
                  + Add Your First Table
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setTypeFilter('all');
                  setAreaFilter('all');
                  setCapacityFilter('all');
                  setScheduleTime('all');
                }}>
                  Clear Filters
                </Button>
              )
            }
          />
        ) : (
          <section className="owner-tables-grid" aria-label="Restaurant tables catalog">
            {visibleTables.map((table) => {
              const isInactive = table.isActive === false || table.status === 'Inactive' || table.isArchived;
              const hasDescription = Boolean(table.description);
              const isExpanded = expandedScheduleId === table.id;

              // Operational status badge
              let badgeVariant = 'default';
              let displayStatus = table.status;

              if (isInactive) {
                badgeVariant = 'default';
                displayStatus = 'Inactive';
              } else if (table.status === 'Available') {
                badgeVariant = 'success';
                displayStatus = scheduleTime !== 'all' ? `Available @ ${scheduleTime}` : 'Available';
              } else if (table.status === 'Reserved') {
                badgeVariant = 'warning';
                displayStatus = scheduleTime !== 'all' ? `Reserved @ ${scheduleTime}` : 'Reserved';
              } else if (table.status === 'Occupied') {
                badgeVariant = 'primary';
                displayStatus = scheduleTime !== 'all' ? `Occupied @ ${scheduleTime}` : 'Occupied';
              }

              return (
                <article
                  key={table.id}
                  className={`owner-table-card ${isInactive ? 'owner-table-card--inactive' : ''}`}
                >
                  <div className="owner-table-card__top">
                    <div className="owner-table-card__identity">
                      <div className="owner-table-number-badge">
                        #{table.number || table.name.replace(/\D/g, '') || '–'}
                      </div>
                      <div className="owner-table-card__titles">
                        <h3 className="owner-table-card__name">{table.name}</h3>
                        <span className="owner-table-card__area-type">
                          {table.area || 'Dining Room'} · {table.type || 'Indoor'}
                        </span>
                      </div>
                    </div>

                    <Badge variant={badgeVariant}>{displayStatus}</Badge>
                  </div>

                  {/* Metadata Chips */}
                  <div className="owner-table-chips">
                    <span className="owner-table-chip owner-table-chip--capacity">
                      👥 Seats {table.capacity} guests
                    </span>
                    <span className="owner-table-chip owner-table-chip--type">
                      🪑 {table.type || 'Indoor'}
                    </span>
                    <span className="owner-table-chip">
                      📍 {table.area || 'Main Hall'}
                    </span>
                  </div>

                  {hasDescription && (
                    <p className="owner-table-card__desc">
                      "{table.description}"
                    </p>
                  )}

                  {/* Schedule preview for scheduleDate */}
                  <div className="owner-table-card__schedule-preview">
                    <span>
                      📅 {scheduleDate === localDateKey() ? "Today's Schedule" : scheduleDate}
                    </span>
                    <strong style={{ color: isInactive ? 'var(--text-secondary)' : '#059669' }}>
                      {isInactive ? 'Not accepting bookings' : 'Active for reservations'}
                    </strong>
                  </div>

                  {/* Card Action Buttons */}
                  <div className="owner-table-card__actions">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleSchedule(table)}
                    >
                      {isExpanded ? 'Hide Schedule' : 'View Schedule'}
                    </Button>

                    {can('tables.edit') && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleOpenEditModal(table)}
                      >
                        Edit
                      </Button>
                    )}

                    {can('tables.manageAvailability') && (
                      isInactive ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReactivateTable(table)}
                        >
                          Reactivate
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          style={{ color: '#dc2626' }}
                          onClick={() => handleOpenArchiveModal(table)}
                        >
                          Archive
                        </Button>
                      )
                    )}
                  </div>

                  {/* Expandable Schedule Accordion */}
                  {isExpanded && (
                    <div className="owner-table-schedule-panel">
                      <h4 className="owner-table-schedule-panel__heading">
                        <span>Reservations on {scheduleDate}</span>
                        <Badge variant="default" size="sm">
                          {scheduleReservations.length} booking{scheduleReservations.length === 1 ? '' : 's'}
                        </Badge>
                      </h4>

                      {scheduleReservations.length === 0 ? (
                        <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)' }}>
                          No reservations scheduled for this table on {scheduleDate}.
                        </p>
                      ) : (
                        scheduleReservations.map((res) => (
                          <div key={res.id} className="owner-table-schedule-item">
                            <div className="owner-table-schedule-item__main">
                              <span className="owner-table-schedule-item__guest">
                                {res.guestName || res.customerName || 'Guest'}
                              </span>
                              <span className="owner-table-schedule-item__meta">
                                {res.time} · {res.guests || res.partySize} guests · #{res.reference || res.id}
                              </span>
                            </div>
                            <Badge variant={res.status === 'Confirmed' ? 'success' : 'warning'} size="sm">
                              {res.status}
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}

        {/* ── Add / Edit Table Modal ─────────────────────────────────── */}
        {showTableModal && (
          <Modal
            isOpen={showTableModal}
            onClose={() => setShowTableModal(false)}
            title={editingTable ? `Edit Table: ${editingTable.name}` : 'Add New Dining Table'}
          >
            <form className="owner-table-form" onSubmit={handleSaveTable}>
              <div className="owner-form-row">
                <div className="owner-form-group">
                  <label htmlFor="table-name">
                    Table Name <span className="req">*</span>
                  </label>
                  <input
                    id="table-name"
                    value={tableForm.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    placeholder="e.g. Table 1, VIP Booth A"
                    className={formErrors.name ? 'has-error' : ''}
                    maxLength={60}
                    required
                  />
                  {formErrors.name && (
                    <span className="owner-field-error">⚠️ {formErrors.name}</span>
                  )}
                </div>

                <div className="owner-form-group">
                  <label htmlFor="table-number">
                    Table Number <span className="req">*</span>
                  </label>
                  <input
                    id="table-number"
                    value={tableForm.number}
                    onChange={(e) => handleFormChange('number', e.target.value)}
                    placeholder="e.g. 1, 2, 10A"
                    className={formErrors.number ? 'has-error' : ''}
                    maxLength={20}
                    required
                  />
                  {formErrors.number ? (
                    <span className="owner-field-error">⚠️ {formErrors.number}</span>
                  ) : (
                    <span className="owner-field-hint">Must be unique within your restaurant.</span>
                  )}
                </div>
              </div>

              <div className="owner-form-row--3">
                <div className="owner-form-group">
                  <label htmlFor="table-capacity">
                    Seating Capacity <span className="req">*</span>
                  </label>
                  <input
                    id="table-capacity"
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={tableForm.capacity}
                    onChange={(e) => handleFormChange('capacity', e.target.value)}
                    className={formErrors.capacity ? 'has-error' : ''}
                    required
                  />
                  {formErrors.capacity && (
                    <span className="owner-field-error">⚠️ {formErrors.capacity}</span>
                  )}
                </div>

                <div className="owner-form-group">
                  <label htmlFor="table-type">
                    Table Type <span className="req">*</span>
                  </label>
                  <select
                    id="table-type"
                    value={tableForm.type}
                    onChange={(e) => handleFormChange('type', e.target.value)}
                    required
                  >
                    {TABLE_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div className="owner-form-group">
                  <label htmlFor="table-area">
                    Dining Area <span className="req">*</span>
                  </label>
                  <select
                    id="table-area"
                    value={tableForm.area}
                    onChange={(e) => handleFormChange('area', e.target.value)}
                    required
                  >
                    {areas.map((area) => (
                      <option key={area.id} value={area.name}>{area.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="owner-form-group">
                <label htmlFor="table-status">
                  Table Status <span className="req">*</span>
                </label>
                <select
                  id="table-status"
                  value={tableForm.status}
                  onChange={(e) => handleFormChange('status', e.target.value)}
                  required
                >
                  <option value="Active">Active — Available for customer reservations</option>
                  <option value="Inactive">Inactive / Archived — Deactivated from booking</option>
                </select>
              </div>

              <div className="owner-form-group">
                <label htmlFor="table-description">
                  Description / Features (Optional)
                </label>
                <textarea
                  id="table-description"
                  rows={2}
                  value={tableForm.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  placeholder="e.g. Window seat with street view, wheelchair accessible, near bar..."
                  maxLength={250}
                />
              </div>

              <div className="owner-form-actions">
                <Button variant="ghost" type="button" onClick={() => setShowTableModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  loading={saving}
                  disabled={Boolean(formErrors.name || formErrors.number || formErrors.capacity)}
                >
                  {editingTable ? 'Save Table Changes' : 'Create Table'}
                </Button>
              </div>
            </form>
          </Modal>
        )}

        {/* ── Archive / Deactivate Confirmation Modal ────────────────── */}
        {archiveTarget && (
          <Modal
            isOpen={Boolean(archiveTarget)}
            onClose={() => {
              setArchiveTarget(null);
              setArchiveConflicts([]);
            }}
            title={`Archive Table: ${archiveTarget.name}`}
          >
            <div className="owner-archive-dialog">
              {archiveConflicts.length > 0 ? (
                <div className="owner-conflict-alert">
                  <div>
                    <strong>⚠️ Cannot Archive Table with Active Reservations</strong>
                    Table "{archiveTarget.name}" currently has upcoming reservations scheduled. Please reassign or cancel these reservations before archiving this table:
                    <ul className="owner-conflict-list">
                      {archiveConflicts.map((res) => (
                        <li key={res.id}>
                          #{res.reference || res.id} — {res.date} at {res.time} ({res.guestName}, {res.partySize || res.guests} guests)
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                  Are you sure you want to archive <strong>{archiveTarget.name} (#{archiveTarget.number})</strong>?
                  <br /><br />
                  Archiving deactivates this table instead of permanently deleting it. It will no longer be available for customer reservations, but past records will remain preserved. You can reactivate it at any time.
                </p>
              )}

              <div className="owner-form-actions">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setArchiveTarget(null);
                    setArchiveConflicts([]);
                  }}
                >
                  {archiveConflicts.length > 0 ? 'Close' : 'Cancel'}
                </Button>

                {archiveConflicts.length === 0 && (
                  <Button
                    variant="danger"
                    loading={saving}
                    onClick={handleConfirmArchive}
                  >
                    Archive &amp; Deactivate Table
                  </Button>
                )}
              </div>
            </div>
          </Modal>
        )}
      </div>
    </OwnerLayout>
  );
}

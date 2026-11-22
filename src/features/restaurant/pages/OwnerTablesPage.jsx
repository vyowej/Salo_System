import { useState, useEffect, useCallback, useMemo } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import { ownerService } from '../../../services/ownerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import { StateView } from '../../../components/feedback';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import './OwnerTablesPage.css';

const DEFAULT_AREA_SUGGESTIONS = ['Indoor', 'Outdoor', 'Terrace', 'Private Room'];

const STATUS_BADGE_MAP = {
  available: { variant: 'success', label: 'Available' },
  reserved: { variant: 'warning', label: 'Reserved' },
  occupied: { variant: 'primary', label: 'Occupied' },
  archived: { variant: 'default', label: 'Archived' },
};

function getManilaTodayKey() {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

function formatManilaTime(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    return date.toLocaleTimeString('en-PH', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

function extractFieldErrors(apiError) {
  const rawErrors = apiError?.errors || apiError?.data?.errors;
  if (!rawErrors || typeof rawErrors !== 'object') return {};

  const mapped = {};
  for (const [key, messages] of Object.entries(rawErrors)) {
    const firstMsg = Array.isArray(messages) ? messages[0] : String(messages || '');
    if (firstMsg) {
      mapped[key] = firstMsg;
    }
  }
  return mapped;
}

export default function OwnerTablesPage() {
  const access = useRestaurantAccess();
  const { selectedRestaurantId } = access;

  const canAddTable = access.canAccess(['tables.add']);
  const canEditTable = access.canAccess(['tables.edit']);
  const canManageAvailability = access.canAccess(['tables.manageAvailability']);

  const todayKey = useMemo(() => getManilaTodayKey(), []);

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedArea, setSelectedArea] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDate, setSelectedDate] = useState(todayKey);

  // Data state
  const [tables, setTables] = useState([]);
  const [summary, setSummary] = useState({
    totalTables: 0,
    activeTables: 0,
    archivedTables: 0,
    totalSeats: 0,
    availableNow: 0,
    reservedCount: 0,
    occupiedCount: 0,
  });
  const [diningAreas, setDiningAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bannerMessage, setBannerMessage] = useState(null);

  // Add / Edit modal state
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [formValues, setFormValues] = useState({
    table_name: '',
    seating_capacity: '4',
    min_party_size: '1',
    dining_area: '',
    description: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formConflictError, setFormConflictError] = useState('');
  const [saving, setSaving] = useState(false);

  // Archive dialog state
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveConflictError, setArchiveConflictError] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [reactivatingId, setReactivatingId] = useState(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadTables = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ownerService.getTables(selectedRestaurantId, selectedDate, {
        search: debouncedSearch,
        dining_area: selectedArea !== 'all' ? selectedArea : '',
        status: statusFilter,
        date: selectedDate,
      });

      setTables(Array.isArray(result?.items) ? result.items : []);
      if (result?.summary) {
        setSummary(result.summary);
      }
      setDiningAreas(Array.isArray(result?.diningAreas) ? result.diningAreas : []);
    } catch (err) {
      setError(err?.message || 'Unable to load restaurant tables.');
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId, selectedDate, debouncedSearch, selectedArea, statusFilter]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  const areaSuggestions = useMemo(() => {
    const merged = new Set([...diningAreas, ...DEFAULT_AREA_SUGGESTIONS]);
    return Array.from(merged).filter(Boolean);
  }, [diningAreas]);

  const hasActiveFilters =
    debouncedSearch !== '' || selectedArea !== 'all' || statusFilter !== 'all';

  function handleResetFilters() {
    setSearchInput('');
    setDebouncedSearch('');
    setSelectedArea('all');
    setStatusFilter('all');
    setSelectedDate(todayKey);
  }

  function openAddModal() {
    setEditingTable(null);
    setFormValues({
      table_name: '',
      seating_capacity: '4',
      min_party_size: '1',
      dining_area: selectedArea !== 'all' ? selectedArea : '',
      description: '',
    });
    setFieldErrors({});
    setFormConflictError('');
    setFormModalOpen(true);
  }

  function openEditModal(table) {
    setEditingTable(table);
    setFormValues({
      table_name: table.tableName || '',
      seating_capacity: String(table.capacity ?? 4),
      min_party_size: String(table.minPartySize ?? 1),
      dining_area: table.diningArea || '',
      description: table.description || '',
    });
    setFieldErrors({});
    setFormConflictError('');
    setFormModalOpen(true);
  }

  function closeFormModal() {
    if (saving) return;
    setFormModalOpen(false);
    setEditingTable(null);
    setFieldErrors({});
    setFormConflictError('');
  }

  function validateForm() {
    const nextErrors = {};
    const trimmedName = String(formValues.table_name || '').trim();
    const capacity = Number(formValues.seating_capacity);
    const minParty =
      formValues.min_party_size === '' || formValues.min_party_size === null
        ? 1
        : Number(formValues.min_party_size);
    const trimmedArea = String(formValues.dining_area || '').trim();
    const trimmedDesc = String(formValues.description || '').trim();

    if (!trimmedName) {
      nextErrors.table_name = 'Table name is required.';
    } else if (trimmedName.length > 50) {
      nextErrors.table_name = 'Table name must not exceed 50 characters.';
    }

    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
      nextErrors.seating_capacity = 'Seating capacity must be a whole number between 1 and 100.';
    }

    if (!Number.isInteger(minParty) || minParty < 1) {
      nextErrors.min_party_size = 'Minimum party size must be at least 1.';
    } else if (Number.isInteger(capacity) && minParty > capacity) {
      nextErrors.min_party_size = `Minimum party size cannot exceed seating capacity (${capacity}).`;
    }

    if (trimmedArea.length > 100) {
      nextErrors.dining_area = 'Dining area must not exceed 100 characters.';
    }

    if (trimmedDesc.length > 255) {
      nextErrors.description = 'Description must not exceed 255 characters.';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    setFormConflictError('');
    if (!validateForm()) return;

    setSaving(true);
    try {
      const payload = {
        table_name: String(formValues.table_name || '').trim(),
        seating_capacity: Number(formValues.seating_capacity),
        min_party_size:
          formValues.min_party_size === '' || formValues.min_party_size === null
            ? 1
            : Number(formValues.min_party_size),
        dining_area: String(formValues.dining_area || '').trim() || null,
        description: String(formValues.description || '').trim() || null,
      };

      if (editingTable) {
        await ownerService.updateTable(selectedRestaurantId, editingTable.id, payload);
        setBannerMessage({
          type: 'success',
          text: `Table "${payload.table_name}" updated.`,
        });
      } else {
        await ownerService.addTable(selectedRestaurantId, payload);
        setBannerMessage({
          type: 'success',
          text: `Table "${payload.table_name}" added to your floor plan.`,
        });
      }

      setFormModalOpen(false);
      setEditingTable(null);
      await loadTables();
    } catch (err) {
      const mapped = extractFieldErrors(err);
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped);
      } else if (err?.status === 409) {
        setFormConflictError(err.message || 'This change conflicts with upcoming reservations.');
      } else {
        setFormConflictError(err?.message || 'Unable to save table.');
      }
    } finally {
      setSaving(false);
    }
  }

  function openArchiveDialog(table) {
    setArchiveTarget(table);
    setArchiveConflictError('');
  }

  function closeArchiveDialog() {
    if (archiving) return;
    setArchiveTarget(null);
    setArchiveConflictError('');
  }

  async function handleConfirmArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    setArchiveConflictError('');
    try {
      await ownerService.archiveTable(selectedRestaurantId, archiveTarget.id);
      setBannerMessage({
        type: 'success',
        text: `Table "${archiveTarget.tableName}" archived.`,
      });
      setArchiveTarget(null);
      await loadTables();
    } catch (err) {
      setArchiveConflictError(
        err?.message || 'Unable to archive table because it has upcoming reservations.',
      );
    } finally {
      setArchiving(false);
    }
  }

  async function handleReactivateTable(table) {
    setReactivatingId(table.id);
    setBannerMessage(null);
    try {
      await ownerService.reactivateTable(selectedRestaurantId, table.id);
      setBannerMessage({
        type: 'success',
        text: `Table "${table.tableName}" reactivated and ready for reservations.`,
      });
      await loadTables();
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: err?.message || 'Unable to reactivate table.',
      });
    } finally {
      setReactivatingId(null);
    }
  }

  return (
    <OwnerLayout>
      <div className="owner-tables-page">
        {/* Header */}
        <header className="owner-tables__header">
          <div className="owner-tables__header-left">
            <span className="owner-tables__badge">Floor Plan &amp; Seating</span>
            <h1 className="owner-tables__title">Tables &amp; Dining Areas</h1>
            <p className="owner-tables__desc">
              Manage floor capacity, party-size rules, dining areas, and live table availability.
            </p>
          </div>
          <div className="owner-tables__header-actions">
            {canAddTable && (
              <Button variant="primary" onClick={openAddModal}>
                + Add Table
              </Button>
            )}
          </div>
        </header>

        {/* Feedback Banner */}
        {bannerMessage && (
          <div
            role="status"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 'var(--radius-md, 10px)',
              background:
                bannerMessage.type === 'error'
                  ? 'rgba(220, 38, 38, 0.08)'
                  : 'rgba(16, 185, 129, 0.1)',
              border:
                bannerMessage.type === 'error'
                  ? '1px solid rgba(220, 38, 38, 0.25)'
                  : '1px solid rgba(16, 185, 129, 0.25)',
              color: bannerMessage.type === 'error' ? '#b91c1c' : '#065f46',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <span>{bannerMessage.text}</span>
            <button
              type="button"
              onClick={() => setBannerMessage(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 5 Summary Stat Cards */}
        <section className="owner-tables-stats" aria-label="Table summary statistics">
          <div className="owner-tables-stat-card">
            <div className="owner-tables-stat-icon" aria-hidden="true">🪑</div>
            <div className="owner-tables-stat-info">
              <span className="owner-tables-stat-value">{summary.totalTables}</span>
              <span className="owner-tables-stat-label">
                Total Tables ({summary.activeTables} active)
              </span>
            </div>
          </div>

          <div className="owner-tables-stat-card">
            <div className="owner-tables-stat-icon" aria-hidden="true">👥</div>
            <div className="owner-tables-stat-info">
              <span className="owner-tables-stat-value">{summary.totalSeats}</span>
              <span className="owner-tables-stat-label">Total Active Seats</span>
            </div>
          </div>

          <div className="owner-tables-stat-card">
            <div className="owner-tables-stat-icon" aria-hidden="true">✅</div>
            <div className="owner-tables-stat-info">
              <span className="owner-tables-stat-value">{summary.availableNow}</span>
              <span className="owner-tables-stat-label">Available Now</span>
            </div>
          </div>

          <div className="owner-tables-stat-card">
            <div className="owner-tables-stat-icon" aria-hidden="true">📅</div>
            <div className="owner-tables-stat-info">
              <span className="owner-tables-stat-value">{summary.reservedCount}</span>
              <span className="owner-tables-stat-label">Reserved ({selectedDate})</span>
            </div>
          </div>

          <div className="owner-tables-stat-card">
            <div className="owner-tables-stat-icon" aria-hidden="true">🍽️</div>
            <div className="owner-tables-stat-info">
              <span className="owner-tables-stat-value">{summary.occupiedCount}</span>
              <span className="owner-tables-stat-label">Occupied Right Now</span>
            </div>
          </div>
        </section>

        {/* Dining Area Filter Chips */}
        {diningAreas.length > 0 && (
          <section className="owner-dining-areas" aria-label="Dining areas">
            <div className="owner-dining-areas__header">
              <div>
                <h2 className="owner-dining-areas__title">Dining Areas</h2>
                <p className="owner-dining-areas__subtitle">
                  Filter tables by floor zone or seating section
                </p>
              </div>
            </div>
            <div className="owner-area-chips">
              <span
                className="owner-area-chip"
                style={
                  selectedArea === 'all'
                    ? { borderColor: 'var(--accent, #ea580c)', background: 'rgba(234, 88, 12, 0.08)' }
                    : undefined
                }
              >
                All Areas
                <button type="button" onClick={() => setSelectedArea('all')}>
                  {selectedArea === 'all' ? 'Active' : 'Select'}
                </button>
              </span>
              {diningAreas.map((area) => {
                const isSelected = selectedArea.toLowerCase() === area.toLowerCase();
                return (
                  <span
                    key={area}
                    className="owner-area-chip"
                    style={
                      isSelected
                        ? { borderColor: 'var(--accent, #ea580c)', background: 'rgba(234, 88, 12, 0.08)' }
                        : undefined
                    }
                  >
                    {area}
                    <button
                      type="button"
                      onClick={() => setSelectedArea(isSelected ? 'all' : area)}
                    >
                      {isSelected ? 'Clear' : 'Filter'}
                    </button>
                  </span>
                );
              })}
            </div>
          </section>
        )}

        {/* Toolbar */}
        <section className="owner-tables-toolbar" aria-label="Table filters">
          <div className="owner-toolbar-field" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="owner-table-search">Search Tables</label>
            <input
              id="owner-table-search"
              type="search"
              placeholder="Search by table name, area, or description..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="owner-toolbar-field">
            <label htmlFor="owner-table-area-filter">Dining Area</label>
            <select
              id="owner-table-area-filter"
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
            >
              <option value="all">All Dining Areas</option>
              {diningAreas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>

          <div className="owner-toolbar-field">
            <label htmlFor="owner-table-status-filter">Table State</label>
            <select
              id="owner-table-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All (Active &amp; Archived)</option>
              <option value="active">Active Only</option>
              <option value="archived">Archived Only</option>
            </select>
          </div>

          <div className="owner-toolbar-field" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="owner-table-date-filter">Status Date (Asia/Manila)</label>
            <input
              id="owner-table-date-filter"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || todayKey)}
            />
          </div>

          <div className="owner-toolbar-field" style={{ justifyContent: 'flex-end' }}>
            <label>&nbsp;</label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              disabled={!hasActiveFilters && selectedDate === todayKey}
            >
              Reset Filters
            </Button>
          </div>
        </section>

        {/* Main Content States */}
        {loading ? (
          <StateView
            state="loading"
            title="Loading restaurant tables..."
            description="Fetching floor plan, seating capacities, and reservation schedule."
          />
        ) : error ? (
          <StateView
            state="error"
            title="Could not load restaurant tables"
            description={error}
            onRetry={loadTables}
          />
        ) : summary.totalTables === 0 ? (
          <StateView
            state="empty"
            title="No tables yet — add your first table"
            description="Configure your dining areas and table capacities so customers can book reservations and staff can assign seating."
            action={
              canAddTable ? (
                <Button variant="primary" onClick={openAddModal}>
                  + Add Your First Table
                </Button>
              ) : null
            }
          />
        ) : tables.length === 0 ? (
          <StateView
            state="empty"
            title="No tables match your current filters"
            description="Try clearing your search query or switching the dining area and status filters."
            action={
              <Button variant="outline" onClick={handleResetFilters}>
                Clear All Filters
              </Button>
            }
          />
        ) : (
          <div className="owner-tables-grid">
            {tables.map((table) => {
              const badgeInfo = STATUS_BADGE_MAP[table.status] || STATUS_BADGE_MAP.available;
              const nextRes = table.nextReservation;

              return (
                <article
                  key={table.id}
                  className={`owner-table-card${!table.isActive ? ' owner-table-card--inactive' : ''}`}
                >
                  <div className="owner-table-card__top">
                    <div className="owner-table-card__identity">
                      <span className="owner-table-number-badge">{table.tableName}</span>
                      <div className="owner-table-card__titles">
                        <h3 className="owner-table-card__name">{table.tableName}</h3>
                        <span className="owner-table-card__area-type">
                          {table.diningArea || 'General Dining Area'}
                        </span>
                      </div>
                    </div>

                    <Badge variant={badgeInfo.variant} size="sm" dot>
                      {badgeInfo.label}
                    </Badge>
                  </div>

                  <div className="owner-table-chips">
                    <span className="owner-table-chip owner-table-chip--capacity">
                      👥 Capacity: {table.capacity} {table.capacity === 1 ? 'seat' : 'seats'}
                    </span>
                    <span className="owner-table-chip owner-table-chip--type">
                      Min party: {table.minPartySize} {table.minPartySize === 1 ? 'guest' : 'guests'}
                    </span>
                    {table.diningArea && (
                      <span className="owner-table-chip">📍 {table.diningArea}</span>
                    )}
                  </div>

                  {table.description && (
                    <p className="owner-table-card__desc">{table.description}</p>
                  )}

                  <div className="owner-table-card__schedule-preview">
                    {nextRes ? (
                      <div>
                        <strong>Next on {selectedDate}:</strong>{' '}
                        {formatManilaTime(nextRes.reservationStart)} · {nextRes.numberOfGuests}{' '}
                        {nextRes.numberOfGuests === 1 ? 'guest' : 'guests'} (
                        {nextRes.reservationReference || `#${nextRes.reservationId}`})
                      </div>
                    ) : (
                      <span>No bookings on {selectedDate}</span>
                    )}
                    <span style={{ fontWeight: 700 }}>
                      {table.upcomingReservationsCount} upcoming
                    </span>
                  </div>

                  {(canEditTable || canManageAvailability) && (
                    <div className="owner-table-card__actions">
                      {canEditTable && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEditModal(table)}
                        >
                          Edit
                        </Button>
                      )}

                      {canManageAvailability && table.isActive && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openArchiveDialog(table)}
                        >
                          Archive
                        </Button>
                      )}

                      {canManageAvailability && !table.isActive && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={reactivatingId === table.id}
                          onClick={() => handleReactivateTable(table)}
                        >
                          {reactivatingId === table.id ? 'Reactivating...' : 'Reactivate'}
                        </Button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {/* Add / Edit Table Modal */}
        <Modal
          open={formModalOpen}
          onClose={closeFormModal}
          title={editingTable ? `Edit Table ${editingTable.tableName}` : 'Add Restaurant Table'}
          size="md"
        >
          <form className="owner-table-form" onSubmit={handleFormSubmit} noValidate>
            {formConflictError && (
              <div className="owner-conflict-alert" role="alert">
                <div>
                  <strong>Unable to Save Table Changes</strong>
                  <span>{formConflictError}</span>
                </div>
              </div>
            )}

            <div className="owner-form-row">
              <div className="owner-form-group">
                <label htmlFor="table_name_input">
                  Table Name / Code <span className="req">*</span>
                </label>
                <input
                  id="table_name_input"
                  type="text"
                  maxLength={50}
                  placeholder="e.g. T-01, Patio-3, VIP-1"
                  className={fieldErrors.table_name ? 'has-error' : ''}
                  value={formValues.table_name}
                  onChange={(e) => {
                    setFormValues((prev) => ({ ...prev, table_name: e.target.value }));
                    if (fieldErrors.table_name) {
                      setFieldErrors((prev) => ({ ...prev, table_name: '' }));
                    }
                  }}
                  disabled={saving}
                />
                {fieldErrors.table_name ? (
                  <span className="owner-field-error">{fieldErrors.table_name}</span>
                ) : (
                  <span className="owner-field-hint">Unique label up to 50 characters.</span>
                )}
              </div>

              <div className="owner-form-group">
                <label htmlFor="dining_area_input">Dining Area / Section</label>
                <input
                  id="dining_area_input"
                  type="text"
                  list="owner-dining-area-suggestions"
                  maxLength={100}
                  placeholder="e.g. Indoor, Outdoor, Terrace"
                  className={fieldErrors.dining_area ? 'has-error' : ''}
                  value={formValues.dining_area}
                  onChange={(e) => {
                    setFormValues((prev) => ({ ...prev, dining_area: e.target.value }));
                    if (fieldErrors.dining_area) {
                      setFieldErrors((prev) => ({ ...prev, dining_area: '' }));
                    }
                  }}
                  disabled={saving}
                />
                <datalist id="owner-dining-area-suggestions">
                  {areaSuggestions.map((area) => (
                    <option key={area} value={area} />
                  ))}
                </datalist>
                {fieldErrors.dining_area ? (
                  <span className="owner-field-error">{fieldErrors.dining_area}</span>
                ) : (
                  <span className="owner-field-hint">Optional floor zone (max 100 chars).</span>
                )}
              </div>
            </div>

            <div className="owner-form-row">
              <div className="owner-form-group">
                <label htmlFor="seating_capacity_input">
                  Seating Capacity <span className="req">*</span>
                </label>
                <input
                  id="seating_capacity_input"
                  type="number"
                  min={1}
                  max={100}
                  className={fieldErrors.seating_capacity ? 'has-error' : ''}
                  value={formValues.seating_capacity}
                  onChange={(e) => {
                    setFormValues((prev) => ({ ...prev, seating_capacity: e.target.value }));
                    if (fieldErrors.seating_capacity) {
                      setFieldErrors((prev) => ({ ...prev, seating_capacity: '' }));
                    }
                  }}
                  disabled={saving}
                />
                {fieldErrors.seating_capacity ? (
                  <span className="owner-field-error">{fieldErrors.seating_capacity}</span>
                ) : (
                  <span className="owner-field-hint">Maximum guests this table can seat (1–100).</span>
                )}
              </div>

              <div className="owner-form-group">
                <label htmlFor="min_party_size_input">Minimum Party Size</label>
                <input
                  id="min_party_size_input"
                  type="number"
                  min={1}
                  max={100}
                  className={fieldErrors.min_party_size ? 'has-error' : ''}
                  value={formValues.min_party_size}
                  onChange={(e) => {
                    setFormValues((prev) => ({ ...prev, min_party_size: e.target.value }));
                    if (fieldErrors.min_party_size) {
                      setFieldErrors((prev) => ({ ...prev, min_party_size: '' }));
                    }
                  }}
                  disabled={saving}
                />
                {fieldErrors.min_party_size ? (
                  <span className="owner-field-error">{fieldErrors.min_party_size}</span>
                ) : (
                  <span className="owner-field-hint">
                    Smallest party allowed to book this table (1 to capacity).
                  </span>
                )}
              </div>
            </div>

            <div className="owner-form-group">
              <label htmlFor="table_description_input">Description / Notes</label>
              <textarea
                id="table_description_input"
                rows={3}
                maxLength={255}
                placeholder="Optional seating details (e.g. Near window, wheelchair accessible, quiet corner)..."
                value={formValues.description}
                onChange={(e) => {
                  setFormValues((prev) => ({ ...prev, description: e.target.value }));
                  if (fieldErrors.description) {
                    setFieldErrors((prev) => ({ ...prev, description: '' }));
                  }
                }}
                disabled={saving}
              />
              {fieldErrors.description ? (
                <span className="owner-field-error">{fieldErrors.description}</span>
              ) : (
                <span className="owner-field-hint">
                  {String(formValues.description || '').length}/255 characters
                </span>
              )}
            </div>

            <div className="owner-form-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={closeFormModal}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving
                  ? 'Saving...'
                  : editingTable
                    ? 'Save Changes'
                    : 'Create Table'}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Archive Confirmation Modal */}
        <Modal
          open={Boolean(archiveTarget)}
          onClose={closeArchiveDialog}
          title={archiveTarget ? `Archive Table "${archiveTarget.tableName}"?` : 'Archive Table'}
          size="sm"
        >
          {archiveTarget && (
            <div className="owner-archive-dialog">
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Archived tables are removed from active availability and cannot accept new customer
                reservations. Historical reservations remain intact, and you can reactivate the table
                at any time.
              </p>

              {archiveConflictError && (
                <div className="owner-conflict-alert" role="alert">
                  <div>
                    <strong>Cannot Archive Table</strong>
                    <span>{archiveConflictError}</span>
                  </div>
                </div>
              )}

              <div className="owner-form-actions">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={closeArchiveDialog}
                  disabled={archiving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleConfirmArchive}
                  disabled={archiving}
                >
                  {archiving ? 'Archiving...' : 'Confirm Archive'}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </OwnerLayout>
  );
}

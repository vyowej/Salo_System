import { useCallback, useEffect, useState } from 'react';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import { ErrorState, LoadingSpinner } from '../../../components/feedback';
import ownerService from '../../../services/ownerService';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import {
  OPERATING_DAYS,
  getLocalDateKey,
  isRestaurantOpen,
  normalizeOperatingHours,
  validateOperatingHours,
} from '../profile/operatingHoursUtils';
import './OperatingHoursEditor.css';

const CLOSURE_TYPES = ['Holiday', 'Renovation', 'Private Event', 'Emergency', 'Maintenance'];

function createClosureDraft() {
  return { type: 'Holiday', startDate: '', endDate: '', reason: '' };
}

function createId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `closure-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const DAY_KEY_TO_DOW = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const DOW_TO_DAY_KEY = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

function fromBackendHours(rows = [], profile = null, closures = []) {
  const weeklySchedule = {};
  OPERATING_DAYS.forEach(({ key }) => {
    weeklySchedule[key] = { closed: true, periods: [] };
  });

  rows.forEach((row) => {
    const key = DOW_TO_DAY_KEY[Number(row.day_of_week)];
    if (!key) return;
    if (row.is_closed) {
      weeklySchedule[key] = { closed: true, periods: [] };
      return;
    }
    weeklySchedule[key].closed = false;
    weeklySchedule[key].periods.push({
      id: row.id ? String(row.id) : createId(),
      open: String(row.opening_time || '09:00').slice(0, 5),
      close: String(row.closing_time || '21:00').slice(0, 5),
    });
  });

  const temporaryClosures = (closures || []).map((c) => ({
    id: String(c.id),
    backendId: Number(c.id),
    type: 'Temporary closure',
    startDate: c.closure_date,
    endDate: c.closure_date,
    reason: c.reason || 'Temporary closure',
  }));

  return normalizeOperatingHours({
    weeklySchedule,
    acceptingOrders: profile ? Boolean(profile.accepting_orders) : true,
    acceptingReservations: profile ? Boolean(profile.accepting_reservations) : true,
    temporaryClosures,
  });
}

function expandClosureDates(startDate, endDate) {
  const dates = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 31) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return dates;
}

function toBackendHoursPayload(hours) {
  const rows = [];
  OPERATING_DAYS.forEach(({ key }) => {
    const dow = DAY_KEY_TO_DOW[key];
    const day = hours.weeklySchedule[key];
    if (!day || day.closed || !day.periods.length) {
      rows.push({ day_of_week: dow, is_closed: true });
      return;
    }
    day.periods.forEach((period) => {
      const open = String(period.open || '09:00').slice(0, 5);
      const close = String(period.close || '21:00').slice(0, 5);
      rows.push({
        day_of_week: dow,
        opening_time: open,
        closing_time: close,
        closes_next_day: close <= open,
        is_closed: false,
      });
    });
  });
  return rows;
}

export default function OperatingHoursEditor({ restaurantId }) {
  const access = useRestaurantAccess();
  const canManageHours = access.canAccess(['business.hours.manage']);
  const [hours, setHours] = useState(null);
  const [initial, setInitial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [closureDraft, setClosureDraft] = useState(null);
  const [editingClosureId, setEditingClosureId] = useState(null);

  const loadHours = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rows, profile, closures] = await Promise.all([
        ownerService.getOperatingHours(restaurantId),
        ownerService.getProfile(restaurantId),
        ownerService.getClosures(restaurantId).catch(() => []),
      ]);
      const current = fromBackendHours(rows, profile, closures);
      setHours(current);
      setInitial(current);
      setSaved(false);
      setClosureDraft(null);
      setEditingClosureId(null);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load restaurant operating hours.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadHours();
  }, [loadHours]);

  function updateHours(update) {
    setHours((current) => normalizeOperatingHours(typeof update === 'function' ? update(current) : update));
    setSaved(false);
    setError('');
  }

  function updateDay(dayKey, update) {
    updateHours((current) => ({
      ...current,
      weeklySchedule: {
        ...current.weeklySchedule,
        [dayKey]: { ...current.weeklySchedule[dayKey], ...update },
      },
    }));
  }

  function updatePeriod(dayKey, periodId, field, value) {
    updateDay(dayKey, {
      periods: hours.weeklySchedule[dayKey].periods.map((period) => (
        period.id === periodId ? { ...period, [field]: value } : period
      )),
    });
  }

  function addPeriod(dayKey) {
    updateDay(dayKey, {
      closed: false,
      periods: [
        ...hours.weeklySchedule[dayKey].periods,
        { id: createId(), open: '14:00', close: '17:00' },
      ],
    });
  }

  function removePeriod(dayKey, periodId) {
    updateDay(dayKey, {
      periods: hours.weeklySchedule[dayKey].periods.filter((period) => period.id !== periodId),
    });
  }

  function startEditingClosure(closure) {
    setClosureDraft({ ...closure });
    setEditingClosureId(closure.id);
  }

  async function saveClosureDraft(event) {
    event.preventDefault();
    const candidate = { ...hours, temporaryClosures: [...hours.temporaryClosures, { ...closureDraft, id: editingClosureId || createId() }] };
    const validation = validateOperatingHours(candidate);
    if (validation) {
      setError(validation);
      return;
    }

    const dates = expandClosureDates(closureDraft.startDate, closureDraft.endDate);
    if (dates.length === 0) {
      setError('Select a valid start and end date for the closure.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (editingClosureId) {
        const prevClosure = hours.temporaryClosures.find((c) => c.id === editingClosureId);
        if (prevClosure?.backendId) {
          await ownerService.deleteClosure(restaurantId, prevClosure.backendId);
        }
      }

      const reasonText = closureDraft.reason?.trim()
        ? `${closureDraft.type}: ${closureDraft.reason.trim()}`.slice(0, 255)
        : closureDraft.type;

      for (const d of dates) {
        await ownerService.createClosure(restaurantId, {
          closure_date: d,
          reason: reasonText,
        });
      }

      const freshClosures = await ownerService.getClosures(restaurantId);
      const nextList = freshClosures.map((c) => ({
        id: String(c.id),
        backendId: Number(c.id),
        type: 'Temporary closure',
        startDate: c.closure_date,
        endDate: c.closure_date,
        reason: c.reason || 'Temporary closure',
      }));
      updateHours({ ...hours, temporaryClosures: nextList });
      setClosureDraft(null);
      setEditingClosureId(null);
    } catch (closureErr) {
      setError(closureErr?.message || 'Unable to save temporary closure.');
    } finally {
      setSaving(false);
    }
  }

  async function removeClosure(closureId) {
    const target = hours.temporaryClosures.find((c) => c.id === closureId);
    setSaving(true);
    setError('');
    try {
      if (target?.backendId) {
        await ownerService.deleteClosure(restaurantId, target.backendId);
      }
      updateHours({
        ...hours,
        temporaryClosures: hours.temporaryClosures.filter((closure) => closure.id !== closureId),
      });
      if (editingClosureId === closureId) {
        setClosureDraft(null);
        setEditingClosureId(null);
      }
    } catch (closureErr) {
      setError(closureErr?.message || 'Unable to remove temporary closure.');
    } finally {
      setSaving(false);
    }
  }

  async function saveHours(event) {
    event.preventDefault();
    if (saving) return;
    const validation = validateOperatingHours(hours);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = toBackendHoursPayload(hours);
      const [savedRows, savedProfile] = await Promise.all([
        ownerService.updateOperatingHours(restaurantId, payload),
        ownerService.updateAcceptingStatus(restaurantId, {
          accepting_orders: Boolean(hours.acceptingOrders),
          accepting_reservations: Boolean(hours.acceptingReservations),
        }),
      ]);
      const updated = {
        ...fromBackendHours(savedRows, savedProfile),
        temporaryClosures: hours.temporaryClosures,
      };
      setHours(updated);
      setInitial(updated);
      setSaved(true);
    } catch (saveError) {
      const firstErr = saveError?.errors ? Object.values(saveError.errors).flat()[0] : null;
      setError(firstErr || saveError.message || 'Unable to save restaurant operating hours.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <section className="owner-profile-card hours-editor-card" aria-label="Operating hours"><LoadingSpinner label="Loading operating hours..." /></section>;
  }
  if (!hours) {
    return <section className="owner-profile-card hours-editor-card" aria-label="Operating hours"><ErrorState description={error || 'Operating hours are unavailable.'} onRetry={loadHours} /></section>;
  }

  const openNow = isRestaurantOpen(hours, hours.temporaryClosures);
  const isDirty = JSON.stringify(hours) !== JSON.stringify(initial);
  const todayKey = OPERATING_DAYS[(new Date().getDay() + 6) % 7].key;

  return (
    <section className="owner-profile-card hours-editor-card" aria-labelledby="operating-hours-heading">
      <div className="owner-profile-section-heading hours-editor-heading">
        <div>
          <h2 id="operating-hours-heading">Operating hours</h2>
          <p>Set weekly service periods, temporary closures, and whether customers can place requests.</p>
        </div>
        <Badge variant={openNow ? 'success' : 'default'} dot>{openNow ? 'Open now' : 'Closed now'}</Badge>
      </div>

      {error && <p className="owner-profile-error" role="alert">{error}</p>}
      {saved && <p className="owner-profile-success" role="status">Operating hours and availability saved.</p>}

      <form onSubmit={saveHours}>
        <div className="hours-weekly-list">
          {OPERATING_DAYS.map(({ key, label }) => {
            const day = hours.weeklySchedule[key];
            return (
              <fieldset key={key} className={`hours-day-row${todayKey === key ? ' is-today' : ''}`} disabled={!canManageHours || saving}>
                <legend className="hours-day-name">{label}{todayKey === key && <span>Today</span>}</legend>
                <label className="hours-closed-toggle">
                  <input
                    type="checkbox"
                    checked={day.closed}
                    onChange={(event) => updateDay(key, { closed: event.target.checked })}
                  />
                  <span>Closed</span>
                </label>
                {!day.closed && (
                  <div className="hours-periods">
                    {day.periods.map((period, index) => (
                      <div className="hours-period-row" key={period.id}>
                        <label>
                          <span>{index === 0 ? 'Opens' : `Period ${index + 1} opens`}</span>
                          <input
                            type="time"
                            value={period.open}
                            aria-label={`${label} period ${index + 1} opening time`}
                            onChange={(event) => updatePeriod(key, period.id, 'open', event.target.value)}
                          />
                        </label>
                        <span className="hours-period-separator" aria-hidden="true">to</span>
                        <label>
                          <span>Closes</span>
                          <input
                            type="time"
                            value={period.close}
                            aria-label={`${label} period ${index + 1} closing time`}
                            onChange={(event) => updatePeriod(key, period.id, 'close', event.target.value)}
                          />
                        </label>
                        {day.periods.length > 1 && (
                          <button
                            type="button"
                            className="hours-remove-period"
                            aria-label={`Remove ${label} period ${index + 1}`}
                            onClick={() => removePeriod(key, period.id)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button" className="hours-add-period" onClick={() => addPeriod(key)}>＋ Add period</button>
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>

        <div className="hours-acceptance-controls">
          <label>
            <input
              type="checkbox"
              checked={hours.acceptingOrders}
              disabled={!canManageHours || saving}
              onChange={(event) => updateHours({ ...hours, acceptingOrders: event.target.checked })}
            />
            <span><strong>Accepting Orders</strong><small>{hours.acceptingOrders ? 'Customers can start orders while open.' : 'New customer orders are blocked.'}</small></span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={hours.acceptingReservations}
              disabled={!canManageHours || saving}
              onChange={(event) => updateHours({ ...hours, acceptingReservations: event.target.checked })}
            />
            <span><strong>Accepting Reservations</strong><small>{hours.acceptingReservations ? 'Customers can request reservations during open periods.' : 'New reservation requests are blocked.'}</small></span>
          </label>
        </div>

        <div className="hours-closures-section">
          <div className="hours-closures-heading">
            <div><h3>Temporary closures</h3><p>Closures apply to the full date range, including the end date.</p></div>
            {canManageHours && <Button type="button" variant="outline" size="sm" onClick={() => { setClosureDraft(createClosureDraft()); setEditingClosureId(null); }}>Add closure</Button>}
          </div>
          {hours.temporaryClosures.length === 0
            ? <p className="hours-empty-state">No temporary closures have been added.</p>
            : <ul className="hours-closure-list">
              {hours.temporaryClosures.map((closure) => {
                const expired = closure.endDate < getLocalDateKey();
                return (
                  <li key={closure.id} className={expired ? 'is-expired' : ''}>
                    <div><strong>{closure.type}</strong><span>{closure.startDate} – {closure.endDate}</span><p>{closure.reason}</p></div>
                    <div className="hours-closure-actions">
                      <Badge variant={expired ? 'default' : 'warning'}>{expired ? 'Expired' : 'Scheduled'}</Badge>
                      {canManageHours && <button type="button" onClick={() => startEditingClosure(closure)}>Edit</button>}
                      {canManageHours && <button type="button" onClick={() => removeClosure(closure.id)}>Remove</button>}
                    </div>
                  </li>
                );
              })}
            </ul>}

          {closureDraft && (
            <fieldset className="hours-closure-editor" disabled={saving}>
              <legend>{editingClosureId ? 'Edit temporary closure' : 'New temporary closure'}</legend>
              <label>Closure type
                <select value={closureDraft.type} onChange={(event) => setClosureDraft({ ...closureDraft, type: event.target.value })}>
                  {CLOSURE_TYPES.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <label>Start date
                <input type="date" value={closureDraft.startDate} onChange={(event) => setClosureDraft({ ...closureDraft, startDate: event.target.value })} />
              </label>
              <label>End date
                <input type="date" value={closureDraft.endDate} min={closureDraft.startDate || undefined} onChange={(event) => setClosureDraft({ ...closureDraft, endDate: event.target.value })} />
              </label>
              <label className="hours-closure-reason">Reason
                <input type="text" maxLength={240} value={closureDraft.reason} onChange={(event) => setClosureDraft({ ...closureDraft, reason: event.target.value })} placeholder="e.g. Private event" />
              </label>
              <div className="hours-editor-actions">
                <Button type="button" variant="ghost" onClick={() => { setClosureDraft(null); setEditingClosureId(null); }}>Cancel</Button>
                <Button type="button" onClick={saveClosureDraft}>{editingClosureId ? 'Update closure' : 'Add closure'}</Button>
              </div>
            </fieldset>
          )}
        </div>

        {!canManageHours && <p className="owner-profile-readonly" role="status">You can view hours, but need the business.hours.manage permission to change them.</p>}
        {canManageHours && <div className="hours-save-actions"><Button type="submit" loading={saving} disabled={!isDirty || saving}>Save hours and availability</Button></div>}
      </form>
    </section>
  );
}

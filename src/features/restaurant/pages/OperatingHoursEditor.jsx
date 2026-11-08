import { useCallback, useEffect, useState } from 'react';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import { ErrorState, LoadingSpinner } from '../../../components/feedback';
import restaurantService from '../../../services/restaurantService';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import {
  OPERATING_DAYS,
  getLocalDateKey,
  isRestaurantOpen,
  normalizeOperatingHours,
  validateOperatingHours,
} from '../../../services/demo/operatingHours';
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

  const loadHours = useCallback(() => {
    setLoading(true);
    setError('');
    try {
      const current = normalizeOperatingHours(restaurantService.getOperatingHours(restaurantId));
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

  function saveClosureDraft(event) {
    event.preventDefault();
    const nextClosures = editingClosureId
      ? hours.temporaryClosures.map((closure) => (
        closure.id === editingClosureId ? { ...closureDraft, id: editingClosureId } : closure
      ))
      : [...hours.temporaryClosures, { ...closureDraft, id: createId() }];
    const candidate = { ...hours, temporaryClosures: nextClosures };
    const validation = validateOperatingHours(candidate);
    if (validation) {
      setError(validation);
      return;
    }
    updateHours(candidate);
    setClosureDraft(null);
    setEditingClosureId(null);
  }

  function removeClosure(closureId) {
    updateHours({
      ...hours,
      temporaryClosures: hours.temporaryClosures.filter((closure) => closure.id !== closureId),
    });
    if (editingClosureId === closureId) {
      setClosureDraft(null);
      setEditingClosureId(null);
    }
  }

  async function saveHours(event) {
    event.preventDefault();
    const validation = validateOperatingHours(hours);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = normalizeOperatingHours(restaurantService.updateOperatingHours(hours, restaurantId));
      setHours(updated);
      setInitial(updated);
      setSaved(true);
    } catch (saveError) {
      setError(saveError.message || 'Unable to save restaurant operating hours.');
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

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import { StateView as GlobalStateView } from '../../../components/feedback';
import riderService from '../../../services/riderService';
import PageHeader from '../components/PageHeader';

const DAY_OPTIONS = [
  { value: 'mon', label: 'Monday', short: 'Mon' },
  { value: 'tue', label: 'Tuesday', short: 'Tue' },
  { value: 'wed', label: 'Wednesday', short: 'Wed' },
  { value: 'thu', label: 'Thursday', short: 'Thu' },
  { value: 'fri', label: 'Friday', short: 'Fri' },
  { value: 'sat', label: 'Saturday', short: 'Sat' },
  { value: 'sun', label: 'Sunday', short: 'Sun' },
];

const SHIFT_OPTIONS = [
  { value: 'breakfast', label: 'Morning / Breakfast', hours: '6:00 AM – 10:00 AM' },
  { value: 'lunch', label: 'Midday / Lunch', hours: '10:00 AM – 2:00 PM' },
  { value: 'afternoon', label: 'Afternoon', hours: '2:00 PM – 5:00 PM' },
  { value: 'dinner', label: 'Evening / Dinner', hours: '5:00 PM – 10:00 PM' },
  { value: 'late_night', label: 'Late Night', hours: '10:00 PM – 6:00 AM' },
  { value: 'flexible', label: 'Flexible (Anytime)', hours: 'All available hours' },
];

function parseHubTags(hubsString) {
  if (!hubsString || typeof hubsString !== 'string') return [];
  return hubsString
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function RiderSchedulePage() {
  const [profile, setProfile] = useState(null);
  const [availableDays, setAvailableDays] = useState([]);
  const [preferredShifts, setPreferredShifts] = useState([]);
  const [hubTags, setHubTags] = useState([]);
  const [hubInput, setHubInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saveSuccess, setSaveSuccess] = useState('');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await riderService.getProfile();
      setProfile(data);
      setAvailableDays(Array.isArray(data?.available_days) ? data.available_days : []);
      setPreferredShifts(Array.isArray(data?.preferred_shifts) ? data.preferred_shifts : []);
      setHubTags(parseHubTags(data?.preferred_hubs));
    } catch (err) {
      setLoadError(err?.message || 'Unable to load rider schedule.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const toggleDay = (day) => {
    setSaveSuccess('');
    setSaveError('');
    setAvailableDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const toggleShift = (shift) => {
    setSaveSuccess('');
    setSaveError('');
    setPreferredShifts((prev) =>
      prev.includes(shift) ? prev.filter((s) => s !== shift) : [...prev, shift],
    );
  };

  const handleAddHub = () => {
    const trimmed = hubInput.trim();
    if (!trimmed) return;
    setSaveSuccess('');
    setSaveError('');
    if (!hubTags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setHubTags((prev) => [...prev, trimmed]);
    }
    setHubInput('');
  };

  const handleRemoveHub = (tag) => {
    setSaveSuccess('');
    setSaveError('');
    setHubTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setSaveError('');
    setFieldErrors({});
    setSaveSuccess('');

    const pendingHub = hubInput.trim();
    const nextHubs = pendingHub && !hubTags.some((t) => t.toLowerCase() === pendingHub.toLowerCase())
      ? [...hubTags, pendingHub]
      : hubTags;
    if (pendingHub) {
      setHubTags(nextHubs);
      setHubInput('');
    }

    const hubsPayload = nextHubs.length > 0 ? nextHubs.join(', ') : null;

    try {
      const updated = await riderService.updateProfile({
        available_days: availableDays,
        preferred_shifts: preferredShifts,
        preferred_hubs: hubsPayload,
      });
      setProfile(updated);
      setAvailableDays(Array.isArray(updated?.available_days) ? updated.available_days : availableDays);
      setPreferredShifts(Array.isArray(updated?.preferred_shifts) ? updated.preferred_shifts : preferredShifts);
      setHubTags(parseHubTags(updated?.preferred_hubs ?? hubsPayload));
      setSaveSuccess('Schedule preferences saved.');
      window.dispatchEvent(new Event('salo:riderUpdated'));
    } catch (err) {
      const nextFieldErrors = {};
      if (err?.errors && typeof err.errors === 'object') {
        Object.entries(err.errors).forEach(([key, msgs]) => {
          const firstMsg = Array.isArray(msgs) ? msgs[0] : String(msgs);
          if (firstMsg) nextFieldErrors[key] = firstMsg;
        });
      }
      setFieldErrors(nextFieldErrors);
      setSaveError(err?.message || 'Unable to save schedule preferences.');
    } finally {
      setSaving(false);
    }
  };

  const isOnline = Boolean(profile?.availability?.is_online || profile?.availability?.status === 'online');
  const availabilityLabel = isOnline
    ? 'Online & Available'
    : profile?.availability?.status === 'temporarily_unavailable'
      ? 'Temporarily Unavailable'
      : 'Offline';

  return (
    <div className="rider-page-shell">
      <PageHeader
        title="Shift schedule"
        subtitle="Set your available days, preferred delivery shifts, and hubs."
        eyebrow="Schedule"
      />

      {loading ? (
        <GlobalStateView state="loading" title="Loading shift schedule..." />
      ) : loadError ? (
        <GlobalStateView
          state="error"
          title="Could not load shift schedule"
          description={loadError}
          onRetry={loadProfile}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Card>
            <CardBody style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <strong>Current Duty Status</strong>
                  <Badge variant={isOnline ? 'success' : 'neutral'} size="sm">
                    {availabilityLabel}
                  </Badge>
                </div>
                <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                  {profile?.base_city ? `Base city: ${profile.base_city} · ` : ''}
                  Toggle your live availability before accepting deliveries.
                </p>
              </div>
              <Link to="/rider/go-online">
                <Button variant="outline" size="sm">
                  Manage Online Status
                </Button>
              </Link>
            </CardBody>
          </Card>

          <form onSubmit={handleSave} noValidate>
            <Card>
              <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                {saveError && (
                  <div
                    role="alert"
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--status-error-bg)',
                      color: 'var(--status-error-text)',
                      fontSize: 'var(--font-size-sm)',
                    }}
                  >
                    {saveError}
                  </div>
                )}

                {saveSuccess && (
                  <div
                    role="status"
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--status-success-bg, #ecfdf5)',
                      color: 'var(--status-success-text, #065f46)',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 600,
                    }}
                  >
                    {saveSuccess}
                  </div>
                )}

                <section>
                  <h3 style={{ margin: '0 0 6px', fontSize: 'var(--font-size-base)' }}>Available Days</h3>
                  <p style={{ margin: '0 0 12px', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                    Select the days of the week you are available to deliver.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {DAY_OPTIONS.map((day) => {
                      const selected = availableDays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleDay(day.value)}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '999px',
                            border: selected
                              ? '1px solid var(--accent, #F36B2B)'
                              : '1px solid var(--border-primary, #d4d4d4)',
                            background: selected ? 'var(--accent, #F36B2B)' : 'var(--surface-primary, #fff)',
                            color: selected ? '#fff' : 'var(--text-primary, #171717)',
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                  {fieldErrors.available_days && (
                    <p role="alert" style={{ margin: '6px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--status-error-text)' }}>
                      {fieldErrors.available_days}
                    </p>
                  )}
                </section>

                <section>
                  <h3 style={{ margin: '0 0 6px', fontSize: 'var(--font-size-base)' }}>Preferred Shifts</h3>
                  <p style={{ margin: '0 0 12px', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                    Choose the delivery windows you prefer to work.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
                    {SHIFT_OPTIONS.map((shift) => {
                      const selected = preferredShifts.includes(shift.value);
                      return (
                        <button
                          key={shift.value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleShift(shift.value)}
                          style={{
                            textAlign: 'left',
                            padding: '10px 12px',
                            borderRadius: 'var(--radius-md)',
                            border: selected
                              ? '1.5px solid var(--accent, #F36B2B)'
                              : '1px solid var(--border-primary, #d4d4d4)',
                            background: selected ? 'var(--accent-subtle, #fff7ed)' : 'var(--surface-primary, #fff)',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                            {shift.label}
                          </div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                            {shift.hours}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {fieldErrors.preferred_shifts && (
                    <p role="alert" style={{ margin: '6px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--status-error-text)' }}>
                      {fieldErrors.preferred_shifts}
                    </p>
                  )}
                </section>

                <section>
                  <h3 style={{ margin: '0 0 6px', fontSize: 'var(--font-size-base)' }}>Preferred Delivery Hubs (Optional)</h3>
                  <p style={{ margin: '0 0 12px', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                    Add areas or hubs where you prefer to pick up orders (max 255 characters total).
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <input
                      type="text"
                      value={hubInput}
                      onChange={(e) => setHubInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddHub();
                        }
                      }}
                      placeholder="e.g., Diliman, Katipunan, Cubao"
                      maxLength={100}
                      aria-label="Add preferred hub"
                      style={{
                        flex: '1 1 220px',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-primary, #d4d4d4)',
                        fontSize: 'var(--font-size-sm)',
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={handleAddHub}>
                      Add Hub
                    </Button>
                  </div>
                  {hubTags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {hubTags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: '999px',
                            background: 'var(--surface-secondary, #f5f5f5)',
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: 600,
                          }}
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveHub(tag)}
                            aria-label={`Remove ${tag}`}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              padding: 0,
                              lineHeight: 1,
                              color: 'var(--text-muted)',
                              fontWeight: 700,
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {fieldErrors.preferred_hubs && (
                    <p role="alert" style={{ margin: '6px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--status-error-text)' }}>
                      {fieldErrors.preferred_hubs}
                    </p>
                  )}
                </section>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <Button type="button" variant="outline" size="sm" onClick={loadProfile} disabled={saving}>
                    Reset
                  </Button>
                  <Button type="submit" variant="primary" size="sm" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Schedule'}
                  </Button>
                </div>
              </CardBody>
            </Card>
          </form>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import { StateView as GlobalStateView } from '../../../components/feedback';
import { RatingSummaryCard, ReviewList } from '../../../components/reviews';
import { MOCK_RIDER_REVIEWS } from '../../../mocks/reviewsAndFeaturedMock';
import { computeMockRatingSummary } from '../../../utils/reviewDisplayUtils';
import PageHeader from '../components/PageHeader';
import riderService from '../../../services/riderService';
import { useAuth } from '../../../hooks/useAuth';
import {
  AVAILABLE_DAY_OPTIONS,
  EMERGENCY_RELATIONSHIP_OPTIONS,
  PREFERRED_SHIFT_OPTIONS,
  buildRiderProfileFormState,
  buildRiderProfilePayload,
  validateRiderProfileForm,
} from '../utils/riderProfileForm';
import './RiderProfilePage.css';

function extractFieldError(errors, key) {
  const value = errors?.[key];
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
}

export default function RiderProfilePage() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(() => buildRiderProfileFormState(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saveSuccess, setSaveSuccess] = useState('');
  const [reviewDateRange, setReviewDateRange] = useState({ key: 'all', days: null });
  const [reviewStarFilter, setReviewStarFilter] = useState('all');

  const riderRatingSummary = useMemo(
    () => computeMockRatingSummary(MOCK_RIDER_REVIEWS.filter((r) => r.rider_id === 8), reviewDateRange.days),
    [reviewDateRange.days],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await riderService.getProfile();
      setProfile(data);
      setForm(buildRiderProfileFormState(data));
    } catch (err) {
      setError(err?.message || 'Unable to load rider profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleArrayOption = (field, value) => {
    setSaveError('');
    setSaveSuccess('');
    setForm((prev) => {
      const current = Array.isArray(prev[field]) ? prev[field] : [];
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      return { ...prev, [field]: next };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    setSaveError('');
    setSaveSuccess('');
    const { errors, isValid } = validateRiderProfileForm(form);
    setFieldErrors(errors);
    if (!isValid) return;

    setSaving(true);
    try {
      const payload = buildRiderProfilePayload(form);
      const updated = await riderService.updateProfile(payload);
      if (!updated || typeof updated !== 'object') {
        throw new Error('Unexpected response while updating rider profile.');
      }
      setProfile(updated);
      setForm(buildRiderProfileFormState(updated));
      updateUser?.({ rider_profile: updated });
      window.dispatchEvent(new Event('salo:riderUpdated'));
      setSaveSuccess('Rider profile updated successfully.');
    } catch (err) {
      if (err?.errors && typeof err.errors === 'object') {
        const mapped = {};
        for (const key of [
          'emergency_contact_name',
          'emergency_contact_relationship',
          'emergency_contact_phone',
          'emergency_contact_alt_phone',
          'preferred_hubs',
          'preferred_shifts',
          'available_days',
        ]) {
          const msg = extractFieldError(err.errors, key);
          if (msg) mapped[key] = msg;
        }
        if (Object.keys(mapped).length > 0) setFieldErrors(mapped);
      }
      setSaveError(err?.message || 'Unable to update rider profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rider-page-shell">
        <PageHeader title="Rider profile" subtitle="Review your rider account and vehicle details." eyebrow="Your account" />
        <GlobalStateView state="loading" title="Loading rider profile..." />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="rider-page-shell">
        <PageHeader title="Rider profile" subtitle="Review your rider account and vehicle details." eyebrow="Your account" />
        <GlobalStateView state="error" title="Profile unavailable" description={error || 'No rider profile found.'} onRetry={load} />
      </div>
    );
  }

  const displayName = user?.name || profile.name || user?.username || 'Rider';

  return (
    <div className="rider-page-shell">
      <PageHeader title="Rider profile" subtitle="Review your rider account and vehicle details." eyebrow="Your account" />
      <div className="rider-profile-account-links">
        <Link to="/rider/account-status"><Button variant="secondary">Account status</Button></Link>
      </div>
      <div className="rider-profile-layout">
        <Card>
          <CardBody>
            <div className="rider-profile-identity">
              <div className="rider-profile-avatar" aria-hidden="true">{displayName.slice(0, 2).toUpperCase()}</div>
              <div>
                <h2>{displayName}</h2>
                <p>{profile.base_city || 'Base city not set'}</p>
              </div>
            </div>
            <dl className="rider-profile-fields">
              <div><dt>Email</dt><dd>{user?.email || profile.email || '—'}</dd></div>
              <div><dt>Contact number</dt><dd>{user?.phone || profile.phone_number || '—'}</dd></div>
              <div><dt>Vehicle type</dt><dd>{profile.vehicle_type || '—'}</dd></div>
              <div><dt>Plate number</dt><dd>{profile.plate_number || '—'}</dd></div>
              <div><dt>Emergency contact</dt><dd>{profile.emergency_contact_name || '—'}</dd></div>
              <div><dt>Emergency phone</dt><dd>{profile.emergency_contact_phone || '—'}</dd></div>
              <div><dt>Account status</dt><dd>{profile.rider_status || '—'}</dd></div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2>Emergency contact &amp; schedule preferences</h2>
            <form className="rider-profile-change-form" onSubmit={handleSubmit} noValidate>
              {saveError && (
                <p role="alert" style={{ color: 'var(--status-error-text, #c62828)', margin: 0 }}>
                  {saveError}
                </p>
              )}
              {saveSuccess && (
                <p role="status" style={{ color: 'var(--status-success-text, #1b5e20)', margin: 0 }}>
                  {saveSuccess}
                </p>
              )}

              <label htmlFor="rider-emergency-name">
                <span>Emergency contact name</span>
                <input
                  id="rider-emergency-name"
                  type="text"
                  maxLength={150}
                  value={form.emergency_contact_name}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, emergency_contact_name: e.target.value }));
                    setFieldErrors((prev) => ({ ...prev, emergency_contact_name: '' }));
                    setSaveError('');
                    setSaveSuccess('');
                  }}
                />
                {fieldErrors.emergency_contact_name && (
                  <small role="alert" style={{ color: 'var(--status-error-text, #c62828)' }}>
                    {fieldErrors.emergency_contact_name}
                  </small>
                )}
              </label>

              <label htmlFor="rider-emergency-relationship">
                <span>Relationship</span>
                <select
                  id="rider-emergency-relationship"
                  value={form.emergency_contact_relationship}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, emergency_contact_relationship: e.target.value }));
                    setFieldErrors((prev) => ({ ...prev, emergency_contact_relationship: '' }));
                    setSaveError('');
                    setSaveSuccess('');
                  }}
                >
                  <option value="">Select relationship</option>
                  {EMERGENCY_RELATIONSHIP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {fieldErrors.emergency_contact_relationship && (
                  <small role="alert" style={{ color: 'var(--status-error-text, #c62828)' }}>
                    {fieldErrors.emergency_contact_relationship}
                  </small>
                )}
              </label>

              <label htmlFor="rider-emergency-phone">
                <span>Emergency contact phone</span>
                <input
                  id="rider-emergency-phone"
                  type="tel"
                  maxLength={30}
                  value={form.emergency_contact_phone}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, emergency_contact_phone: e.target.value }));
                    setFieldErrors((prev) => ({ ...prev, emergency_contact_phone: '' }));
                    setSaveError('');
                    setSaveSuccess('');
                  }}
                />
                {fieldErrors.emergency_contact_phone && (
                  <small role="alert" style={{ color: 'var(--status-error-text, #c62828)' }}>
                    {fieldErrors.emergency_contact_phone}
                  </small>
                )}
              </label>

              <label htmlFor="rider-emergency-alt-phone">
                <span>Alternate emergency phone (optional)</span>
                <input
                  id="rider-emergency-alt-phone"
                  type="tel"
                  maxLength={30}
                  value={form.emergency_contact_alt_phone}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, emergency_contact_alt_phone: e.target.value }));
                    setFieldErrors((prev) => ({ ...prev, emergency_contact_alt_phone: '' }));
                    setSaveError('');
                    setSaveSuccess('');
                  }}
                />
                {fieldErrors.emergency_contact_alt_phone && (
                  <small role="alert" style={{ color: 'var(--status-error-text, #c62828)' }}>
                    {fieldErrors.emergency_contact_alt_phone}
                  </small>
                )}
              </label>

              <label htmlFor="rider-preferred-hubs">
                <span>Preferred hubs / areas (optional)</span>
                <input
                  id="rider-preferred-hubs"
                  type="text"
                  maxLength={255}
                  value={form.preferred_hubs}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, preferred_hubs: e.target.value }));
                    setFieldErrors((prev) => ({ ...prev, preferred_hubs: '' }));
                    setSaveError('');
                    setSaveSuccess('');
                  }}
                />
                {fieldErrors.preferred_hubs && (
                  <small role="alert" style={{ color: 'var(--status-error-text, #c62828)' }}>
                    {fieldErrors.preferred_hubs}
                  </small>
                )}
              </label>

              <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>
                  Preferred shifts
                </legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PREFERRED_SHIFT_OPTIONS.map((shift) => {
                    const checked = form.preferred_shifts.includes(shift.value);
                    return (
                      <label key={shift.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-sm)' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleArrayOption('preferred_shifts', shift.value)}
                        />
                        <span>{shift.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 6 }}>
                  Available days
                </legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {AVAILABLE_DAY_OPTIONS.map((day) => {
                    const checked = form.available_days.includes(day.value);
                    return (
                      <label key={day.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-sm)' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleArrayOption('available_days', day.value)}
                        />
                        <span>{day.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div>
                <Button type="submit" variant="primary" loading={saving} disabled={saving}>
                  {saving ? 'Saving...' : 'Save profile'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>

      {/* ── Rider Ratings & Delivery Reviews (Mock UI Phase) ── */}
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <RatingSummaryCard
          title="Delivery Ratings & Reviews"
          subtitle="Independent customer ratings for your completed deliveries (mock preview data)"
          averageRating={riderRatingSummary.averageRating}
          totalCount={riderRatingSummary.totalCount}
          distribution={riderRatingSummary.distribution}
          dateRangeKey={reviewDateRange.key}
          onDateRangeChange={(key, days) => setReviewDateRange({ key, days })}
        />
        <ReviewList
          reviews={riderRatingSummary.eligibleReviews}
          starFilter={reviewStarFilter}
          onStarFilterChange={setReviewStarFilter}
          emptyTitle="No delivery reviews yet"
          emptyDescription="Customer ratings from completed deliveries will appear here."
        />
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import { StateView } from '../../../components/feedback';
import { StatCard, Tabs } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { StarRating } from '../../../components/reviews';
import reviewService from '../../../services/reviewService';
import {
  formatFeaturePeriod,
  formatModerationStatusLabel,
  formatReviewDate,
  getModerationBadgeVariant,
} from '../../../utils/reviewDisplayUtils';
import './AdminPages.css';
import './AdminReviewsFeatured.css';

export default function AdminContentPage() {
  useAdminPageSearch({ disabled: true });

  const [activeTab, setActiveTab] = useState('moderation');

  // ── Review Moderation State ────────────────────────────────
  const [reviewScope, setReviewScope] = useState('restaurant');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [reviewsResp, setReviewsResp] = useState({ items: [], counts: {}, pagination: {} });
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState('');

  const [moderationModal, setModerationModal] = useState(null);
  const [moderationReason, setModerationReason] = useState('');
  const [moderationError, setModerationError] = useState('');
  const [moderating, setModerating] = useState(false);

  // ── Featured Restaurant & Settings State ───────────────────
  const [featuredOverview, setFeaturedOverview] = useState({
    active_week: null,
    ranking: null,
    history: [],
    audit_logs: [],
  });
  const [featuredLoading, setFeaturedLoading] = useState(false);
  const [settings, setSettings] = useState({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [settingsError, setSettingsError] = useState('');

  const [overrideTarget, setOverrideTarget] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideError, setOverrideError] = useState('');
  const [overriding, setOverriding] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evalMessage, setEvalMessage] = useState('');

  const loadAdminReviews = useCallback(async () => {
    setReviewsLoading(true);
    setReviewsError('');
    try {
      const data = await reviewService.getAdminReviews({
        type: reviewScope,
        status: statusFilter,
        search: searchTerm.trim(),
        page,
        per_page: 20,
      });
      setReviewsResp(data);
    } catch (err) {
      setReviewsError(err?.message || 'Unable to load reviews.');
    } finally {
      setReviewsLoading(false);
    }
  }, [reviewScope, statusFilter, searchTerm, page]);

  const loadFeaturedAndSettings = useCallback(async () => {
    setFeaturedLoading(true);
    try {
      const [overview, policy] = await Promise.all([
        reviewService.getAdminFeaturedOverview(),
        reviewService.getAdminReviewSettings(),
      ]);
      setFeaturedOverview(overview);
      setSettings(policy);
    } catch {
      // Handled gracefully
    } finally {
      setFeaturedLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminReviews();
  }, [loadAdminReviews]);

  useEffect(() => {
    loadFeaturedAndSettings();
  }, [loadFeaturedAndSettings]);

  const counts = reviewsResp?.counts || {};
  const flaggedTotal = Number(counts.flagged_total ?? 0);
  const activeFeaturedWeek = featuredOverview?.active_week || null;
  const candidates = featuredOverview?.ranking?.candidates || [];
  const history = featuredOverview?.history || [];
  const auditLogs = featuredOverview?.audit_logs || [];

  const openModerationModal = (review, nextAction) => {
    setModerationModal({ review, nextAction });
    setModerationReason('');
    setModerationError('');
  };

  const handleConfirmModeration = async (e) => {
    e.preventDefault();
    if (!moderationModal || moderating) return;
    const { review, nextAction } = moderationModal;
    const requiresReason = nextAction === 'hidden' || nextAction === 'removed';
    if (requiresReason && !moderationReason.trim()) {
      setModerationError('Moderation reason is required when hiding or removing a review.');
      return;
    }

    const actionMap = {
      published: 'restore',
      hidden: 'hide',
      removed: 'remove',
    };

    setModerating(true);
    setModerationError('');
    try {
      await reviewService.moderateAdminReview(reviewScope, review.id, {
        action: actionMap[nextAction] || nextAction,
        reason: moderationReason.trim(),
      });
      setModerationModal(null);
      setModerationReason('');
      await Promise.all([loadAdminReviews(), loadFeaturedAndSettings()]);
    } catch (err) {
      setModerationError(err?.message || 'Unable to moderate review.');
    } finally {
      setModerating(false);
    }
  };

  const handleRunEvaluation = async () => {
    if (evaluating) return;
    setEvaluating(true);
    setEvalMessage('');
    try {
      const res = await reviewService.evaluateFeaturedNow();
      setEvalMessage(res?.message || 'Evaluation completed.');
      await loadFeaturedAndSettings();
    } catch (err) {
      setEvalMessage(err?.message || 'Unable to run evaluation.');
    } finally {
      setEvaluating(false);
    }
  };

  const handleConfirmOverride = async (e) => {
    e.preventDefault();
    if (!overrideTarget || overriding) return;
    if (!overrideReason.trim()) {
      setOverrideError('An override reason is required for auditability.');
      return;
    }

    setOverriding(true);
    setOverrideError('');
    try {
      await reviewService.overrideFeaturedRestaurant({
        restaurantId: overrideTarget.restaurant_id,
        reason: overrideReason.trim(),
      });
      setOverrideTarget(null);
      setOverrideReason('');
      await loadFeaturedAndSettings();
    } catch (err) {
      setOverrideError(err?.message || 'Unable to override featured restaurant.');
    } finally {
      setOverriding(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (settingsSaving) return;
    setSettingsSaving(true);
    setSettingsMsg('');
    setSettingsError('');
    try {
      const updated = await reviewService.updateAdminReviewSettings(settings);
      setSettings(updated);
      setSettingsMsg('Policy settings saved and active.');
      await loadFeaturedAndSettings();
    } catch (err) {
      setSettingsError(err?.message || 'Unable to save policy settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--salo-brown)' }}>
            Reviews Moderation &amp; Featured Restaurant
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Manage restaurant &amp; rider review moderation, weekly Bayesian featured selections, and policy thresholds.
          </p>
        </div>

        <div className="admin-rf-grid">
          <StatCard
            label="Flagged Reviews"
            value={flaggedTotal}
            hint="Awaiting admin moderation"
            warning={flaggedTotal > 0}
          />
          <StatCard
            label="Published Restaurant Reviews"
            value={counts.published_restaurant ?? 0}
            hint="Eligible for rating & Featured"
          />
          <StatCard
            label="Published Rider Reviews"
            value={counts.published_rider ?? 0}
            hint="Eligible for rider ratings"
          />
          <StatCard
            label="Featured This Week"
            value={activeFeaturedWeek?.restaurant_name || 'None'}
            hint={activeFeaturedWeek ? formatFeaturePeriod(activeFeaturedWeek.feature_start_date, activeFeaturedWeek.feature_end_date) : 'No active selection'}
          />
        </div>

        <Tabs
          items={[
            { value: 'moderation', label: `Review Moderation (${flaggedTotal} flagged)` },
            { value: 'featured', label: 'Featured Restaurant of the Week' },
          ]}
          value={activeTab}
          onChange={setActiveTab}
          label="Reviews and featured management tabs"
        />

        {activeTab === 'moderation' ? (
          <div className="admin-rf-panel" style={{ marginTop: 16 }}>
            <div className="admin-rf-toolbar">
              <div className="admin-rf-pills" role="group" aria-label="Review target type">
                <button
                  type="button"
                  className={`admin-rf-pill${reviewScope === 'restaurant' ? ' is-active' : ''}`}
                  onClick={() => {
                    setReviewScope('restaurant');
                    setPage(1);
                  }}
                >
                  Restaurant Reviews
                </button>
                <button
                  type="button"
                  className={`admin-rf-pill${reviewScope === 'rider' ? ' is-active' : ''}`}
                  onClick={() => {
                    setReviewScope('rider');
                    setPage(1);
                  }}
                >
                  Rider Reviews
                </button>
              </div>

              <div className="admin-rf-pills" role="group" aria-label="Filter by moderation status">
                {['all', 'flagged', 'published', 'hidden', 'removed'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={`admin-rf-pill${statusFilter === st ? ' is-active' : ''}`}
                    onClick={() => {
                      setStatusFilter(st);
                      setPage(1);
                    }}
                  >
                    {st === 'all' ? 'All Statuses' : formatModerationStatusLabel(st)}
                  </button>
                ))}
              </div>

              <input
                type="search"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="Search comment, order ref, name…"
                aria-label="Search reviews"
                style={{
                  border: '1px solid var(--border-primary)',
                  borderRadius: 999,
                  padding: '6px 14px',
                  fontSize: 13,
                  minWidth: 210,
                }}
              />
            </div>

            {reviewsLoading ? (
              <StateView state="loading" title="Loading reviews…" />
            ) : reviewsError ? (
              <StateView state="error" title="Could not load reviews" errorDescription={reviewsError} onRetry={loadAdminReviews} />
            ) : (reviewsResp.items || []).length === 0 ? (
              <StateView state="empty" title="No reviews match the current filter" description="Try another status or search query." />
            ) : (
              <div className="admin-rf-table-wrap">
                <table className="admin-rf-table">
                  <thead>
                    <tr>
                      <th>ID / Order</th>
                      <th>{reviewScope === 'restaurant' ? 'Restaurant' : 'Rider'}</th>
                      <th>Customer &amp; Rating</th>
                      <th>Comment &amp; Notes</th>
                      <th>Status &amp; Eligibility</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reviewsResp.items || []).map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>#{r.id}</strong>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {r.order_reference || '—'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {formatReviewDate(r.created_at)}
                          </div>
                        </td>
                        <td><strong>{r.target_name}</strong></td>
                        <td>
                          <div>{r.customer_name}</div>
                          <StarRating value={r.rating} readOnly size="sm" />
                        </td>
                        <td style={{ maxWidth: 320 }}>
                          <div>{r.comment || <em>No comment</em>}</div>
                          {r.flag_reason && (
                            <div style={{ marginTop: 4, fontSize: 11, color: '#9A6700' }}>
                              <strong>Flag:</strong> {r.flag_reason}
                            </div>
                          )}
                          {r.moderation_reason && (
                            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                              <strong>Moderation:</strong> {r.moderation_reason}
                            </div>
                          )}
                        </td>
                        <td>
                          <Badge variant={getModerationBadgeVariant(r.moderation_status)} size="sm">
                            {formatModerationStatusLabel(r.moderation_status)}
                          </Badge>
                          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                            {r.counts_toward_rating ? 'Counts toward rating' : 'Excluded from rating'}
                          </div>
                        </td>
                        <td>
                          <div className="admin-rf-actions">
                            {r.moderation_status !== 'published' && (
                              <Button variant="secondary" size="sm" onClick={() => openModerationModal(r, 'published')}>
                                Approve / Restore
                              </Button>
                            )}
                            {r.moderation_status !== 'hidden' && (
                              <Button variant="outline" size="sm" onClick={() => openModerationModal(r, 'hidden')}>
                                Hide
                              </Button>
                            )}
                            {r.moderation_status !== 'removed' && (
                              <Button variant="danger-outline" size="sm" onClick={() => openModerationModal(r, 'removed')}>
                                Remove
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(reviewsResp.pagination?.total ?? 0) > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  paddingTop: 4,
                }}
                aria-label="Reviews pagination"
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(reviewsResp.pagination?.current_page ?? page) <= 1 || reviewsLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Page {reviewsResp.pagination?.current_page ?? page} of {reviewsResp.pagination?.last_page ?? 1} · {reviewsResp.pagination?.total ?? 0} total
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(reviewsResp.pagination?.current_page ?? page) >= (reviewsResp.pagination?.last_page ?? 1) || reviewsLoading}
                  onClick={() => setPage((p) => Math.min(reviewsResp.pagination?.last_page ?? p + 1, p + 1))}
                >
                  Next
                </Button>
              </div>
            )}

            <div style={{ marginTop: 8 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--salo-brown)' }}>
                Recent Moderation &amp; Selection Audit Trail
              </h3>
              <div className="admin-rf-table-wrap">
                <table className="admin-rf-table">
                  <thead>
                    <tr>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Reason</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.slice(0, 8).map((log) => (
                      <tr key={log.log_id}>
                        <td>{log.actor_name}</td>
                        <td><code>{log.action}</code></td>
                        <td>{log.entity_type} #{log.entity_id}</td>
                        <td>{log.reason || '—'}</td>
                        <td>{formatReviewDate(log.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 16 }}>
            <div className="admin-rf-panel">
              <div className="admin-rf-toolbar">
                <div>
                  <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--salo-brown)', fontSize: 20 }}>
                    {activeFeaturedWeek ? activeFeaturedWeek.restaurant_name : 'No Active Featured Restaurant This Week'}
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                    {activeFeaturedWeek
                      ? `${formatFeaturePeriod(activeFeaturedWeek.feature_start_date, activeFeaturedWeek.feature_end_date)} · Method: ${activeFeaturedWeek.selection_method === 'admin_override' ? 'Admin Override' : 'Automatic (Bayesian)'}`
                      : 'Run automatic selection or override with an eligible active restaurant.'}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={handleRunEvaluation} loading={evaluating} disabled={evaluating || featuredLoading}>
                  {evaluating ? 'Evaluating…' : 'Run Weekly Evaluation'}
                </Button>
              </div>

              {evalMessage && (
                <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--salo-cream)', fontSize: 13 }}>
                  {evalMessage}
                </div>
              )}

              {activeFeaturedWeek && (
                <div className="admin-rf-metrics">
                  <div className="admin-rf-metric">
                    <span>Bayesian Score</span>
                    <strong>{Number(activeFeaturedWeek.bayesian_score).toFixed(4)}</strong>
                  </div>
                  <div className="admin-rf-metric">
                    <span>Raw Avg (R)</span>
                    <strong>{Number(activeFeaturedWeek.raw_average_rating).toFixed(4)}</strong>
                  </div>
                  <div className="admin-rf-metric">
                    <span>Eligible Reviews (v)</span>
                    <strong>{activeFeaturedWeek.evaluation_review_count}</strong>
                  </div>
                  <div className="admin-rf-metric">
                    <span>Platform Baseline (C)</span>
                    <strong>{Number(activeFeaturedWeek.platform_baseline_rating).toFixed(4)}</strong>
                  </div>
                  <div className="admin-rf-metric">
                    <span>Min Threshold (m)</span>
                    <strong>{activeFeaturedWeek.min_review_threshold}</strong>
                  </div>
                </div>
              )}
            </div>

            <div className="admin-rf-panel">
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: 'var(--salo-brown)' }}>
                  Bayesian Ranking Candidates (Tie-Break Ordered)
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  Formula: Score = (v / (v + m)) × R + (m / (v + m)) × C · Qualification requires v ≥ m.
                </p>
              </div>
              <div className="admin-rf-table-wrap">
                <table className="admin-rf-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Restaurant</th>
                      <th>v (Reviews)</th>
                      <th>R (Raw Avg)</th>
                      <th>Bayesian Score</th>
                      <th>Eligibility</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.length === 0 ? (
                      <tr><td colSpan={7}>No active restaurants have eligible reviews in the current evaluation window.</td></tr>
                    ) : candidates.map((c, idx) => (
                      <tr key={c.restaurant_id}>
                        <td><strong>#{idx + 1}</strong></td>
                        <td>
                          <strong>{c.restaurant_name}</strong>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.cuisine}</div>
                        </td>
                        <td>{c.evaluation_review_count}</td>
                        <td>{Number(c.raw_average_rating).toFixed(4)}</td>
                        <td><strong>{Number(c.bayesian_score).toFixed(4)}</strong></td>
                        <td>
                          <Badge variant={c.qualifies ? 'success' : 'default'} size="sm">
                            {c.qualifies ? `Qualified (≥ ${c.min_review_threshold})` : `Below Threshold (< ${c.min_review_threshold})`}
                          </Badge>
                        </td>
                        <td>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={activeFeaturedWeek?.restaurant_id === c.restaurant_id}
                            onClick={() => {
                              setOverrideTarget(c);
                              setOverrideReason('');
                              setOverrideError('');
                            }}
                          >
                            {activeFeaturedWeek?.restaurant_id === c.restaurant_id ? 'Currently Active' : 'Admin Override'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="admin-rf-panel">
              <h3 style={{ margin: 0, fontSize: 16, color: 'var(--salo-brown)' }}>
                Historical Weekly Featured Records
              </h3>
              <div className="admin-rf-table-wrap">
                <table className="admin-rf-table">
                  <thead>
                    <tr>
                      <th>Feature Week</th>
                      <th>Restaurant</th>
                      <th>Method</th>
                      <th>Status</th>
                      <th>Score / v / R</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 ? (
                      <tr><td colSpan={6}>No featured restaurant history recorded yet.</td></tr>
                    ) : history.map((w) => (
                      <tr key={w.featured_week_id}>
                        <td>{formatFeaturePeriod(w.feature_start_date, w.feature_end_date)}</td>
                        <td><strong>{w.restaurant_name}</strong></td>
                        <td>{w.selection_method === 'admin_override' ? 'Admin Override' : 'Automatic'}</td>
                        <td>
                          <Badge variant={w.selection_status === 'active' ? 'success' : 'default'} size="sm">
                            {w.selection_status}
                          </Badge>
                        </td>
                        <td>
                          {Number(w.bayesian_score).toFixed(4)} · {w.evaluation_review_count} rev · {Number(w.raw_average_rating).toFixed(2)}★
                        </td>
                        <td>{w.override_reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <form className="admin-rf-panel" onSubmit={handleSaveSettings}>
              <div className="admin-rf-toolbar">
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, color: 'var(--salo-brown)' }}>
                    Featured &amp; Review Policy Settings
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    Persisted in platform_settings and applied to all rating and weekly selection calculations.
                  </p>
                </div>
                <Button type="submit" variant="primary" size="sm" loading={settingsSaving} disabled={settingsSaving}>
                  {settingsSaving ? 'Saving…' : 'Save Policy Settings'}
                </Button>
              </div>

              {settingsMsg && (
                <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--salo-green-light)', fontSize: 13 }}>
                  {settingsMsg}
                </div>
              )}
              {settingsError && (
                <div style={{ padding: '8px 12px', borderRadius: 10, background: '#FDECEC', color: 'var(--salo-error)', fontSize: 13 }} role="alert">
                  {settingsError}
                </div>
              )}

              <div className="admin-rf-settings-grid">
                <label className="admin-rf-field">
                  Minimum Qualifying Reviews (m)
                  <input
                    type="number"
                    min={1}
                    value={settings['featured_restaurant.min_review_threshold'] ?? 10}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, 'featured_restaurant.min_review_threshold': Number(e.target.value) }))
                    }
                  />
                </label>

                <label className="admin-rf-field">
                  Evaluation Period (Days)
                  <input
                    type="number"
                    min={1}
                    value={settings['featured_restaurant.evaluation_period_days'] ?? 30}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, 'featured_restaurant.evaluation_period_days': Number(e.target.value) }))
                    }
                  />
                </label>

                <label className="admin-rf-field">
                  Feature Duration (Days)
                  <input
                    type="number"
                    min={1}
                    value={settings['featured_restaurant.feature_period_days'] ?? 7}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, 'featured_restaurant.feature_period_days': Number(e.target.value) }))
                    }
                  />
                </label>

                <label className="admin-rf-field">
                  Week Start Day
                  <select
                    value={settings['featured_restaurant.week_start_day'] ?? 'monday'}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, 'featured_restaurant.week_start_day': e.target.value }))
                    }
                  >
                    {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => (
                      <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                    ))}
                  </select>
                </label>

                <label className="admin-rf-field">
                  Fallback Baseline Rating (C)
                  <input
                    type="number"
                    step="0.1"
                    min={1}
                    max={5}
                    value={settings['featured_restaurant.fallback_baseline_rating'] ?? 4.0}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, 'featured_restaurant.fallback_baseline_rating': Number(e.target.value) }))
                    }
                  />
                </label>

                <label className="admin-rf-field">
                  Min Platform Reviews for Live Baseline
                  <input
                    type="number"
                    min={1}
                    value={settings['featured_restaurant.min_platform_reviews_for_baseline'] ?? 10}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, 'featured_restaurant.min_platform_reviews_for_baseline': Number(e.target.value) }))
                    }
                  />
                </label>

                <label className="admin-rf-field">
                  Automatic Weekly Selection
                  <select
                    value={settings['featured_restaurant.auto_selection_enabled'] ? '1' : '0'}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, 'featured_restaurant.auto_selection_enabled': e.target.value === '1' }))
                    }
                  >
                    <option value="1">Enabled</option>
                    <option value="0">Disabled</option>
                  </select>
                </label>

                <label className="admin-rf-field">
                  Flagged Reviews Count Toward Rating
                  <select
                    value={settings['reviews.flagged_counts_toward_rating'] ? '1' : '0'}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, 'reviews.flagged_counts_toward_rating': e.target.value === '1' }))
                    }
                  >
                    <option value="0">Disabled (Excluded)</option>
                    <option value="1">Enabled (Included)</option>
                  </select>
                </label>
              </div>
            </form>
          </div>
        )}

        {/* Moderation Action Modal */}
        <Modal
          isOpen={Boolean(moderationModal)}
          onClose={() => !moderating && setModerationModal(null)}
          title={`Confirm Review Action: ${moderationModal ? formatModerationStatusLabel(moderationModal.nextAction) : ''}`}
          size="sm"
        >
          <form onSubmit={handleConfirmModeration} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              Reviews are never permanently erased; hidden and removed reviews are excluded from rating calculations and logged to audit history.
            </p>
            <textarea
              className="admin-rf-textarea"
              rows={3}
              value={moderationReason}
              onChange={(e) => {
                setModerationReason(e.target.value);
                if (moderationError) setModerationError('');
              }}
              placeholder="Enter moderation reason (required for hiding/removing)..."
              disabled={moderating}
            />
            {moderationError && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--salo-error)' }} role="alert">
                {moderationError}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setModerationModal(null)} disabled={moderating}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={moderating} disabled={moderating}>
                {moderating ? 'Saving…' : 'Confirm'}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Admin Override Modal */}
        <Modal
          isOpen={Boolean(overrideTarget)}
          onClose={() => !overriding && setOverrideTarget(null)}
          title={`Override Featured Restaurant: ${overrideTarget?.restaurant_name || ''}`}
          size="sm"
        >
          <form onSubmit={handleConfirmOverride} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              The current active weekly selection will be preserved as <strong>superseded</strong>, and this override will be recorded in the audit log.
            </p>
            <textarea
              className="admin-rf-textarea"
              rows={3}
              value={overrideReason}
              onChange={(e) => {
                setOverrideReason(e.target.value);
                if (overrideError) setOverrideError('');
              }}
              placeholder="Provide a required reason for overriding this week's selection..."
              disabled={overriding}
            />
            {overrideError && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--salo-error)' }} role="alert">
                {overrideError}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOverrideTarget(null)} disabled={overriding}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={overriding} disabled={overriding}>
                {overriding ? 'Overriding…' : 'Confirm Override'}
              </Button>
            </div>
          </form>
        </Modal>
      </section>
    </AdminLayout>
  );
}

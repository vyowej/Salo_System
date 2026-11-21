import { useMemo, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import { StatCard, Tabs } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { StarRating } from '../../../components/reviews';
import {
  MOCK_FEATURED_CANDIDATES,
  MOCK_FEATURED_RESTAURANT_WEEKS,
  MOCK_MODERATION_AUDIT_LOGS,
  MOCK_PLATFORM_SETTINGS,
  MOCK_RESTAURANT_REVIEWS,
  MOCK_RIDER_REVIEWS,
} from '../../../mocks/reviewsAndFeaturedMock';
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

  // ── Review Moderation State (Mock UI Phase) ────────────────
  const [reviewScope, setReviewScope] = useState('restaurant');
  const [statusFilter, setStatusFilter] = useState('all');
  const [restaurantReviews, setRestaurantReviews] = useState(() => MOCK_RESTAURANT_REVIEWS);
  const [riderReviews, setRiderReviews] = useState(() => MOCK_RIDER_REVIEWS);
  const [auditLogs, setAuditLogs] = useState(() => MOCK_MODERATION_AUDIT_LOGS);

  const [moderationModal, setModerationModal] = useState(null);
  const [moderationReason, setModerationReason] = useState('');
  const [moderationError, setModerationError] = useState('');

  // ── Featured Restaurant & Settings State (Mock UI Phase) ───
  const [featuredWeeks, setFeaturedWeeks] = useState(() => MOCK_FEATURED_RESTAURANT_WEEKS);
  const [settings, setSettings] = useState(() => MOCK_PLATFORM_SETTINGS);
  const [settingsSavedMsg, setSettingsSavedMsg] = useState('');
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideError, setOverrideError] = useState('');

  const activeReviews = reviewScope === 'restaurant' ? restaurantReviews : riderReviews;

  const filteredReviews = useMemo(() => {
    return activeReviews.filter((r) => {
      if (statusFilter === 'all') return true;
      return r.moderation_status === statusFilter;
    });
  }, [activeReviews, statusFilter]);

  const flaggedTotal = useMemo(
    () =>
      restaurantReviews.filter((r) => r.moderation_status === 'flagged').length +
      riderReviews.filter((r) => r.moderation_status === 'flagged').length,
    [restaurantReviews, riderReviews],
  );

  const activeFeaturedWeek = useMemo(
    () => featuredWeeks.find((w) => w.selection_status === 'active') || featuredWeeks[0] || null,
    [featuredWeeks],
  );

  const openModerationModal = (review, nextAction) => {
    setModerationModal({ review, nextAction });
    setModerationReason('');
    setModerationError('');
  };

  const handleConfirmModeration = (e) => {
    e.preventDefault();
    if (!moderationModal) return;
    const { review, nextAction } = moderationModal;
    const requiresReason = nextAction === 'hidden' || nextAction === 'removed';
    if (requiresReason && !moderationReason.trim()) {
      setModerationError('Moderation reason is required when hiding or removing a review.');
      return;
    }

    const isPublished = nextAction === 'published';
    const nowIso = new Date().toISOString();
    const updater = (list) =>
      list.map((item) => {
        const itemId = item.review_id ?? item.rider_review_id;
        const targetId = review.review_id ?? review.rider_review_id;
        if (itemId !== targetId) return item;
        return {
          ...item,
          moderation_status: nextAction,
          is_visible: isPublished,
          counts_toward_rating: isPublished,
          moderated_by: 1,
          moderated_at: nowIso,
          moderation_action: isPublished ? 'restored' : nextAction,
          moderation_reason: moderationReason.trim() || 'Reviewed and approved by admin.',
        };
      });

    if (reviewScope === 'restaurant') {
      setRestaurantReviews(updater);
    } else {
      setRiderReviews(updater);
    }

    setAuditLogs((prev) => [
      {
        log_id: Date.now(),
        actor_name: 'Admin (Preview)',
        action: `review.${isPublished ? 'restored' : nextAction}`,
        entity_type: reviewScope === 'restaurant' ? 'restaurant_review' : 'rider_review',
        entity_id: String(review.review_id ?? review.rider_review_id),
        reason: moderationReason.trim() || 'Approved by administrator.',
        created_at: nowIso,
      },
      ...prev,
    ]);

    setModerationModal(null);
    setModerationReason('');
    setModerationError('');
  };

  const handleConfirmOverride = (e) => {
    e.preventDefault();
    if (!overrideTarget) return;
    if (!overrideReason.trim()) {
      setOverrideError('An override reason is required for auditability.');
      return;
    }

    const nowIso = new Date().toISOString();
    const currentActive = featuredWeeks.find((w) => w.selection_status === 'active');
    const newId = Math.max(...featuredWeeks.map((w) => w.featured_week_id), 300) + 1;

    setFeaturedWeeks((prev) => [
      {
        featured_week_id: newId,
        restaurant_id: overrideTarget.restaurant_id,
        restaurant_name: overrideTarget.restaurant_name,
        cuisine: overrideTarget.cuisine,
        address: 'Metro Manila',
        cover_photo: '/images/landing/food-gathering.png',
        feature_start_date: currentActive?.feature_start_date || '2026-11-16',
        feature_end_date: currentActive?.feature_end_date || '2026-11-22',
        evaluation_start_at: currentActive?.evaluation_start_at || '2026-10-17T00:00:00+08:00',
        evaluation_end_at: currentActive?.evaluation_end_at || '2026-11-15T23:59:59+08:00',
        evaluation_review_count: overrideTarget.evaluation_review_count,
        raw_average_rating: overrideTarget.raw_average_rating,
        bayesian_score: overrideTarget.bayesian_score,
        platform_baseline_rating: overrideTarget.platform_baseline_rating,
        min_review_threshold: overrideTarget.min_review_threshold,
        last_eligible_review_at: overrideTarget.last_eligible_review_at,
        selection_method: 'admin_override',
        selection_status: 'active',
        supersedes_featured_week_id: currentActive?.featured_week_id || null,
        selected_at: nowIso,
        selected_by: 'Admin (Preview)',
        override_reason: overrideReason.trim(),
      },
      ...prev.map((w) =>
        w.featured_week_id === currentActive?.featured_week_id
          ? { ...w, selection_status: 'superseded' }
          : w,
      ),
    ]);

    setAuditLogs((prev) => [
      {
        log_id: Date.now(),
        actor_name: 'Admin (Preview)',
        action: 'featured_restaurant.override',
        entity_type: 'featured_restaurant_week',
        entity_id: String(newId),
        reason: overrideReason.trim(),
        created_at: nowIso,
      },
      ...prev,
    ]);

    setOverrideTarget(null);
    setOverrideReason('');
    setOverrideError('');
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    setSettingsSavedMsg('Policy settings updated in local UI preview state.');
    setTimeout(() => setSettingsSavedMsg(''), 3500);
  };

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--salo-brown)' }}>
            Reviews Moderation &amp; Featured Restaurant
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Manage restaurant &amp; rider review moderation, weekly Bayesian featured selections, and policy thresholds (Mock UI Phase).
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
            value={restaurantReviews.filter((r) => r.moderation_status === 'published').length}
            hint="Eligible for rating & Featured"
          />
          <StatCard
            label="Published Rider Reviews"
            value={riderReviews.filter((r) => r.moderation_status === 'published').length}
            hint="Eligible for rider ratings"
          />
          <StatCard
            label="Featured This Week"
            value={activeFeaturedWeek?.restaurant_name || 'None'}
            hint={activeFeaturedWeek ? formatFeaturePeriod(activeFeaturedWeek.feature_start_date, activeFeaturedWeek.feature_end_date) : ''}
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
                  onClick={() => setReviewScope('restaurant')}
                >
                  Restaurant Reviews ({restaurantReviews.length})
                </button>
                <button
                  type="button"
                  className={`admin-rf-pill${reviewScope === 'rider' ? ' is-active' : ''}`}
                  onClick={() => setReviewScope('rider')}
                >
                  Rider Reviews ({riderReviews.length})
                </button>
              </div>

              <div className="admin-rf-pills" role="group" aria-label="Filter by moderation status">
                {['all', 'flagged', 'published', 'hidden', 'removed'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={`admin-rf-pill${statusFilter === st ? ' is-active' : ''}`}
                    onClick={() => setStatusFilter(st)}
                  >
                    {st === 'all' ? 'All Statuses' : formatModerationStatusLabel(st)}
                  </button>
                ))}
              </div>
            </div>

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
                  {filteredReviews.map((r) => {
                    const id = r.review_id ?? r.rider_review_id;
                    return (
                      <tr key={id}>
                        <td>
                          <strong>#{id}</strong>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {r.order_reference}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {formatReviewDate(r.created_at)}
                          </div>
                        </td>
                        <td>
                          <strong>{reviewScope === 'restaurant' ? r.restaurant_name : r.rider_name}</strong>
                        </td>
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
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openModerationModal(r, 'published')}
                              >
                                Approve / Restore
                              </Button>
                            )}
                            {r.moderation_status !== 'hidden' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openModerationModal(r, 'hidden')}
                              >
                                Hide
                              </Button>
                            )}
                            {r.moderation_status !== 'removed' && (
                              <Button
                                variant="danger-outline"
                                size="sm"
                                onClick={() => openModerationModal(r, 'removed')}
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 8 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--salo-brown)' }}>
                Recent Moderation &amp; Selection Audit Trail (audit_logs preview)
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
                    {auditLogs.slice(0, 6).map((log) => (
                      <tr key={log.log_id}>
                        <td>{log.actor_name}</td>
                        <td><code>{log.action}</code></td>
                        <td>{log.entity_type} #{log.entity_id}</td>
                        <td>{log.reason}</td>
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
            {activeFeaturedWeek && (
              <div className="admin-rf-panel">
                <div className="admin-rf-featured-hero">
                  <div>
                    <Badge variant="warning" size="sm">
                      Active Weekly Feature · {formatFeaturePeriod(activeFeaturedWeek.feature_start_date, activeFeaturedWeek.feature_end_date)}
                    </Badge>
                    <h2 style={{ margin: '8px 0 4px', fontFamily: 'var(--font-heading)', color: 'var(--salo-brown)' }}>
                      {activeFeaturedWeek.restaurant_name}
                    </h2>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                      Selection Method: <strong>{activeFeaturedWeek.selection_method === 'admin_override' ? 'Admin Override' : 'Automatic (Bayesian)'}</strong>
                      {activeFeaturedWeek.override_reason ? ` — ${activeFeaturedWeek.override_reason}` : ''}
                    </p>
                  </div>
                </div>

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
              </div>
            )}

            <div className="admin-rf-panel">
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: 'var(--salo-brown)' }}>
                  30-Day Bayesian Ranking Candidates (Tie-Break Ordered)
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
                    {MOCK_FEATURED_CANDIDATES.map((c, idx) => (
                      <tr key={c.restaurant_id}>
                        <td><strong>#{idx + 1}</strong></td>
                        <td>
                          <strong>{c.restaurant_name}</strong>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.cuisine}</div>
                        </td>
                        <td>{c.evaluation_review_count}</td>
                        <td>{c.raw_average_rating.toFixed(4)}</td>
                        <td><strong>{c.bayesian_score.toFixed(4)}</strong></td>
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
                Historical Weekly Featured Records (featured_restaurant_weeks)
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
                    {featuredWeeks.map((w) => (
                      <tr key={w.featured_week_id}>
                        <td>{formatFeaturePeriod(w.feature_start_date, w.feature_end_date)}</td>
                        <td><strong>{w.restaurant_name}</strong></td>
                        <td>{w.selection_method === 'admin_override' ? 'Admin Override' : 'Automatic'}</td>
                        <td>
                          <Badge
                            variant={w.selection_status === 'active' ? 'success' : 'default'}
                            size="sm"
                          >
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
                    Featured &amp; Review Policy Settings (platform_settings)
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    Configurable thresholds and evaluation windows (saved locally in preview mode).
                  </p>
                </div>
                <Button type="submit" variant="primary" size="sm">
                  Save Policy Settings
                </Button>
              </div>

              {settingsSavedMsg && (
                <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--salo-green-light)', fontSize: 13 }}>
                  {settingsSavedMsg}
                </div>
              )}

              <div className="admin-rf-settings-grid">
                <label className="admin-rf-field">
                  Minimum Qualifying Reviews (m)
                  <input
                    type="number"
                    min={1}
                    value={settings['featured_restaurant.min_review_threshold']}
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
                    value={settings['featured_restaurant.evaluation_period_days']}
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
                    value={settings['featured_restaurant.feature_period_days']}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, 'featured_restaurant.feature_period_days': Number(e.target.value) }))
                    }
                  />
                </label>

                <label className="admin-rf-field">
                  Fallback Baseline Rating (C)
                  <input
                    type="number"
                    step="0.1"
                    min={1}
                    max={5}
                    value={settings['featured_restaurant.fallback_baseline_rating']}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, 'featured_restaurant.fallback_baseline_rating': Number(e.target.value) }))
                    }
                  />
                </label>
              </div>
            </form>
          </div>
        )}

        {/* Moderation Action Modal */}
        <Modal
          isOpen={Boolean(moderationModal)}
          onClose={() => setModerationModal(null)}
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
            />
            {moderationError && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--salo-error)' }} role="alert">
                {moderationError}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setModerationModal(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Confirm
              </Button>
            </div>
          </form>
        </Modal>

        {/* Admin Override Modal */}
        <Modal
          isOpen={Boolean(overrideTarget)}
          onClose={() => setOverrideTarget(null)}
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
            />
            {overrideError && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--salo-error)' }} role="alert">
                {overrideError}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOverrideTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Confirm Override
              </Button>
            </div>
          </form>
        </Modal>
      </section>
    </AdminLayout>
  );
}

import { useCallback, useEffect, useState } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import { StateView } from '../../../components/feedback';
import { RatingSummaryCard, ReviewList } from '../../../components/reviews';
import reviewService from '../../../services/reviewService';
import { formatFeaturePeriod } from '../../../utils/reviewDisplayUtils';
import { useRestaurantAccess } from '../access/useRestaurantAccess';

export default function OwnerReportsPage() {
  const { selectedRestaurantId, selectedRestaurant } = useRestaurantAccess();

  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState({ key: 'all', days: null });
  const [starFilter, setStarFilter] = useState('all');

  const [flagTarget, setFlagTarget] = useState(null);
  const [flagReason, setFlagReason] = useState('');
  const [flagError, setFlagError] = useState('');
  const [flagging, setFlagging] = useState(false);

  const loadFeedback = useCallback(async () => {
    if (!selectedRestaurantId) return;
    setLoading(true);
    setError('');
    try {
      const data = await reviewService.getOwnerRestaurantFeedback({
        restaurant_id: selectedRestaurantId,
        days: dateRange.days,
        rating: starFilter,
        per_page: 25,
      });
      setFeedback(data);
    } catch (err) {
      setError(err?.message || 'Unable to load restaurant reviews.');
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId, dateRange.days, starFilter]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  const handleOpenFlag = (review) => {
    setFlagTarget(review);
    setFlagReason('');
    setFlagError('');
  };

  const handleSubmitFlag = async (e) => {
    e.preventDefault();
    if (flagging || !flagTarget) return;
    if (!flagReason.trim()) {
      setFlagError('Please provide a reason for flagging this review.');
      return;
    }

    setFlagging(true);
    setFlagError('');
    try {
      await reviewService.flagReview(flagTarget.review_id, flagReason.trim());
      setFlagTarget(null);
      setFlagReason('');
      await loadFeedback();
    } catch (err) {
      setFlagError(err?.message || 'Unable to flag review.');
    } finally {
      setFlagging(false);
    }
  };

  const summary = feedback?.rating_summary || {
    average_rating: null,
    total_count: 0,
    distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  };
  const reviews = feedback?.reviews || [];
  const featuredRecord = feedback?.featured_week || null;

  return (
    <OwnerLayout>
      <div style={{ padding: 'var(--space-4) 0', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--salo-brown)' }}>
              Ratings &amp; Customer Reviews
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
              {feedback?.restaurant?.restaurant_name || selectedRestaurant?.name || 'Your kitchen'} · Verified customer review insights &amp; Featured status.
            </p>
          </div>
          {featuredRecord && (
            <Badge variant="warning" size="md">
              ★ Featured Restaurant of the Week ({formatFeaturePeriod(featuredRecord.feature_start_date, featuredRecord.feature_end_date)})
            </Badge>
          )}
        </div>

        {loading && !feedback ? (
          <StateView state="loading" title="Loading restaurant ratings and reviews…" />
        ) : error && !feedback ? (
          <StateView state="error" title="Could not load reviews" errorDescription={error} onRetry={loadFeedback} />
        ) : (
          <>
            <RatingSummaryCard
              title="Overall Restaurant Rating"
              subtitle="Calculated from published, eligible reviews only (moderated/flagged excluded)"
              averageRating={summary.average_rating}
              totalCount={summary.total_count}
              distribution={summary.distribution}
              dateRangeKey={dateRange.key}
              onDateRangeChange={(key, days) => setDateRange({ key, days })}
            />

            <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Customer reviews">
              <h2 style={{ margin: 0, fontSize: 18, color: 'var(--salo-brown)' }}>
                Customer Feedback ({feedback?.pagination?.total ?? reviews.length})
              </h2>
              <ReviewList
                reviews={reviews}
                starFilter={starFilter}
                onStarFilterChange={setStarFilter}
                showModerationBadge
                onFlagReview={handleOpenFlag}
                emptyTitle="No reviews in this period"
                emptyDescription="Customer ratings and comments for completed orders will appear here."
              />
            </section>
          </>
        )}

        <Modal
          isOpen={Boolean(flagTarget)}
          onClose={() => !flagging && setFlagTarget(null)}
          title="Flag Review for Admin Moderation"
          size="sm"
        >
          <form onSubmit={handleSubmitFlag} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              Flagged reviews are queued for SALO administrator review and handled according to platform rating eligibility policy.
            </p>
            <textarea
              rows={3}
              value={flagReason}
              onChange={(e) => {
                setFlagReason(e.target.value);
                if (flagError) setFlagError('');
              }}
              placeholder="Explain why this review should be moderated (e.g., spam, abusive language, wrong order)..."
              disabled={flagging}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                borderRadius: 10,
                border: '1px solid var(--border-primary)',
                padding: 10,
                fontFamily: 'inherit',
                fontSize: 13,
              }}
            />
            {flagError && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--salo-error)' }} role="alert">
                {flagError}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setFlagTarget(null)} disabled={flagging}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={flagging} disabled={flagging}>
                {flagging ? 'Submitting…' : 'Submit Flag'}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </OwnerLayout>
  );
}

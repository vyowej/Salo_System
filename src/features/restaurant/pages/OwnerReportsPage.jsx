import { useMemo, useState } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import { RatingSummaryCard, ReviewList } from '../../../components/reviews';
import {
  MOCK_FEATURED_RESTAURANT_WEEKS,
  MOCK_RESTAURANT_REVIEWS,
} from '../../../mocks/reviewsAndFeaturedMock';
import {
  computeMockRatingSummary,
  formatFeaturePeriod,
} from '../../../utils/reviewDisplayUtils';
import { useRestaurantAccess } from '../access/useRestaurantAccess';

export default function OwnerReportsPage() {
  const { selectedRestaurantId, selectedRestaurant } = useRestaurantAccess();

  const [reviews, setReviews] = useState(() => MOCK_RESTAURANT_REVIEWS);
  const [dateRange, setDateRange] = useState({ key: 'all', days: null });
  const [starFilter, setStarFilter] = useState('all');
  const [flagTarget, setFlagTarget] = useState(null);
  const [flagReason, setFlagReason] = useState('');
  const [flagError, setFlagError] = useState('');

  const restaurantReviews = useMemo(() => {
    const matched = reviews.filter(
      (r) => String(r.restaurant_id) === String(selectedRestaurantId || ''),
    );
    return matched.length > 0 ? matched : reviews.filter((r) => r.restaurant_id === 1);
  }, [reviews, selectedRestaurantId]);

  const summary = useMemo(
    () => computeMockRatingSummary(restaurantReviews, dateRange.days),
    [restaurantReviews, dateRange.days],
  );

  const featuredRecord = useMemo(
    () => MOCK_FEATURED_RESTAURANT_WEEKS.find((w) => w.selection_status === 'active') || null,
    [],
  );

  const handleOpenFlag = (review) => {
    setFlagTarget(review);
    setFlagReason('');
    setFlagError('');
  };

  const handleSubmitFlag = (e) => {
    e.preventDefault();
    if (!flagReason.trim()) {
      setFlagError('Please provide a reason for flagging this review.');
      return;
    }

    setReviews((prev) =>
      prev.map((item) =>
        item.review_id === flagTarget.review_id
          ? {
              ...item,
              moderation_status: 'flagged',
              counts_toward_rating: false,
              flagged_at: new Date().toISOString(),
              flag_reason: flagReason.trim(),
              moderation_action: 'flagged',
            }
          : item,
      ),
    );
    setFlagTarget(null);
    setFlagReason('');
    setFlagError('');
  };

  return (
    <OwnerLayout>
      <div style={{ padding: 'var(--space-4) 0', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--salo-brown)' }}>
              Ratings &amp; Customer Reviews
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
              {selectedRestaurant?.name || 'Your kitchen'} · Verified review insights &amp; Featured status (mock UI preview).
            </p>
          </div>
          {featuredRecord && (
            <Badge variant="warning" size="md">
              ★ Featured Restaurant of the Week ({formatFeaturePeriod(featuredRecord.feature_start_date, featuredRecord.feature_end_date)})
            </Badge>
          )}
        </div>

        <RatingSummaryCard
          title="Overall Restaurant Rating"
          subtitle="Calculated from published, eligible reviews only (moderated/flagged excluded)"
          averageRating={summary.averageRating}
          totalCount={summary.totalCount}
          distribution={summary.distribution}
          dateRangeKey={dateRange.key}
          onDateRangeChange={(key, days) => setDateRange({ key, days })}
        />

        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Customer reviews">
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--salo-brown)' }}>
            Customer Feedback ({summary.allMatchingDateReviews.length})
          </h2>
          <ReviewList
            reviews={summary.allMatchingDateReviews}
            starFilter={starFilter}
            onStarFilterChange={setStarFilter}
            showModerationBadge
            onFlagReview={handleOpenFlag}
            emptyTitle="No reviews in this period"
            emptyDescription="Customer ratings and comments for completed orders will appear here."
          />
        </section>

        <Modal
          isOpen={Boolean(flagTarget)}
          onClose={() => setFlagTarget(null)}
          title="Flag Review for Admin Moderation"
          size="sm"
        >
          <form onSubmit={handleSubmitFlag} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              Flagged reviews are queued for SALO administrator review and excluded from rating calculations pending review.
            </p>
            <textarea
              rows={3}
              value={flagReason}
              onChange={(e) => {
                setFlagReason(e.target.value);
                if (flagError) setFlagError('');
              }}
              placeholder="Explain why this review should be moderated (e.g., spam, abusive language, wrong order)..."
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
              <Button type="button" variant="ghost" size="sm" onClick={() => setFlagTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Submit Flag
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </OwnerLayout>
  );
}

import { useCallback, useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import { StateView as GlobalStateView } from '../../../components/feedback';
import { RatingSummaryCard, ReviewList } from '../../../components/reviews';
import reviewService from '../../../services/reviewService';
import PageHeader from '../components/PageHeader';

export default function RiderReviewsPage() {
  const [dateRange, setDateRange] = useState({ key: 'all', days: null });
  const [starFilter, setStarFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState({
    rating_summary: {
      average_rating: null,
      total_count: 0,
      distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    },
    reviews: [],
    pagination: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadFeedback = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await reviewService.getRiderFeedback({
        days: dateRange.days,
        rating: starFilter,
        page,
        per_page: 20,
      });
      if (data) {
        setFeedback(data);
      }
    } catch (err) {
      setError(err?.message || 'Unable to load customer ratings and comments.');
    } finally {
      setLoading(false);
    }
  }, [dateRange.days, starFilter, page]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  const summary = feedback?.rating_summary || {
    average_rating: null,
    total_count: 0,
    distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  };
  const pagination = feedback?.pagination || { current_page: 1, last_page: 1, total: 0 };

  return (
    <div className="rider-page-shell">
      <PageHeader
        title="Ratings & reviews"
        subtitle="See customer star ratings and delivery feedback from your completed trips."
        eyebrow="Feedback"
        actions={
          <Button variant="secondary" onClick={loadFeedback} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && (
        <div role="alert" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--status-error-bg)', color: 'var(--status-error-text)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <RatingSummaryCard
          title="Delivery Ratings & Reviews"
          subtitle={loading ? 'Loading delivery ratings…' : 'Independent customer ratings for your completed deliveries'}
          averageRating={summary.average_rating}
          totalCount={summary.total_count}
          distribution={summary.distribution}
          dateRangeKey={dateRange.key}
          onDateRangeChange={(key, days) => {
            setDateRange({ key, days });
            setPage(1);
          }}
        />

        {loading && (feedback.reviews || []).length === 0 ? (
          <GlobalStateView state="loading" title="Loading customer reviews..." />
        ) : (
          <ReviewList
            reviews={feedback.reviews || []}
            starFilter={starFilter}
            onStarFilterChange={(next) => {
              setStarFilter(next);
              setPage(1);
            }}
            emptyTitle="No delivery reviews yet"
            emptyDescription="Customer ratings and comments from completed deliveries will appear here."
          />
        )}

        {pagination.last_page > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)' }}>
            <Button
              variant="secondary"
              disabled={pagination.current_page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
              Page {pagination.current_page} of {pagination.last_page}
            </span>
            <Button
              variant="secondary"
              disabled={pagination.current_page >= pagination.last_page || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

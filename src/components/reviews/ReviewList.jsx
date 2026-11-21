import Badge from '../common/Badge';
import Button from '../common/Button';
import StarRating from './StarRating';
import {
  formatModerationStatusLabel,
  formatReviewDate,
  getModerationBadgeVariant,
} from '../../utils/reviewDisplayUtils';
import './ReviewList.css';

export default function ReviewList({
  reviews = [],
  starFilter = 'all',
  onStarFilterChange,
  showModerationBadge = false,
  onFlagReview,
  emptyTitle = 'No reviews yet',
  emptyDescription = 'Customer feedback will appear here once orders are reviewed.',
}) {
  const visibleReviews = reviews.filter((review) => {
    if (starFilter === 'all') return true;
    return Number(review.rating) === Number(starFilter);
  });

  return (
    <div className="salo-review-list">
      {onStarFilterChange && (
        <div className="salo-review-list__filters" role="group" aria-label="Filter reviews by star rating">
          {[
            { key: 'all', label: 'All Stars' },
            { key: '5', label: '5 ★' },
            { key: '4', label: '4 ★' },
            { key: '3', label: '3 ★' },
            { key: '2', label: '2 ★' },
            { key: '1', label: '1 ★' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`salo-review-list__filter-chip${String(starFilter) === opt.key ? ' is-active' : ''}`}
              onClick={() => onStarFilterChange(opt.key)}
              aria-pressed={String(starFilter) === opt.key}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {visibleReviews.length === 0 ? (
        <div className="salo-review-list__empty">
          <strong>{emptyTitle}</strong>
          <p>{emptyDescription}</p>
        </div>
      ) : (
        <div className="salo-review-list__items">
          {visibleReviews.map((review) => {
            const id = review.review_id ?? review.rider_review_id;
            return (
              <article key={id} className="salo-review-card">
                <div className="salo-review-card__top">
                  <div className="salo-review-card__author">
                    <span className="salo-review-card__avatar" aria-hidden="true">
                      {(review.customer_name || 'C').slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <strong className="salo-review-card__name">
                        {review.customer_name || 'Verified Customer'}
                      </strong>
                      <div className="salo-review-card__meta">
                        <span>{formatReviewDate(review.created_at)}</span>
                        {review.order_reference && <span>· {review.order_reference}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="salo-review-card__right">
                    <StarRating value={review.rating} readOnly size="sm" />
                    {showModerationBadge && (
                      <Badge
                        variant={getModerationBadgeVariant(review.moderation_status)}
                        size="sm"
                      >
                        {formatModerationStatusLabel(review.moderation_status)}
                      </Badge>
                    )}
                  </div>
                </div>

                {review.comment && (
                  <p className="salo-review-card__comment">{review.comment}</p>
                )}

                {showModerationBadge && review.moderation_status === 'flagged' && review.flag_reason && (
                  <div className="salo-review-card__notice">
                    <strong>Flagged:</strong> {review.flag_reason}
                  </div>
                )}

                {onFlagReview && review.moderation_status === 'published' && (
                  <div className="salo-review-card__actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onFlagReview(review)}
                    >
                      Flag for Moderation
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { StarRating } from '../../../components/reviews';
import reviewService from '../../../services/reviewService';
import './OrderReviewSection.css';

function SingleTargetReviewCard({
  eyebrow,
  title,
  subtitle,
  submittedReview,
  submitting,
  submitError,
  onSubmit,
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [localError, setLocalError] = useState('');

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    if (rating < 1 || rating > 5) {
      setLocalError('Please select a star rating from 1 to 5.');
      return;
    }
    setLocalError('');
    onSubmit({
      rating,
      comment: comment.trim() || null,
    });
  };

  if (submittedReview) {
    return (
      <div className="salo-order-review-card is-submitted">
        <div className="salo-order-review-card__head">
          <div>
            <span className="salo-order-review-card__eyebrow">{eyebrow}</span>
            <h4 className="salo-order-review-card__title">{title}</h4>
          </div>
          <Badge variant="success" size="sm">Submitted</Badge>
        </div>
        <StarRating value={submittedReview.rating} readOnly size="md" showLabel />
        {submittedReview.comment ? (
          <p className="salo-order-review-card__quote">“{submittedReview.comment}”</p>
        ) : (
          <p className="salo-order-review-card__muted">No written comment added.</p>
        )}
      </div>
    );
  }

  const displayError = localError || submitError;

  return (
    <form className="salo-order-review-card" onSubmit={handleFormSubmit} noValidate>
      <div className="salo-order-review-card__head">
        <div>
          <span className="salo-order-review-card__eyebrow">{eyebrow}</span>
          <h4 className="salo-order-review-card__title">{title}</h4>
          {subtitle && <p className="salo-order-review-card__sub">{subtitle}</p>}
        </div>
        <Badge variant="default" size="sm">Optional</Badge>
      </div>

      <div className="salo-order-review-card__stars">
        <StarRating
          value={rating}
          onChange={(val) => {
            setRating(val);
            if (localError) setLocalError('');
          }}
          size="lg"
          showLabel
          ariaLabel={`Rate ${title}`}
        />
      </div>

      <textarea
        className="salo-order-review-card__textarea"
        rows={3}
        maxLength={1000}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share optional feedback about your experience..."
        aria-label={`Optional comment for ${title}`}
        disabled={submitting}
      />

      {displayError && (
        <p className="salo-order-review-card__error" role="alert">
          {displayError}
        </p>
      )}

      <div className="salo-order-review-card__footer">
        <span className="salo-order-review-card__hint">
          Verified order feedback
        </span>
        <Button type="submit" variant="primary" size="sm" loading={submitting} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit Review'}
        </Button>
      </div>
    </form>
  );
}

export default function OrderReviewSection({
  orderId,
  restaurantName = 'Restaurant',
  riderName = null,
  isDelivery = false,
  isEligible = false,
  onStatusChange,
}) {
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submittingRest, setSubmittingRest] = useState(false);
  const [submittingRider, setSubmittingRider] = useState(false);
  const [restError, setRestError] = useState('');
  const [riderError, setRiderError] = useState('');

  const loadStatus = useCallback(async () => {
    if (!orderId || !isEligible) return;
    setLoading(true);
    setLoadError('');
    try {
      const data = await reviewService.getOrderReviewStatus(orderId);
      setStatusData(data);
    } catch (err) {
      setLoadError(err?.message || 'Unable to load review status.');
    } finally {
      setLoading(false);
    }
  }, [orderId, isEligible]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!statusData || typeof onStatusChange !== 'function') return;
    const hasRest = Boolean(statusData.restaurant_review);
    const hasRider = Boolean(statusData.rider_review);
    const needsRider = Boolean((isDelivery || statusData.order_type === 'delivery') && (statusData.can_review_rider || hasRider));
    onStatusChange({
      allSubmitted: hasRest && (!needsRider || hasRider),
      hasAnySubmitted: hasRest || hasRider,
    });
  }, [statusData, isDelivery, onStatusChange]);

  if (!isEligible) {
    return null;
  }

  const canShowRestaurant = Boolean(statusData?.can_review_restaurant || statusData?.restaurant_review);
  const canShowRider = Boolean(
    (isDelivery || statusData?.order_type === 'delivery') &&
    (statusData?.can_review_rider || statusData?.rider_review),
  );

  const handleSubmitRestaurant = async (payload) => {
    setSubmittingRest(true);
    setRestError('');
    try {
      await reviewService.submitRestaurantReview(orderId, payload);
      await loadStatus();
    } catch (err) {
      setRestError(err?.message || 'Unable to submit restaurant review.');
    } finally {
      setSubmittingRest(false);
    }
  };

  const handleSubmitRider = async (payload) => {
    setSubmittingRider(true);
    setRiderError('');
    try {
      await reviewService.submitRiderReview(orderId, payload);
      await loadStatus();
    } catch (err) {
      setRiderError(err?.message || 'Unable to submit rider review.');
    } finally {
      setSubmittingRider(false);
    }
  };

  return (
    <section className="salo-order-review-section" aria-label="Rate your order experience">
      <div className="salo-order-review-section__header">
        <div>
          <h3 className="salo-order-review-section__heading">Rate Your Experience</h3>
          <p className="salo-order-review-section__desc">
            Restaurant and rider reviews are independent — submit either or both.
          </p>
        </div>
      </div>

      {loading && !statusData ? (
        <p className="salo-order-review-card__muted">Checking review eligibility…</p>
      ) : loadError ? (
        <p className="salo-order-review-card__error" role="alert">{loadError}</p>
      ) : (
        <div className="salo-order-review-section__grid">
          {canShowRestaurant && (
            <SingleTargetReviewCard
              eyebrow="Restaurant Review"
              title={statusData?.restaurant_name || restaurantName}
              subtitle="How was the food quality, packaging, and order accuracy?"
              submittedReview={statusData?.restaurant_review || null}
              submitting={submittingRest}
              submitError={restError}
              onSubmit={handleSubmitRestaurant}
            />
          )}

          {canShowRider && (
            <SingleTargetReviewCard
              eyebrow="Rider Review"
              title={
                statusData?.rider?.first_name
                  ? `Rider: ${statusData.rider.first_name}`
                  : riderName
                    ? `Rider: ${riderName}`
                    : 'Your Delivery Rider'
              }
              subtitle="How was the delivery speed, communication, and handoff?"
              submittedReview={statusData?.rider_review || null}
              submitting={submittingRider}
              submitError={riderError}
              onSubmit={handleSubmitRider}
            />
          )}
        </div>
      )}
    </section>
  );
}

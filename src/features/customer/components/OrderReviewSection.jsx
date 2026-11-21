import { useState } from 'react';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { StarRating } from '../../../components/reviews';
import './OrderReviewSection.css';

function SingleTargetReviewCard({
  eyebrow,
  title,
  subtitle,
  submittedReview,
  onSubmit,
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setError('Please select a star rating from 1 to 5.');
      return;
    }
    setError('');
    onSubmit({
      rating,
      comment: comment.trim() || null,
      created_at: new Date().toISOString(),
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
            if (error) setError('');
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
      />

      {error && (
        <p className="salo-order-review-card__error" role="alert">
          {error}
        </p>
      )}

      <div className="salo-order-review-card__footer">
        <span className="salo-order-review-card__hint">
          Preview mode — saved locally in UI state
        </span>
        <Button type="submit" variant="primary" size="sm">
          Submit Review
        </Button>
      </div>
    </form>
  );
}

export default function OrderReviewSection({
  restaurantName = 'Restaurant',
  riderName = null,
  isDelivery = false,
  isEligible = false,
}) {
  const [restaurantReview, setRestaurantReview] = useState(null);
  const [riderReview, setRiderReview] = useState(null);

  if (!isEligible) {
    return null;
  }

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

      <div className="salo-order-review-section__grid">
        <SingleTargetReviewCard
          eyebrow="Restaurant Review"
          title={restaurantName}
          subtitle="How was the food quality, packaging, and order accuracy?"
          submittedReview={restaurantReview}
          onSubmit={setRestaurantReview}
        />

        {isDelivery && (
          <SingleTargetReviewCard
            eyebrow="Rider Review"
            title={riderName ? `Rider: ${riderName}` : 'Your Delivery Rider'}
            subtitle="How was the delivery speed, communication, and handoff?"
            submittedReview={riderReview}
            onSubmit={setRiderReview}
          />
        )}
      </div>
    </section>
  );
}

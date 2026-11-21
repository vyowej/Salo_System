import Button from '../common/Button';
import Badge from '../common/Badge';
import { formatFeaturePeriod } from '../../utils/reviewDisplayUtils';
import './FeaturedRestaurantBanner.css';

export default function FeaturedRestaurantBanner({
  featured,
  onViewRestaurant,
  onReserveTable,
}) {
  if (!featured) return null;

  const periodLabel = formatFeaturePeriod(featured.feature_start_date, featured.feature_end_date);

  return (
    <section className="salo-featured-banner" aria-label="Featured Restaurant of the Week">
      <div className="salo-featured-banner__media">
        <img
          src={featured.cover_photo || '/images/landing/hero-food.png'}
          alt={`${featured.restaurant_name} — Featured Restaurant of the Week`}
          className="salo-featured-banner__img"
        />
        <span className="salo-featured-banner__ribbon">★ Featured Restaurant of the Week</span>
      </div>

      <div className="salo-featured-banner__body">
        <div className="salo-featured-banner__top">
          <Badge variant="warning" size="sm">
            Week of {periodLabel}
          </Badge>
          <span className="salo-featured-banner__rating-pill">
            ★ {Number(featured.raw_average_rating || 0).toFixed(1)} · {featured.evaluation_review_count} verified reviews
          </span>
        </div>

        <div className="salo-featured-banner__title-row">
          <h2 className="salo-featured-banner__title">{featured.restaurant_name}</h2>
          {featured.cuisine && (
            <span className="salo-featured-banner__cuisine">{featured.cuisine}</span>
          )}
        </div>

        <p className="salo-featured-banner__meta">
          {featured.address ? `📍 ${featured.address} · ` : ''}
          Top-ranked kitchen this week based on verified 30-day customer ratings.
        </p>

        <div className="salo-featured-banner__actions">
          <Button
            variant="primary"
            size="sm"
            onClick={() => onViewRestaurant?.(featured)}
          >
            Explore Menu & Reviews
          </Button>
          {onReserveTable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onReserveTable(featured)}
            >
              Book a Table
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

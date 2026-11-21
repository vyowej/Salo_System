import StarRating from './StarRating';
import './RatingSummaryCard.css';

const DATE_RANGE_OPTIONS = [
  { key: 'all', label: 'All Time', days: null },
  { key: '30d', label: 'Last 30 Days', days: 30 },
  { key: '7d', label: 'Last 7 Days', days: 7 },
];

export default function RatingSummaryCard({
  title = 'Ratings & Reviews',
  subtitle = 'Based on eligible verified customer reviews',
  averageRating = null,
  totalCount = 0,
  distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  dateRangeKey = 'all',
  onDateRangeChange,
  headerExtra = null,
}) {
  return (
    <section className="salo-rating-summary" aria-label={title}>
      <div className="salo-rating-summary__head">
        <div>
          <h3 className="salo-rating-summary__title">{title}</h3>
          {subtitle && <p className="salo-rating-summary__subtitle">{subtitle}</p>}
        </div>
        <div className="salo-rating-summary__head-right">
          {headerExtra}
          {onDateRangeChange && (
            <div className="salo-rating-summary__ranges" role="group" aria-label="Filter ratings by date range">
              {DATE_RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`salo-rating-summary__range-btn${dateRangeKey === opt.key ? ' is-active' : ''}`}
                  onClick={() => onDateRangeChange(opt.key, opt.days)}
                  aria-pressed={dateRangeKey === opt.key}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="salo-rating-summary__body">
        <div className="salo-rating-summary__score-box">
          <div className="salo-rating-summary__big-score">
            {averageRating !== null ? averageRating.toFixed(1) : '—'}
          </div>
          <StarRating value={averageRating || 0} readOnly size="md" />
          <span className="salo-rating-summary__count">
            {totalCount} {totalCount === 1 ? 'eligible review' : 'eligible reviews'}
          </span>
        </div>

        <div className="salo-rating-summary__bars" aria-label="1 to 5 star rating distribution">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = Number(distribution?.[star] || 0);
            const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
            return (
              <div key={star} className="salo-rating-summary__bar-row">
                <span className="salo-rating-summary__star-label">{star} ★</span>
                <div className="salo-rating-summary__track" aria-hidden="true">
                  <div className="salo-rating-summary__fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="salo-rating-summary__bar-count">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

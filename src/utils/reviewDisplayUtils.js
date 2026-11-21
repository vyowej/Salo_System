/**
 * Pure UI display helpers for Reviews, Ratings & Featured Restaurant mock data.
 * Authoritative rating & Bayesian calculations will run on the Backend in Phase 3.
 */

export function computeMockRatingSummary(reviews = [], dateRangeDays = null) {
  const now = Date.now();
  const filteredByDate = reviews.filter((review) => {
    if (!dateRangeDays) return true;
    const createdMs = new Date(review.created_at).getTime();
    if (Number.isNaN(createdMs)) return true;
    return now - createdMs <= dateRangeDays * 24 * 60 * 60 * 1000;
  });

  const eligible = filteredByDate.filter(
    (review) => Boolean(review.counts_toward_rating) && Boolean(review.is_visible),
  );

  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let sum = 0;

  for (const review of eligible) {
    const stars = Math.min(5, Math.max(1, Math.round(Number(review.rating) || 0)));
    distribution[stars] = (distribution[stars] || 0) + 1;
    sum += stars;
  }

  const totalCount = eligible.length;
  const averageRating = totalCount > 0 ? Number((sum / totalCount).toFixed(2)) : null;

  return {
    averageRating,
    totalCount,
    distribution,
    eligibleReviews: eligible,
    allMatchingDateReviews: filteredByDate,
  };
}

export function getModerationBadgeVariant(status) {
  switch (String(status || '').toLowerCase()) {
    case 'published':
      return 'success';
    case 'flagged':
      return 'warning';
    case 'hidden':
      return 'default';
    case 'removed':
      return 'error';
    default:
      return 'default';
  }
}

export function formatModerationStatusLabel(status) {
  switch (String(status || '').toLowerCase()) {
    case 'published':
      return 'Published';
    case 'flagged':
      return 'Flagged';
    case 'hidden':
      return 'Hidden';
    case 'removed':
      return 'Removed';
    default:
      return 'Unknown';
  }
}

export function formatFeaturePeriod(startDate, endDate) {
  if (!startDate || !endDate) return 'Current Week';
  const opts = { month: 'short', day: 'numeric' };
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startDate} – ${endDate}`;
  }
  return `${start.toLocaleDateString('en-PH', opts)} – ${end.toLocaleDateString('en-PH', {
    ...opts,
    year: 'numeric',
  })}`;
}

export function formatReviewDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return String(isoString);
  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

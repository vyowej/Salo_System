import { useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import Countdown from '../components/Countdown';
import PaymentBadge from '../components/PaymentBadge';
import ScenarioLink from '../components/ScenarioLink';
import { deliveryStatuses } from '../constants/statusConfig';
import { getRiderMock } from '../mocks';
import useScenario from '../hooks/useScenario';
import './RiderDeliveriesPage.css';

function parseDistance(dist) {
  if (typeof dist === 'number') return dist;
  const match = String(dist || '').match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 9999;
}

function parseCompensation(comp) {
  if (typeof comp === 'number') return comp;
  const cleaned = String(comp || '').replace(/[^\d.]/g, '');
  return cleaned ? parseFloat(cleaned) : 0;
}

function parseEta(eta) {
  if (typeof eta === 'number') return eta;
  const match = String(eta || '').match(/\d+/);
  return match ? parseInt(match[0], 10) : 9999;
}

function getRemainingSeconds(offer, sessionStartTime) {
  if (offer.expired) return 0;
  if (offer.countdown && offer.countdown !== '00:00:00') {
    const parts = offer.countdown.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  if (offer.expiresAt) {
    const diff = (new Date(offer.expiresAt).getTime() - sessionStartTime) / 1000;
    return Math.max(0, diff);
  }
  return 9999;
}

function getEffectiveExpiresAt(offer, sessionStartTime) {
  if (offer.expired) return null;
  if (offer.countdown && offer.countdown !== '00:00:00') {
    const parts = offer.countdown.split(':').map(Number);
    let ms = 0;
    if (parts.length === 3) ms = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    else if (parts.length === 2) ms = (parts[0] * 60 + parts[1]) * 1000;
    return new Date(sessionStartTime + ms).toISOString();
  }
  return offer.expiresAt;
}

export default function RiderDeliveriesPage() {
  const scenario = useScenario();
  const [sessionStartTime] = useState(() => Date.now());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  const rawOffers = useMemo(() => {
    const result = getRiderMock('offers', scenario);
    return Array.isArray(result) ? result : Array.isArray(result?.list) ? result.list : [];
  }, [scenario]);

  const viewState = scenario === 'default' || scenario === 'active' ? 'ready' : scenario;

  // Filter offers by search query (restaurant name, pickup location, delivery address)
  const filteredOffers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rawOffers;
    return rawOffers.filter((offer) => {
      const restaurant = String(offer.restaurant || '').toLowerCase();
      const pickup = String(offer.pickup || '').toLowerCase();
      const delivery = String(offer.deliveryArea || '').toLowerCase();
      return restaurant.includes(q) || pickup.includes(q) || delivery.includes(q);
    });
  }, [rawOffers, searchQuery]);

  // Sort offers by selected criteria
  const sortedOffers = useMemo(() => {
    const list = [...filteredOffers];
    switch (sortBy) {
      case 'nearest':
        return list.sort((a, b) => parseDistance(a.distance) - parseDistance(b.distance));
      case 'highest_pay':
        return list.sort((a, b) => parseCompensation(b.compensation) - parseCompensation(a.compensation));
      case 'lowest_pay':
        return list.sort((a, b) => parseCompensation(a.compensation) - parseCompensation(b.compensation));
      case 'shortest_eta':
        return list.sort((a, b) => parseEta(a.eta) - parseEta(b.eta));
      case 'expiring_soon':
        return list.sort((a, b) => {
          if (a.expired !== b.expired) return a.expired ? 1 : -1;
          return getRemainingSeconds(a, sessionStartTime) - getRemainingSeconds(b, sessionStartTime);
        });
      case 'newest':
      default:
        return list;
    }
  }, [filteredOffers, sortBy, sessionStartTime]);

  const totalCount = rawOffers.length;
  const activeCount = rawOffers.filter((o) => !o.expired).length;
  const expiredCount = rawOffers.filter((o) => o.expired).length;

  return (
    <div className="rider-page-shell">
      <PageHeader
        title="Delivery offers"
        subtitle="Review nearby orders and accept the right jobs."
        eyebrow="Dispatch"
      />

      <StateView
        state={viewState}
        emptyTitle="No offers right now"
        emptyMessage="There are no delivery offers available in this preview."
        onRetry={() => window.location.reload()}
      >
        {totalCount === 0 ? (
          <div className="rider-empty-state-block">
            <span className="rider-empty-icon" aria-hidden="true">🛵</span>
            <strong>No offers right now</strong>
          </div>
        ) : (
          <div className="rider-deliveries-container">
            {/* Search and Sorting Toolbar */}
            <div className="rider-toolbar-card">
              <div className="rider-toolbar-controls">
                <div className="rider-search-box">
                  <span className="rider-search-icon" aria-hidden="true">🔍</span>
                  <input
                    type="search"
                    className="rider-search-input"
                    placeholder="Search restaurant, pickup, or delivery address..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search delivery offers"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="rider-search-clear-btn"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="rider-sort-box">
                  <label htmlFor="rider-sort-select" className="rider-sort-label">Sort by:</label>
                  <select
                    id="rider-sort-select"
                    className="rider-sort-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="newest">Newest offers</option>
                    <option value="nearest">Nearest distance</option>
                    <option value="highest_pay">Highest compensation</option>
                    <option value="lowest_pay">Lowest compensation</option>
                    <option value="shortest_eta">Shortest travel time</option>
                    <option value="expiring_soon">Expiring soon</option>
                  </select>
                </div>
              </div>

              <div className="rider-toolbar-meta">
                <div className="rider-count-tags">
                  <span className="rider-count-tag">
                    <strong>{totalCount}</strong> total
                  </span>
                  <span className="rider-count-tag is-active">
                    <strong>{activeCount}</strong> active
                  </span>
                  {expiredCount > 0 && (
                    <span className="rider-count-tag is-expired">
                      <strong>{expiredCount}</strong> expired
                    </span>
                  )}
                </div>

                {searchQuery && (
                  <span className="rider-search-matching-text">
                    Showing {sortedOffers.length} of {totalCount} offers
                  </span>
                )}
              </div>
            </div>

            {/* Offer Cards Grid */}
            {sortedOffers.length === 0 ? (
              <div className="rider-empty-search-state">
                <span className="rider-empty-search-icon" aria-hidden="true">🔎</span>
                <h3>No matching delivery offers</h3>
                <p>Try searching with another keyword or reset the filter.</p>
                <Button variant="secondary" size="sm" onClick={() => setSearchQuery('')}>
                  Clear search
                </Button>
              </div>
            ) : (
              <div className="rider-offer-grid">
                {sortedOffers.map((offer) => {
                  const effectiveExpiresAt = getEffectiveExpiresAt(offer, sessionStartTime);
                  return (
                    <Card key={offer.id} className="rider-offer-card">
                      <CardBody>
                        <div className="rider-offer-topline">
                          <div>
                            <p className="rider-caption">Restaurant</p>
                            <h3>{offer.restaurant}</h3>
                          </div>
                          <StatusBadge status={offer.expired ? 'failed' : 'offered'} config={deliveryStatuses} />
                        </div>

                        <div className="rider-offer-meta-grid">
                          <div>
                            <span>Pickup</span>
                            <strong>{offer.pickup}</strong>
                          </div>
                          <div>
                            <span>Delivery area</span>
                            <strong>{offer.deliveryArea}</strong>
                          </div>
                          <div>
                            <span>Distance</span>
                            <strong>{offer.distance}</strong>
                          </div>
                          <div>
                            <span>ETA</span>
                            <strong>{offer.eta}</strong>
                          </div>
                        </div>

                        <div className="rider-offer-summary-row">
                          <div className="rider-offer-compensation">
                            <span>Compensation</span>
                            <strong>{offer.compensation}</strong>
                          </div>
                          <PaymentBadge status={offer.paymentStatus === 'Paid' ? 'paid' : 'payment_pending'} />
                        </div>

                        <div className="rider-offer-summary-row rider-offer-cod">
                          <span>COD amount</span>
                          <strong className={!offer.cod ? 'rider-offer-cod-none' : ''}>
                            {offer.cod || 'None'}
                          </strong>
                        </div>

                        <details className="rider-offer-details">
                          <summary>Delivery instructions</summary>
                          <p>{offer.instructions}</p>
                        </details>

                        <div className="rider-offer-footer">
                          <div className={`rider-offer-timer${offer.expired ? ' is-expired' : ''}`}>
                            <span>{offer.expired ? 'Offer status' : 'Expires in'}</span>
                            <Countdown expiresAt={effectiveExpiresAt || offer.expiresAt} />
                          </div>
                          <div className="rider-offer-actions">
                            {offer.expired ? (
                              <Button variant="secondary" size="sm" disabled>
                                Accept
                              </Button>
                            ) : (
                              <Button
                                as={ScenarioLink}
                                to="/rider/deliveries/active?scenario=active"
                                variant="primary"
                                size="sm"
                              >
                                Accept
                              </Button>
                            )}
                            <Button
                              as={ScenarioLink}
                              to={`/rider/map?deliveryId=${encodeURIComponent(offer.id)}`}
                              variant="secondary"
                              size="sm"
                            >
                              View map
                            </Button>
                            <Button variant="secondary" size="sm" disabled={offer.expired}>
                              Decline
                            </Button>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </StateView>
    </div>
  );
}

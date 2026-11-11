import { useMemo } from 'react';
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

export default function RiderDeliveriesPage() {
  const scenario = useScenario();
  const offers = useMemo(() => {
    const result = getRiderMock('offers', scenario);
    return Array.isArray(result) ? result : Array.isArray(result?.list) ? result.list : [];
  }, [scenario]);

  const viewState = scenario === 'default' || scenario === 'active' ? 'ready' : scenario;

  return (
    <div className="rider-page-shell">
      <PageHeader title="Delivery offers" subtitle="Review nearby orders and accept the right jobs." eyebrow="Dispatch" />
      <StateView
        state={viewState}
        emptyTitle="No offers right now"
        emptyMessage="There are no delivery offers available in this preview."
        onRetry={() => window.location.reload()}
      >
        {offers.length === 0 ? (
          <div className="rider-empty-state-block">
            <span aria-hidden="true">⌁</span>
            <strong>No offers right now</strong>
          </div>
        ) : (
          <div className="rider-offer-grid">
            {offers.map((offer) => (
              <Card key={offer.id} className="rider-offer-card card--tint-orange card--status">
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
                    <div>
                      <span>Compensation</span>
                      <strong>{offer.compensation}</strong>
                    </div>
                    <PaymentBadge status={offer.paymentStatus === 'Paid' ? 'paid' : 'payment_pending'} />
                  </div>

                  {offer.cod && (
                    <div className="rider-offer-summary-row rider-offer-cod">
                      <span>COD amount</span>
                      <strong>{offer.cod}</strong>
                    </div>
                  )}

                  <details className="rider-offer-details">
                    <summary>Delivery instructions</summary>
                    <p>{offer.instructions}</p>
                  </details>

                  <div className="rider-offer-footer">
                    <Countdown expiresAt={offer.expiresAt} />
                    <div className="rider-offer-actions">
                      {offer.expired ? (
                        <Button variant="ghost" size="sm" disabled>Offer expired</Button>
                      ) : (
                        <Button as={ScenarioLink} to="/rider/deliveries/active?scenario=active" variant="outline" size="sm">
                          Accept
                        </Button>
                      )}
                      <Button as={ScenarioLink} to={`/rider/map?deliveryId=${encodeURIComponent(offer.id)}`} variant="outline" size="sm">
                        View map
                      </Button>
                      <Button variant="outline" size="sm" disabled={offer.expired}>
                        Decline
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </StateView>
    </div>
  );
}

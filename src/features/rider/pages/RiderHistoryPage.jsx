import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardBody } from '../../../components/common/Card';
import Button from '../../../components/common/Button';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import FilterBar from '../components/FilterBar';
import StatusBadge from '../components/StatusBadge';
import PaymentBadge from '../components/PaymentBadge';
import Timeline from '../components/Timeline';
import ScenarioLink from '../components/ScenarioLink';
import { getHistoryFilterFields, initialHistoryFilters, updateHistoryFilter } from '../constants/filterOptions';
import { historyTableLabels } from '../constants/riderSettings';
import { codStatuses, deliveryStatuses } from '../constants/statusConfig';
import { getRiderMock } from '../mocks';
import useScenario from '../hooks/useScenario';
import { formatDateTime } from '../utils/format';
import './RiderHistoryPage.css';

function deliveryCardClass(status) {
  if (status === 'delivered') return 'card--tint-green card--status';
  if (['failed', 'cancelled'].includes(status)) return 'card--danger card--status';
  return 'card--tint-orange card--status';
}

export default function RiderHistoryPage() {
  const { id } = useParams();
  const scenario = useScenario();
  const records = getRiderMock('history', scenario);
  const [filters, setFilters] = useState(initialHistoryFilters);
  const [search, setSearch] = useState('');
  const viewState = scenario === 'active' ? 'ready' : scenario;

  const selected = id ? records.find((item) => item.id === id || item.reference === id) : null;
  const filterFields = useMemo(() => getHistoryFilterFields(records.map((record) => record.restaurant)), [records]);
  const filtered = useMemo(() => records.filter((item) => {
    const query = search.trim().toLowerCase();
    const matchesQuery = !query || [item.reference, item.restaurant, item.area].some((value) => value.toLowerCase().includes(query));
    const matchesStatus = filters.status === 'All statuses' || item.status === filters.status.toLowerCase().replaceAll(' ', '_');
    const matchesRestaurant = filters.restaurant === 'All restaurants' || item.restaurant === filters.restaurant;
    const matchesPayment = filters.paymentType === 'All payment types'
      || (filters.paymentType === 'Cash on Delivery' && item.paymentType === 'cod')
      || (filters.paymentType === 'Online paid' && item.paymentType === 'paid_online')
      || (filters.paymentType === 'Payment pending' && item.paymentStatus === 'payment_pending');
    const matchesCod = filters.codStatus === 'All COD statuses' || item.codStatus === filters.codStatus.toLowerCase().replaceAll(' ', '_');
    return matchesQuery && matchesStatus && matchesRestaurant && matchesPayment && matchesCod;
  }), [filters, records, search]);

  function updateFilter(key, value) {
    setFilters((current) => updateHistoryFilter(current, key, value));
  }

  return (
    <div className="rider-page-shell">
      <PageHeader
        title={selected ? `Delivery ${selected.reference}` : 'Delivery history'}
        subtitle={selected ? 'Review the delivery timeline and recorded handoff details.' : 'Search completed and attempted deliveries.'}
        eyebrow="Your delivery records"
        actions={selected && <Button as={ScenarioLink} to="/rider/history" variant="outline" size="sm">Back to history</Button>}
      />
      <StateView state={viewState} emptyTitle="No delivery history" emptyMessage="No delivery records match this preview." onRetry={() => window.location.reload()}>
        {selected ? (
          <div className="rider-history-detail-grid">
            <Card className={deliveryCardClass(selected.status)}>
              <CardBody>
                <div className="rider-history-detail-head">
                  <div>
                    <span>Order reference</span>
                    <strong>{selected.reference}</strong>
                  </div>
                  <StatusBadge status={selected.status} config={deliveryStatuses} />
                </div>
                <Timeline items={selected.timeline} />
                <div className="rider-history-detail-addresses">
                  <div><span>Pickup</span><strong>{selected.pickup}</strong></div>
                  <div><span>Drop-off</span><strong>{selected.dropoff}</strong></div>
                </div>
              </CardBody>
            </Card>
            <div className="rider-history-detail-stack">
              <Card>
                <CardBody>
                  <h2>Payment & earnings</h2>
                  <PaymentBadge status={selected.paymentStatus} />
                  <div className="rider-history-payment-row"><span>COD status</span><StatusBadge status={selected.codStatus} config={codStatuses} /></div>
                  <div className="rider-history-payment-row"><span>Rider earnings</span><strong>{selected.earnings}</strong></div>
                  {selected.failureReason && <div className="rider-history-failure"><strong>Failure reason</strong><p>{selected.failureReason}</p></div>}
                </CardBody>
              </Card>
              <Card>
                <CardBody>
                  <h2>Proof of delivery</h2>
                  <div className="rider-proof-placeholder" aria-label="Proof image placeholder">Photo preview</div>
                  <strong>{selected.proof.method}</strong>
                  <p>{selected.proof.metadata}</p>
                  {selected.proof.capturedAt && <small>Recorded {formatDateTime(selected.proof.capturedAt)}</small>}
                </CardBody>
              </Card>
            </div>
          </div>
        ) : (
          <>
            <Card className="rider-history-filters">
              <CardBody>
                <label className="rider-field" htmlFor="rider-history-search">
                  <span>Search deliveries</span>
                  <input id="rider-history-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order, restaurant, or area" />
                </label>
                <FilterBar filters={filterFields} values={filters} onChange={updateFilter} />
              </CardBody>
            </Card>
            {filtered.length === 0 ? (
              <div className="rider-history-empty-state">No delivery records match your filters.</div>
            ) : (
              <Card>
                <CardBody>
                  <div className="rider-history-table-wrap">
                    <table className="rider-history-table">
                      <thead><tr>{historyTableLabels.map((label) => <th key={label}>{label}</th>)}</tr></thead>
                      <tbody>
                        {filtered.map((record) => (
                          <tr key={record.id}>
                            <td data-label={historyTableLabels[0]}><ScenarioLink to={`/rider/history/${record.id}`}>{record.reference}</ScenarioLink></td>
                            <td data-label={historyTableLabels[1]}>{formatDateTime(record.date)}</td>
                            <td data-label={historyTableLabels[2]}>{record.restaurant}</td>
                            <td data-label={historyTableLabels[3]}><StatusBadge status={record.status} config={deliveryStatuses} /></td>
                            <td data-label={historyTableLabels[4]}><PaymentBadge status={record.paymentStatus} /></td>
                            <td data-label={historyTableLabels[5]}>{record.earnings}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardBody>
              </Card>
            )}
          </>
        )}
      </StateView>
    </div>
  );
}

import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import PaymentBadge from '../components/PaymentBadge';
import CodSection from '../components/CodSection';
import { deliveryStatuses } from '../constants/statusConfig';
import { earningsTableLabels } from '../constants/riderSettings';
import { getRiderMock } from '../mocks';
import useScenario from '../hooks/useScenario';
import { formatDateTime, formatPeso } from '../utils/format';
import './RiderEarningsPage.css';

export default function RiderEarningsPage() {
  const scenario = useScenario();
  const earnings = getRiderMock('earnings', scenario);
  const viewState = scenario === 'active' ? 'ready' : scenario;
  const maxAmount = Math.max(1, ...earnings.chartSeries.map((item) => item.amount));

  return (
    <div className="rider-page-shell">
      <PageHeader title="Earnings & COD" subtitle="Review delivery earnings, payouts, and cash collected on behalf of SALO." eyebrow="Financial overview" />
      <StateView
        state={viewState}
        emptyTitle="No earnings data"
        emptyMessage="There are no earnings records in this preview."
        onRetry={() => window.location.reload()}
      >
        <div className="rider-earnings-summary-grid">
          {earnings.summaries.map((item) => (
            <StatCard key={item.key} label={item.label} value={item.amount} helper={item.detail} />
          ))}
        </div>

        <div className="rider-earnings-columns">
          <Card>
            <CardBody>
              <h2 className="rider-earnings-section-title">Earnings activity</h2>
              <div className="rider-earnings-chart" role="img" aria-label="Daily earnings chart with visible daily amounts">
                {earnings.chartSeries.map((item) => (
                  <div className="rider-earnings-chart-column" key={item.key}>
                    <strong>{formatPeso(item.amount)}</strong>
                    <span className="rider-earnings-bar-track">
                      <span className="rider-earnings-bar" style={{ height: `${Math.max(4, (item.amount / maxAmount) * 100)}%` }} />
                    </span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="rider-earnings-breakdown">
                {earnings.breakdown.map((item) => (
                  <div key={item.key}>
                    <span>{item.label}</span>
                    <strong>{item.amount}</strong>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 className="rider-earnings-section-title">Payout method</h2>
              <div className="rider-payout-method">
                <strong>{earnings.payoutMethod.provider}</strong>
                <span>{earnings.payoutMethod.accountName}</span>
                <span>{earnings.payoutMethod.maskedAccount}</span>
                <small>{earnings.payoutMethod.note}</small>
              </div>
              <h3 className="rider-earnings-subtitle">Payout history</h3>
              <div className="rider-payout-history">
                {earnings.payoutHistory.map((entry) => (
                  <div className="rider-payout-row" key={entry.reference}>
                    <div>
                      <strong>{entry.reference}</strong>
                      <span>{formatDateTime(entry.date)}</span>
                    </div>
                    <div>
                      <strong>{entry.amount}</strong>
                      <PaymentBadge status={entry.status} />
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        <Card className="rider-earnings-records">
          <CardBody>
            <h2 className="rider-earnings-section-title">Earnings records</h2>
            <div className="rider-earnings-table-wrap">
              <table className="rider-earnings-table">
                <thead><tr>{earningsTableLabels.map((label) => <th key={label}>{label}</th>)}</tr></thead>
                <tbody>
                  {earnings.records.map((record) => (
                    <tr key={record.reference}>
                      <td data-label={earningsTableLabels[0]}>{record.reference}</td>
                      <td data-label={earningsTableLabels[1]}>{formatDateTime(record.date)}</td>
                      <td data-label={earningsTableLabels[2]}>{formatPeso(record.amount)}</td>
                      <td data-label={earningsTableLabels[3]}><StatusBadge status={record.status} config={deliveryStatuses} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <CodSection />
      </StateView>
    </div>
  );
}

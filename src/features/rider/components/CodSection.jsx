import { useState } from 'react';
import { Card, CardBody } from '../../../components/common/Card';
import Button from '../../../components/common/Button';
import StatusBadge from './StatusBadge';
import { codStatuses } from '../constants/statusConfig';
import { getRiderMock } from '../mocks';
import useScenario from '../hooks/useScenario';
import { formatDateTime, formatPeso } from '../utils/format';
import './CodSection.css';

export default function CodSection() {
  const scenario = useScenario();
  const data = getRiderMock('cod', scenario);
  const status = data?.status || 'not_collected';
  const history = Array.isArray(data?.history) ? data.history : [];
  const [remittanceInput, setRemittanceInput] = useState('');
  const [submittedAmount, setSubmittedAmount] = useState('');
  const [confirmedCollected, setConfirmedCollected] = useState(false);

  function submitRemittance(event) {
    event.preventDefault();
    const amount = Number(remittanceInput);
    if (Number.isFinite(amount) && amount > 0) {
      setSubmittedAmount(formatPeso(amount));
      setRemittanceInput('');
    }
  }

  return (
    <section className="rider-cod-section">
      <Card className="rider-cod-card">
        <CardBody className="rider-cod-card-body">
          {/* Header */}
          <div className="rider-cod-header">
            <div>
              <span className="rider-cod-eyebrow">Cash on Delivery</span>
              <h2 className="rider-cod-title">COD Collection & Remittance</h2>
              <p className="rider-cod-subtitle">
                Cash collected on delivery is held on behalf of SALO and must be remitted to Admin. It is not rider earnings.
              </p>
            </div>
            <div className="rider-cod-header-status">
              <StatusBadge status={status} config={codStatuses} />
            </div>
          </div>

          {/* Balance & Collection Summary Grid */}
          <div className="rider-cod-metrics-grid">
            <div className="rider-cod-metric-card">
              <div className="rider-cod-metric-header">
                <span className="rider-cod-metric-label">Unremitted Balance</span>
                <span className="rider-cod-metric-tag rider-cod-metric-tag--neutral">Not Income</span>
              </div>
              <strong className="rider-cod-metric-value">{data?.balance || '—'}</strong>
              <small className="rider-cod-metric-hint">Cleared or fully remitted</small>
            </div>

            <div className="rider-cod-metric-card rider-cod-metric-card--highlight">
              <div className="rider-cod-metric-header">
                <span className="rider-cod-metric-label">Cash Collected from Orders</span>
                <span className="rider-cod-metric-tag rider-cod-metric-tag--warning">To Remit</span>
              </div>
              <strong className="rider-cod-metric-value">{data?.amountToCollect || '—'}</strong>
              <div className="rider-cod-metric-actions">
                <Button
                  type="button"
                  variant={confirmedCollected ? 'outline' : 'primary'}
                  size="sm"
                  onClick={() => setConfirmedCollected(true)}
                  disabled={confirmedCollected}
                >
                  {confirmedCollected ? '✓ Amount confirmed' : 'Confirm exact amount collected'}
                </Button>
              </div>
            </div>
          </div>

          {/* Pending Admin Confirmation Banner */}
          {data?.remittance && (
            <div className="rider-cod-pending-banner">
              <div className="rider-cod-pending-icon" aria-hidden="true">⏳</div>
              <div className="rider-cod-pending-info">
                <strong>{data.remittance.label || 'Pending Admin Confirmation'}</strong>
                <span>
                  Amount: <strong>{data.remittance.amount || '—'}</strong>
                  {history[0]?.submitted && ` · Submitted on ${formatDateTime(history[0].submitted)}`}
                </span>
                <small>Remittance is currently under review by Admin. Receipt will be confirmed upon verification.</small>
              </div>
              <div className="rider-cod-pending-badge">
                <StatusBadge status="pending_remittance" config={codStatuses} />
              </div>
            </div>
          )}

          {/* Remittance Submission Form */}
          <div className="rider-cod-form-container">
            <h3 className="rider-cod-form-title">Submit Cash Remittance</h3>
            <p className="rider-cod-form-subtitle">
              Enter the exact amount of cash turned over or deposited for admin confirmation.
            </p>
            <form className="rider-remittance-form" onSubmit={submitRemittance}>
              <div className="rider-remittance-input-wrap">
                <span className="rider-remittance-currency-symbol">₱</span>
                <input
                  id="rider-remittance-amount"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={remittanceInput}
                  onChange={(event) => setRemittanceInput(event.target.value)}
                  aria-label="Remittance amount in Philippine Pesos"
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={!Number.isFinite(Number(remittanceInput)) || Number(remittanceInput) <= 0}
              >
                Submit Remittance
              </Button>
            </form>
          </div>

          {/* Remittance Records Table */}
          <div className="rider-cod-history-section">
            <h3 className="rider-cod-history-title">Remittance History</h3>
            <div className="rider-cod-table-wrap">
              <table className="rider-cod-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Amount</th>
                    <th>Date Submitted</th>
                    <th className="rider-cod-col-status">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {submittedAmount && (
                    <tr className="rider-cod-row-new">
                      <td><span className="rider-cod-ref">NEW</span></td>
                      <td><strong>{submittedAmount}</strong></td>
                      <td>Just now</td>
                      <td className="rider-cod-col-status">
                        <StatusBadge status="pending_remittance" config={codStatuses} />
                      </td>
                    </tr>
                  )}
                  {history.length === 0 && !submittedAmount ? (
                    <tr>
                      <td colSpan="4" className="rider-cod-table-empty">
                        No remittance records found.
                      </td>
                    </tr>
                  ) : (
                    history.map((entry, index) => (
                      <tr key={`${entry.reference || 'remittance'}-${index}`}>
                        <td>
                          <span className="rider-cod-ref">{entry.reference || `REM-${1000 + index}`}</span>
                        </td>
                        <td>
                          <strong>{entry.amount || '—'}</strong>
                        </td>
                        <td>{entry.submitted ? formatDateTime(entry.submitted) : '—'}</td>
                        <td className="rider-cod-col-status">
                          <StatusBadge
                            status={entry.status === 'remittance_confirmed' ? 'remittance_confirmed' : 'pending_remittance'}
                            config={codStatuses}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardBody>
      </Card>
    </section>
  );
}

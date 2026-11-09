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
      <Card>
        <CardBody>
          <div className="rider-cod-header">
            <div>
              <p className="rider-section-label">COD</p>
              <h3>Amount to collect</h3>
            </div>
            <StatusBadge status={status} config={codStatuses} />
          </div>

          <div className="rider-cod-grid">
            <div className="rider-cod-balance-card">
              <span>Balance</span>
              <strong>{data?.balance || '—'}</strong>
              <small>Not income</small>
            </div>
            <div className="rider-cod-balance-card">
              <span>Collected amount</span>
              <strong>{data?.amountToCollect || '—'}</strong>
              <small>Read-only preview</small>
            </div>
          </div>

          <div className="rider-cod-actions">
            <Button variant="primary" size="sm">Confirm exact amount collected</Button>
          </div>

          <div className="rider-remittance-panel">
            <div className="rider-remittance-row">
              <span>Pending Admin confirmation</span>
              <strong>{data?.remittance?.amount || '—'}</strong>
            </div>
            <div className="rider-remittance-row">
              <span>Submission</span>
              <strong>{history[0]?.submitted ? formatDateTime(history[0].submitted) : '—'}</strong>
            </div>
          </div>

          <form className="rider-remittance-form" onSubmit={submitRemittance}>
            <label className="rider-field" htmlFor="rider-remittance-amount">Remittance amount</label>
            <input
              id="rider-remittance-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={remittanceInput}
              onChange={(event) => setRemittanceInput(event.target.value)}
            />
            <Button type="submit" variant="outline" size="sm" disabled={!Number.isFinite(Number(remittanceInput)) || Number(remittanceInput) <= 0}>
              Submit remittance preview
            </Button>
          </form>

          <div className="rider-history-table">
            <div className="rider-history-header">
              <span>Amount</span>
              <span>Submitted</span>
              <span>Status</span>
            </div>
            {history.length === 0 ? (
              <div className="rider-history-empty">No remittance records in this preview.</div>
            ) : (
              history.map((entry, index) => (
                <div key={`${entry.reference || 'remittance'}-${index}`} className="rider-history-row">
                  <span>{entry.amount || '—'}</span>
                  <span>{entry.submitted ? formatDateTime(entry.submitted) : '—'}</span>
                  <StatusBadge
                    status={entry.status === 'remittance_confirmed' ? 'remittance_confirmed' : 'pending_remittance'}
                    config={codStatuses}
                  />
                </div>
              ))
            )}
            {submittedAmount && (
              <div className="rider-history-row rider-history-row--pending">
                <span>{submittedAmount}</span>
                <span>Just now</span>
                <span role="status">Pending Admin confirmation</span>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </section>
  );
}

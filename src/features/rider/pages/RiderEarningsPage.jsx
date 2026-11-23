import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';
import riderService from '../../../services/riderService';
import { formatDateTimeManila, formatPeso } from '../../../utils/format';

const REMITTANCE_LABELS = {
  not_applicable: 'Non-COD',
  pending: 'Pending Remittance',
  submitted: 'Submitted (Awaiting Verification)',
  confirmed: 'Confirmed',
  discrepancy: 'Discrepancy Flagged',
};

export default function RiderEarningsPage() {
  const [data, setData] = useState({ summary: {}, deliveries: [], pagination: {} });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadFinance = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await riderService.getFinanceSummary({ remittanceStatus: statusFilter });
      setData(res);
      setSelectedIds([]);
    } catch (err) {
      setError(err?.message || 'Unable to load rider earnings and COD remittance data.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadFinance();
  }, [loadFinance]);

  const remittableRows = useMemo(
    () => (data.deliveries || []).filter((d) => ['pending', 'discrepancy'].includes(d.cod_remittance_status)),
    [data.deliveries],
  );

  const selectedTotal = useMemo(
    () =>
      (data.deliveries || [])
        .filter((d) => selectedIds.includes(d.delivery_id))
        .reduce((sum, d) => sum + Number(d.cod_amount_collected || 0), 0),
    [data.deliveries, selectedIds],
  );

  const toggleSelect = (deliveryId) => {
    setSelectedIds((prev) =>
      prev.includes(deliveryId) ? prev.filter((id) => id !== deliveryId) : [...prev, deliveryId],
    );
  };

  const selectAllRemittable = () => {
    if (selectedIds.length === remittableRows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(remittableRows.map((d) => d.delivery_id));
    }
  };

  const handleSubmitRemittance = async () => {
    if (selectedIds.length === 0 || submitting) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const res = await riderService.submitCodRemittance(selectedIds, notes.trim());
      if (res?.finance) {
        setData(res.finance);
      } else {
        await loadFinance();
      }
      setSelectedIds([]);
      setNotes('');
      const count = res?.submission?.submitted_count ?? selectedIds.length;
      const amt = res?.submission?.submitted_amount ?? selectedTotal;
      setNotice(`Submitted ${count} COD delivery(ies) totaling ${formatPeso(amt)} for admin verification.`);
    } catch (err) {
      setError(err?.message || 'Unable to submit COD remittance.');
    } finally {
      setSubmitting(false);
    }
  };

  const summary = data.summary || {};

  return (
    <div className="rider-page-shell">
      <PageHeader
        title="Earnings & COD"
        subtitle="Delivery payouts and Cash-on-Delivery remittance."
        eyebrow="Finance"
      />

      {error && (
        <div role="alert" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--status-error-bg)', color: 'var(--status-error-text)' }}>
          {error}
        </div>
      )}
      {notice && (
        <div role="status" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--status-success-bg, #e8f5e9)', color: 'var(--status-success-text, #1b5e20)' }}>
          {notice}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <Card>
          <CardBody>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Total Delivery Earnings</div>
            <strong style={{ fontSize: 'var(--font-size-lg)' }}>{formatPeso(summary.total_delivery_earnings || 0)}</strong>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{summary.total_deliveries_completed || 0} completed deliveries</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>COD Pending Remittance</div>
            <strong style={{ fontSize: 'var(--font-size-lg)' }}>{formatPeso(summary.cod_pending_amount || 0)}</strong>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{summary.cod_pending_count || 0} order(s) cash-on-hand</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Submitted (Awaiting Verify)</div>
            <strong style={{ fontSize: 'var(--font-size-lg)' }}>{formatPeso(summary.cod_submitted_amount || 0)}</strong>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{summary.cod_submitted_count || 0} order(s)</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Confirmed Remitted</div>
            <strong style={{ fontSize: 'var(--font-size-lg)' }}>{formatPeso(summary.cod_confirmed_amount || 0)}</strong>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{summary.cod_confirmed_count || 0} order(s)</div>
          </CardBody>
        </Card>
      </div>

      {remittableRows.length > 0 && (
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>Submit COD Remittance</strong>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                  Select pending or discrepancy COD deliveries below to submit for admin verification.
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={selectAllRemittable}>
                {selectedIds.length === remittableRows.length ? 'Clear selection' : `Select all (${remittableRows.length})`}
              </Button>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                value={notes}
                disabled={submitting}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional remittance reference or deposit note"
                style={{ flex: '1 1 240px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={submitting || selectedIds.length === 0}
                loading={submitting}
                onClick={handleSubmitRemittance}
              >
                Submit Remittance ({formatPeso(selectedTotal)})
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 8 }}>
        <strong>Delivery &amp; COD Ledger</strong>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--font-size-xs)' }}>
          <span>Filter:</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}>
            <option value="all">All deliveries</option>
            <option value="pending">Pending Remittance</option>
            <option value="submitted">Submitted</option>
            <option value="confirmed">Confirmed</option>
            <option value="discrepancy">Discrepancy</option>
            <option value="not_applicable">Non-COD</option>
          </select>
        </label>
      </div>

      {loading ? (
        <GlobalStateView state="loading" title="Loading earnings & COD records..." />
      ) : (data.deliveries || []).length === 0 ? (
        <GlobalStateView
          state="empty"
          title="No completed deliveries yet"
          description="Completed deliveries, earnings, and COD remittance statuses will appear here."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {data.deliveries.map((row) => {
            const canSelect = ['pending', 'discrepancy'].includes(row.cod_remittance_status);
            const isChecked = selectedIds.includes(row.delivery_id);
            return (
              <Card key={row.delivery_id}>
                <CardBody style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {canSelect && (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={submitting}
                        onChange={() => toggleSelect(row.delivery_id)}
                        aria-label={`Select ${row.order_reference} for COD remittance`}
                      />
                    )}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                        {row.order_reference} · {row.restaurant_name}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                        Delivered: {row.delivered_at ? formatDateTimeManila(row.delivered_at) : '—'} ·{' '}
                        {REMITTANCE_LABELS[row.cod_remittance_status] || row.cod_remittance_status}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700 }}>
                      Earning: {formatPeso(row.rider_earning)}
                    </div>
                    {row.cod_amount_collected > 0 && (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                        COD Collected: {formatPeso(row.cod_amount_collected)}
                      </div>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

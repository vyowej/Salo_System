import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';
import riderService from '../../../services/riderService';
import { formatDateTimeManila } from '../../../utils/format';
import './RiderSupportPage.css';

const SUPPORT_CATEGORIES = [
  { value: 'delivery_issue', label: 'Delivery Issue' },
  { value: 'customer_issue', label: 'Customer Issue' },
  { value: 'restaurant_delay', label: 'Restaurant Delay' },
  { value: 'payment_cod', label: 'Payment / COD' },
  { value: 'app_technical', label: 'App / GPS Issue' },
  { value: 'safety_incident', label: 'Safety Incident' },
  { value: 'other', label: 'Other Concern' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In Review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

function getCategoryLabel(value) {
  return SUPPORT_CATEGORIES.find((c) => c.value === value)?.label || value;
}

function getStatusBadgeVariant(status) {
  if (status === 'resolved' || status === 'closed') return 'success';
  if (status === 'in_review') return 'warning';
  return 'default';
}

function formatStatusLabel(status) {
  if (status === 'in_review') return 'In Review';
  if (status === 'resolved') return 'Resolved';
  if (status === 'closed') return 'Closed';
  return 'Open';
}

export default function RiderSupportPage() {
  const { id: routeTicketId } = useParams();
  const navigate = useNavigate();

  const [tickets, setTickets] = useState([]);
  const [counts, setCounts] = useState({ total: 0, open: 0, in_review: 0, resolved: 0, closed: 0 });
  const [recentOrders, setRecentOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [category, setCategory] = useState('delivery_issue');
  const [priority, setPriority] = useState('normal');
  const [orderId, setOrderId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [closingId, setClosingId] = useState(null);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await riderService.getSupportTickets({ status: statusFilter, perPage: 30 });
      const list = data?.tickets || [];
      setTickets(list);
      setCounts(data?.counts || { total: 0, open: 0, in_review: 0, resolved: 0, closed: 0 });
      setRecentOrders(data?.recent_orders || []);

      if (routeTicketId) {
        const matched = list.find((t) => String(t.ticket_id) === String(routeTicketId));
        if (matched) {
          setSelectedTicket(matched);
        } else {
          try {
            const single = await riderService.getSupportTicket(routeTicketId);
            setSelectedTicket(single);
          } catch {
            setSelectedTicket(null);
          }
        }
      }
    } catch (err) {
      setError(err?.message || 'Unable to load rider support tickets.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, routeTicketId]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setFormError('');
    setFormSuccess('');

    const trimmedSubject = subject.trim();
    const trimmedDesc = description.trim();
    if (trimmedSubject.length < 4) {
      setFormError('Please enter a subject of at least 4 characters.');
      return;
    }
    if (trimmedDesc.length < 10) {
      setFormError('Please describe the issue in at least 10 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await riderService.createSupportTicket({
        category,
        priority,
        order_id: orderId ? Number(orderId) : null,
        subject: trimmedSubject,
        description: trimmedDesc,
      });
      setSubject('');
      setDescription('');
      setOrderId('');
      setPriority('normal');
      setFormSuccess(
        created?.ticket_reference
          ? `Support ticket ${created.ticket_reference} submitted.`
          : 'Support ticket submitted.'
      );
      if (created) {
        setSelectedTicket(created);
      }
      await loadTickets();
    } catch (err) {
      setFormError(err?.message || 'Unable to submit support ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseTicket = async (ticketId) => {
    if (closingId) return;
    setClosingId(ticketId);
    try {
      const updated = await riderService.closeSupportTicket(ticketId);
      if (updated && selectedTicket?.ticket_id === ticketId) {
        setSelectedTicket(updated);
      }
      await loadTickets();
    } catch (err) {
      setError(err?.message || 'Unable to close support ticket.');
    } finally {
      setClosingId(null);
    }
  };

  return (
    <div className="rider-page-shell">
      <PageHeader
        title="Support & incidents"
        subtitle="Report delivery issues, safety incidents, or contact rider support."
        eyebrow="Support"
        actions={
          <Button variant="secondary" onClick={loadTickets} disabled={loading}>
            Refresh
          </Button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 'var(--space-4)' }}>
        <Card><CardBody><div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Open Tickets</div><strong style={{ fontSize: '1.35rem' }}>{counts.open}</strong></CardBody></Card>
        <Card><CardBody><div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>In Review</div><strong style={{ fontSize: '1.35rem' }}>{counts.in_review}</strong></CardBody></Card>
        <Card><CardBody><div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Resolved</div><strong style={{ fontSize: '1.35rem' }}>{counts.resolved}</strong></CardBody></Card>
        <Card><CardBody><div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Total Submitted</div><strong style={{ fontSize: '1.35rem' }}>{counts.total}</strong></CardBody></Card>
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--status-error-bg)', color: 'var(--status-error-text)' }}>
          {error}
        </div>
      )}

      <div className="rider-support-grid">
        <Card>
          <CardBody>
            <h2>Report an issue or incident</h2>
            <div className="rider-support-category-grid" role="group" aria-label="Support category">
              {SUPPORT_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  className={`rider-support-category ${category === cat.value ? 'is-selected' : ''}`}
                  onClick={() => setCategory(cat.value)}
                  aria-pressed={category === cat.value}
                >
                  <span>{category === cat.value ? '●' : '○'}</span>
                  {cat.label}
                </button>
              ))}
            </div>

            {formSuccess && (
              <div className="rider-support-success" role="status">
                <strong>Ticket created</strong>
                <span>{formSuccess}</span>
              </div>
            )}

            {formError && (
              <p role="alert" style={{ color: 'var(--status-error-text)', marginTop: 'var(--space-3)', marginBottom: 0 }}>
                {formError}
              </p>
            )}

            <form className="rider-support-form" onSubmit={handleSubmit} noValidate>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <label>
                  <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Priority</span>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Ticket priority">
                    {PRIORITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Related Delivery (optional)</span>
                  <select value={orderId} onChange={(e) => setOrderId(e.target.value)} aria-label="Related delivery">
                    <option value="">None / General concern</option>
                    {recentOrders.map((ord) => (
                      <option key={ord.order_id} value={ord.order_id}>
                        {ord.order_reference} — {ord.restaurant_name} ({ord.delivery_status})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Subject</span>
                <input
                  type="text"
                  maxLength={150}
                  placeholder="Brief summary of the issue"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: 44,
                    padding: 'var(--space-3)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-primary)',
                    color: 'var(--text-primary)',
                    font: 'inherit',
                  }}
                />
              </label>

              <label>
                <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Details</span>
                <textarea
                  rows={4}
                  maxLength={2000}
                  placeholder="Describe what happened, including time, location, or order details..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>

              <div>
                <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit support ticket'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
              <h2 style={{ margin: 0 }}>Ticket history</h2>
              <select
                aria-label="Filter support tickets by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}
              >
                {STATUS_FILTERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <GlobalStateView state="loading" title="Loading support tickets..." />
            ) : tickets.length === 0 ? (
              <GlobalStateView
                state="empty"
                title="No support tickets yet"
                description="Submitted incident reports and support tickets will appear here."
              />
            ) : (
              <div className="rider-ticket-list" style={{ gap: 'var(--space-2)' }}>
                {tickets.map((ticket) => (
                  <button
                    key={ticket.ticket_id}
                    type="button"
                    className={`rider-ticket-list-item rider-ticket-list-item--${ticket.status}`}
                    onClick={() => {
                      setSelectedTicket(ticket);
                      navigate(`/rider/support/${ticket.ticket_id}`, { replace: true });
                    }}
                    style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <div>
                      <strong>{ticket.subject}</strong>
                      <span>
                        {ticket.ticket_reference} · {getCategoryLabel(ticket.category)}
                        {ticket.order_reference ? ` · ${ticket.order_reference}` : ''}
                      </span>
                      <span>{formatDateTimeManila(ticket.created_at)}</span>
                    </div>
                    <Badge variant={getStatusBadgeVariant(ticket.status)} size="sm">
                      {formatStatusLabel(ticket.status)}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {selectedTicket && (
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <CardBody>
            <div className="rider-ticket-detail-header">
              <div>
                <h2>{selectedTicket.subject}</h2>
                <span>
                  {selectedTicket.ticket_reference} · {getCategoryLabel(selectedTicket.category)} · Priority: {selectedTicket.priority}
                  {selectedTicket.order_reference ? ` · Order ${selectedTicket.order_reference}` : ''}
                  {selectedTicket.created_at ? ` · Submitted ${formatDateTimeManila(selectedTicket.created_at)}` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge variant={getStatusBadgeVariant(selectedTicket.status)}>
                  {formatStatusLabel(selectedTicket.status)}
                </Badge>
                {(selectedTicket.status === 'open' || selectedTicket.status === 'in_review') && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={closingId === selectedTicket.ticket_id}
                    disabled={closingId === selectedTicket.ticket_id}
                    onClick={() => handleCloseTicket(selectedTicket.ticket_id)}
                  >
                    Close ticket
                  </Button>
                )}
              </div>
            </div>

            <div className="rider-ticket-thread">
              <div className="rider-ticket-message from-rider">
                <small>You · {formatDateTimeManila(selectedTicket.created_at)}</small>
                <p>{selectedTicket.description}</p>
              </div>

              {selectedTicket.admin_response && (
                <div className="rider-ticket-message from-support">
                  <small>
                    SALO Support
                    {selectedTicket.resolved_at ? ` · ${formatDateTimeManila(selectedTicket.resolved_at)}` : ''}
                  </small>
                  <p>{selectedTicket.admin_response}</p>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

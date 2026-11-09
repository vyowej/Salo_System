import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardBody } from '../../../components/common/Card';
import Button from '../../../components/common/Button';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import FileUploadField from '../components/FileUploadField';
import ScenarioLink from '../components/ScenarioLink';
import { supportCategories } from '../constants/supportCategories';
import { ticketStatuses } from '../constants/statusConfig';
import { getRiderMock } from '../mocks';
import useScenario from '../hooks/useScenario';
import { formatDateTime } from '../utils/format';
import './RiderSupportPage.css';

export default function RiderSupportPage() {
  const { id } = useParams();
  const scenario = useScenario();
  const support = getRiderMock('support', scenario);
  const [category, setCategory] = useState(supportCategories[0]);
  const [description, setDescription] = useState('');
  const [relatedDelivery, setRelatedDelivery] = useState('');
  const [attachment, setAttachment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [reply, setReply] = useState('');
  const [replySent, setReplySent] = useState(false);
  const viewState = scenario === 'active' ? 'ready' : scenario;
  const ticket = id ? support.tickets.find((item) => item.id === id) : null;

  function submitTicket(event) {
    event.preventDefault();
    setSubmitted(true);
  }

  function submitReply(event) {
    event.preventDefault();
    if (reply.trim()) {
      setReplySent(true);
      setReply('');
    }
  }

  return (
    <div className="rider-page-shell">
      <PageHeader
        title={ticket ? `Ticket ${ticket.id}` : 'Support & incidents'}
        subtitle={ticket ? 'Review the ticket conversation and send a reply.' : 'Get help with deliveries, account access, safety, and payments.'}
        eyebrow="Rider support"
        actions={ticket && <Button as={ScenarioLink} to="/rider/support" variant="outline" size="sm">Back to support</Button>}
      />
      <StateView state={viewState} emptyTitle="No support activity" emptyMessage="Support tickets and updates will appear here." onRetry={() => window.location.reload()}>
        {ticket ? (
          <Card>
            <CardBody>
              <div className="rider-ticket-detail-header">
                <div><h2>{ticket.subject}</h2><span>{ticket.category} · Updated {formatDateTime(ticket.updated)}</span></div>
                <StatusBadge status={ticket.status} config={ticketStatuses} />
              </div>
              <div className="rider-ticket-thread" aria-label="Ticket message thread">
                {ticket.thread.map((message, index) => (
                  <div key={`${message.author}-${index}`} className={`rider-ticket-message ${message.author === 'rider' ? 'from-rider' : 'from-support'}`}>
                    <strong>{message.author === 'rider' ? 'You' : 'SALO Support'}</strong>
                    <p>{message.message}</p>
                    <small>{formatDateTime(message.time)}</small>
                  </div>
                ))}
                {replySent && <div className="rider-ticket-message from-rider"><strong>You</strong><p>Reply sent in this local preview.</p></div>}
              </div>
              <form className="rider-ticket-reply" onSubmit={submitReply}>
                <label className="rider-field" htmlFor="rider-ticket-reply">Reply</label>
                <textarea id="rider-ticket-reply" value={reply} onChange={(event) => setReply(event.target.value)} rows="3" placeholder="Write a reply" />
                <Button type="submit" variant="primary" disabled={!reply.trim()}>Send reply</Button>
              </form>
            </CardBody>
          </Card>
        ) : (
          <div className="rider-support-grid">
            <Card>
              <CardBody>
                <h2>Choose a support category</h2>
                <div className="rider-support-category-grid">
                  {supportCategories.map((item) => (
                    <button type="button" className={`rider-support-category ${category === item ? 'is-selected' : ''}`} key={item} onClick={() => setCategory(item)} aria-pressed={category === item}>
                      <span aria-hidden="true">●</span>{item}
                    </button>
                  ))}
                </div>
                {submitted ? (
                  <div className="rider-support-success" role="status"><strong>Ticket submitted</strong><span>Your request is visible in this local preview.</span></div>
                ) : (
                  <form className="rider-support-form" onSubmit={submitTicket}>
                    <label className="rider-field" htmlFor="rider-support-description">Description</label>
                    <textarea id="rider-support-description" value={description} onChange={(event) => setDescription(event.target.value)} rows="4" placeholder="Describe what happened and how we can help." required />
                    <label className="rider-field" htmlFor="rider-support-delivery">Related delivery</label>
                    <select id="rider-support-delivery" value={relatedDelivery} onChange={(event) => setRelatedDelivery(event.target.value)}>
                      {support.relatedDeliveries.map((delivery) => <option key={delivery.id} value={delivery.id}>{delivery.label}</option>)}
                    </select>
                    <FileUploadField label="Attach a file" accept="image/*,.pdf" value={attachment} onChange={(event) => setAttachment(event.target.files?.[0]?.name || '')} maxSizeLabel="Optional photo or document" />
                    <Button type="submit" variant="primary" disabled={!description.trim()}>Submit ticket</Button>
                  </form>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <h2>Your support tickets</h2>
                <div className="rider-ticket-list">
                  {support.tickets.map((item) => (
                    <ScenarioLink className="rider-ticket-list-item" to={`/rider/support/${item.id}`} key={item.id}>
                      <div><strong>{item.subject}</strong><span>{item.id} · {formatDateTime(item.updated)}</span></div>
                      <StatusBadge status={item.status} config={ticketStatuses} />
                    </ScenarioLink>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </StateView>
    </div>
  );
}

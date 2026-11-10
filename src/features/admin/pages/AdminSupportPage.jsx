import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { ConfirmDialog, DataTable, DetailDrawer, FilterBar, PageHeader, StatusBadge, Tabs, Timeline } from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { ADMIN_MOCK_DATA, createAdminDispute, getAdminWorkspaceRecords, saveAdminWorkspaceRecords } from '../mocks';
import { ADMIN_TICKET_STATUSES, hasAdminPermission } from '../constants';
import { appendAdminAuditLog } from '../utils/auditLog';
import { formatDateTime } from '../utils/format';

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
const STATUS_OPTIONS = {
  Submitted: ['Open', 'Under Review', 'Awaiting Response', 'Escalated', 'Closed'],
  Open: ['Under Review', 'Awaiting Response', 'Escalated', 'Resolved', 'Closed'],
  'Under Review': ['Awaiting Response', 'Escalated', 'Resolved', 'Closed'],
  'Awaiting Response': ['Under Review', 'Escalated', 'Resolved', 'Closed'],
  Escalated: ['Under Review', 'Awaiting Response', 'Resolved', 'Closed'],
  Resolved: ['Open', 'Closed'],
  Closed: ['Open'],
};

export default function AdminSupportPage() {
  const { currentAdmin, permissions } = useAdminSession();
  const [tickets, setTickets] = useState(getAdminWorkspaceRecords('support'));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [tab, setTab] = useState('Conversation');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState(null);
  const [nextStatus, setNextStatus] = useState('');
  const [nextPriority, setNextPriority] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const canEdit = Boolean(permissions.support?.includes('edit'));
  const canCreate = hasAdminPermission(currentAdmin.role, 'support', 'create');
  const administrators = ADMIN_MOCK_DATA.administrators.filter((item) => item.status === 'Active');
  const selected = tickets.find((ticket) => ticket.id === selectedId);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tickets.filter((ticket) => (!term || `${ticket.id} ${ticket.requester} ${ticket.subject} ${ticket.relatedRecordId}`.toLowerCase().includes(term))
      && (!statusFilter || ticket.status === statusFilter)
      && (!categoryFilter || ticket.category === categoryFilter));
  }, [tickets, search, statusFilter, categoryFilter]);

  function recordAction(ticket, action, previousValue, newValue, reason) {
    appendAdminAuditLog({
      who: currentAdmin.name,
      role: currentAdmin.role,
      action,
      record: { type: 'Support ticket', id: ticket.id },
      previousValue,
      newValue,
      reason,
      reference: ticket.relatedRecordId || ticket.id,
    });
  }

  function commitTicket(ticketId, action, previousValue, newValue, reason, transform = (ticket) => ticket) {
    const previous = tickets.find((ticket) => ticket.id === ticketId);
    if (!previous) return;
    const time = new Date().toISOString();
    const updated = transform(previous, time);
    const next = tickets.map((ticket) => ticket.id === ticketId ? updated : ticket);
    setTickets(next);
    saveAdminWorkspaceRecords('support', next);
    recordAction(previous, action, previousValue, newValue, reason);
  }

  function confirmAction({ reason }) {
    const action = pendingAction;
    if (action.type === 'assign') {
      const admin = administrators.find((item) => item.id === assignee);
      commitTicket(action.ticket.id, 'Assigned support ticket', action.ticket.assignedAdminId || 'Unassigned', admin?.name || 'Unassigned', reason, (ticket, time) => ({
        ...ticket,
        assignedAdminId: admin?.id || null,
        history: [{ title: 'Assignment updated', description: `${admin?.name || 'Unassigned'} · ${reason}`, time }, ...ticket.history],
      }));
    }
    if (action.type === 'status') {
      commitTicket(action.ticket.id, `Changed support ticket status to ${nextStatus}`, action.ticket.status, nextStatus, reason, (ticket, time) => ({
        ...ticket,
        status: nextStatus,
        history: [{ title: `Status changed to ${nextStatus}`, description: reason, time }, ...ticket.history],
      }));
    }
    if (action.type === 'priority') {
      commitTicket(action.ticket.id, `Changed support ticket priority to ${nextPriority}`, action.ticket.priority, nextPriority, reason, (ticket, time) => ({
        ...ticket,
        priority: nextPriority,
        history: [{ title: `Priority changed to ${nextPriority}`, description: reason, time }, ...ticket.history],
      }));
    }
    if (action.type === 'note') {
      commitTicket(action.ticket.id, 'Added internal support note', null, note.trim(), reason, (ticket, time) => ({
        ...ticket,
        notes: [{ author: currentAdmin.name, text: note.trim(), time, reason }, ...ticket.notes],
        history: [{ title: 'Internal note added', description: reason, time }, ...ticket.history],
      }));
      setNote('');
    }
    if (action.type === 'escalate') {
      const relatedRecordType = action.ticket.relatedRecordId?.startsWith('RSV-')
        ? 'Reservation'
        : action.ticket.relatedRecordId?.startsWith('SALO-') ? 'Order' : null;
      const dispute = relatedRecordType && !action.ticket.disputeId
        ? createAdminDispute({
          type: action.ticket.category === 'Safety incident' ? 'Unsafe delivery'
            : action.ticket.category === 'Payment issue' ? 'Payment dispute' : 'Missing order',
          relatedRecordType,
          relatedRecordId: action.ticket.relatedRecordId,
          status: 'Open',
          assignedAdminId: action.ticket.assignedAdminId,
          priority: action.ticket.priority,
          timeline: [{ title: 'Case opened from support', description: `${action.ticket.id}: ${action.ticket.subject}`, time: new Date().toISOString() }],
        })
        : null;
      if (dispute) {
        appendAdminAuditLog({
          who: currentAdmin.name,
          role: currentAdmin.role,
          action: 'Created dispute from support escalation',
          record: { type: 'Dispute', id: dispute.id },
          previousValue: null,
          newValue: `${dispute.type} · ${dispute.relatedRecordId}`,
          reason: reason,
          reference: action.ticket.id,
        });
      }
      commitTicket(action.ticket.id, 'Escalated support ticket', action.ticket.status, 'Escalated', reason, (ticket, time) => ({
        ...ticket,
        status: 'Escalated',
        priority: ticket.priority === 'Urgent' ? ticket.priority : 'High',
        disputeId: dispute?.id || ticket.disputeId,
        history: [{ title: 'Ticket escalated', description: reason, time }, ...ticket.history],
      }));
    }
    if (action.type === 'resolve' || action.type === 'close') {
      const status = action.type === 'resolve' ? 'Resolved' : 'Closed';
      commitTicket(action.ticket.id, `Support ticket ${status.toLowerCase()}`, action.ticket.status, status, reason, (ticket, time) => ({
        ...ticket,
        status,
        resolvedBy: currentAdmin.name,
        resolvedAt: time,
        resolution: reason,
        history: [{ title: `Ticket ${status.toLowerCase()}`, description: reason, time }, ...ticket.history],
      }));
    }
    setPendingAction(null);
    setNextStatus('');
    setNextPriority('');
    setAssignee(null);
  }

  function sendMessage(event) {
    event.preventDefault();
    if (!selected || !message.trim()) return;
    const body = message.trim();
    commitTicket(selected.id, 'Sent simulated support communication', null, body, body, (ticket, time) => ({
      ...ticket,
      messages: [...ticket.messages, { author: currentAdmin.name, type: 'Admin', body, time }],
      history: [{ title: 'Reply sent', description: 'Simulated communication recorded in local demo state.', time }, ...ticket.history],
    }));
    setMessage('');
  }

  const columns = [
    { key: 'id', label: 'Ticket', render: (item) => <button className="admin-text-link" type="button" onClick={() => { setSelectedId(item.id); setTab('Conversation'); }}><strong>{item.id}</strong><span>{item.subject}</span></button> },
    { key: 'requester', label: 'Requester', render: (item) => <>{item.requester}<br /><span className="admin-muted">{item.requesterType}</span></> },
    { key: 'category', label: 'Category' },
    { key: 'relatedRecordId', label: 'Reference' },
    { key: 'assignedAdminId', label: 'Assigned admin', render: (item) => administrators.find((admin) => admin.id === item.assignedAdminId)?.name || 'Unassigned' },
    { key: 'priority', label: 'Priority', render: (item) => <StatusBadge status={item.priority} /> },
    { key: 'status', label: 'Status', render: (item) => <StatusBadge status={item.status} /> },
    { key: 'createdAt', label: 'Submitted', render: (item) => formatDateTime(item.createdAt) },
  ];

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Support and Complaints" description="Review requests from customers, restaurant owners and staff, and riders. Communication is simulated in this demo." />
        <FilterBar search={search} onSearchChange={setSearch} searchLabel="Search ticket, requester, reference, or subject">
          <label className="admin-filter-control">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{ADMIN_TICKET_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label className="admin-filter-control">Category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All categories</option>{[...new Set(tickets.map((ticket) => ticket.category))].map((category) => <option key={category}>{category}</option>)}</select></label>
        </FilterBar>
        {canCreate && <p className="admin-shell-note">New customer-facing tickets enter through the customer, restaurant, or rider modules. This workspace manages existing requests and does not fabricate a requester submission.</p>}
        {!canEdit && <p className="admin-shell-note">Your role can review tickets but cannot change assignment or status. Frontend permissions are for presentation only; backend enforcement is required.</p>}
        <DataTable columns={columns} rows={filtered} emptyTitle="No matching tickets" emptyDescription="Try a different search or filter." />
      </section>
      <DetailDrawer open={Boolean(selected)} title={selected ? `${selected.id} · ${selected.subject}` : 'Ticket details'} onClose={() => setSelectedId('')}>
        {selected && (
          <div className="admin-drawer-content">
            <ul className="admin-detail-list">
              <li><strong>Requester</strong>{selected.requester} · {selected.requesterType}</li>
              <li><strong>Category</strong>{selected.category}</li>
              <li><strong>Reference</strong>{selected.relatedRecordId || '—'}</li>
              {selected.disputeId && <li><strong>Dispute case</strong><Link to={`/admin/orders/disputes/${selected.disputeId}`}>{selected.disputeId}</Link></li>}
              <li><strong>Submitted</strong>{formatDateTime(selected.createdAt)}</li>
              <li><strong>Status</strong><StatusBadge status={selected.status} /></li>
              <li><strong>Priority</strong><StatusBadge status={selected.priority} /></li>
            </ul>
            <Tabs items={['Conversation', 'Internal notes', 'History']} value={tab} onChange={setTab} label="Support ticket detail sections" />
            {tab === 'Conversation' && (
              <>
                <div className="admin-conversation">
                  {selected.messages.map((item, index) => <article key={`${item.time}-${index}`}><strong>{item.author} · {item.type}</strong><p>{item.body}</p><time>{formatDateTime(item.time)}</time></article>)}
                </div>
                {canEdit && <form className="admin-record-panel" onSubmit={sendMessage}><label className="admin-filter-control">Simulated reply<textarea required value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a response for the demo conversation" /></label><button className="admin-action-button" type="submit">Record simulated reply</button></form>}
                <p className="admin-muted">No message is sent outside this browser demo.</p>
              </>
            )}
            {tab === 'Internal notes' && (
              <div className="admin-record-panel">
                {canEdit && <><label className="admin-filter-control">Add internal note<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label><button className="admin-action-button" type="button" disabled={!note.trim()} onClick={() => setPendingAction({ type: 'note', ticket: selected, title: 'Add internal note', confirmLabel: 'Add note' })}>Add note</button></>}
                {selected.notes?.length ? selected.notes.map((item, index) => <article key={`${item.time}-${index}`}><strong>{item.author}</strong><p>{item.text}</p><span className="admin-muted">{item.reason} · {formatDateTime(item.time)}</span></article>) : <p>No internal notes recorded.</p>}
              </div>
            )}
            {tab === 'History' && <Timeline items={selected.history.map((item, index) => ({ ...item, id: `${selected.id}-history-${index}` }))} />}
            {canEdit && (
              <div className="admin-record-panel">
                <h3>Ticket actions</h3>
                <div className="admin-filter-bar">
                  <label className="admin-filter-control">Assign administrator<select value={assignee ?? selected.assignedAdminId ?? ''} onChange={(event) => setAssignee(event.target.value)}><option value="">Unassigned</option>{administrators.map((admin) => <option key={admin.id} value={admin.id}>{admin.name} · {admin.role}</option>)}</select></label>
                  <button className="admin-action-button" type="button" disabled={assignee === null || assignee === (selected.assignedAdminId || '')} onClick={() => setPendingAction({ type: 'assign', ticket: selected, title: 'Update ticket assignment', confirmLabel: 'Save assignment' })}>Save assignment</button>
                </div>
                <div className="admin-filter-bar">
                  <label className="admin-filter-control">Change status<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}><option value="">Select status</option>{(STATUS_OPTIONS[selected.status] || []).map((status) => <option key={status}>{status}</option>)}</select></label>
                  <button className="admin-action-button" type="button" disabled={!nextStatus} onClick={() => setPendingAction({ type: 'status', ticket: selected, title: `Change status to ${nextStatus}`, confirmLabel: 'Update status' })}>Update status</button>
                </div>
                <div className="admin-filter-bar">
                  <label className="admin-filter-control">Priority<select value={nextPriority || selected.priority} onChange={(event) => setNextPriority(event.target.value)}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
                  <button className="admin-action-button" type="button" disabled={!nextPriority || nextPriority === selected.priority} onClick={() => setPendingAction({ type: 'priority', ticket: selected, title: `Change priority to ${nextPriority}`, confirmLabel: 'Update priority' })}>Update priority</button>
                </div>
                <div className="admin-action-row">
                  {selected.status !== 'Escalated' && !['Resolved', 'Closed'].includes(selected.status) && <button className="admin-action-button" type="button" onClick={() => setPendingAction({ type: 'escalate', ticket: selected, title: 'Escalate ticket', confirmLabel: 'Escalate' })}>Escalate</button>}
                  {!['Resolved', 'Closed'].includes(selected.status) && <button className="admin-action-button" type="button" onClick={() => setPendingAction({ type: 'resolve', ticket: selected, title: 'Resolve ticket', confirmLabel: 'Record resolution' })}>Resolve</button>}
                  {selected.status === 'Resolved' && <button className="admin-action-button" type="button" onClick={() => setPendingAction({ type: 'close', ticket: selected, title: 'Close ticket', confirmLabel: 'Close ticket' })}>Close</button>}
                </div>
              </div>
            )}
          </div>
        )}
      </DetailDrawer>
      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.title}
        description="This simulated support action is saved only in browser demo state and recorded in the audit log."
        confirmLabel={pendingAction?.confirmLabel}
        requireReauthentication
        requireReason
        onClose={() => setPendingAction(null)}
        onConfirm={confirmAction}
      />
    </AdminLayout>
  );
}

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { ConfirmDialog, DataTable, FilterBar, PageHeader, StatusBadge, Timeline } from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { hasAdminPermission } from '../constants';
import { ADMIN_MOCK_DATA, getAdminDisputes, saveAdminDisputes } from '../mocks';
import { formatDateTime } from '../utils/format';
import { appendAdminAuditLog } from '../utils/auditLog';

const CASE_STATUSES = ['Open', 'Investigating', 'Awaiting customer', 'Awaiting restaurant', 'Resolved', 'Closed'];

export default function AdminDisputesPage() {
  const { caseId } = useParams();
  const { currentAdmin } = useAdminSession();
  const [cases, setCases] = useState(getAdminDisputes);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [nextAssignee, setNextAssignee] = useState('');
  const [nextStatus, setNextStatus] = useState('');
  const [note, setNote] = useState('');
  const [previewFile, setPreviewFile] = useState('');
  const canManage = hasAdminPermission(currentAdmin.role, 'support', 'edit')
    || hasAdminPermission(currentAdmin.role, 'orders', 'edit');
  const selectedCase = useMemo(() => cases.find((item) => item.id === caseId), [cases, caseId]);
  const filteredCases = cases.filter((item) => (
    (!search || `${item.id} ${item.type} ${item.relatedRecordId}`.toLowerCase().includes(search.trim().toLowerCase()))
    && (!filterStatus || item.status === filterStatus)
  ));

  function logCaseAction(action, previousValue, newValue, reason) {
    appendAdminAuditLog({
      who: currentAdmin.name,
      role: currentAdmin.role,
      action,
      record: { type: 'Dispute', id: selectedCase.id },
      previousValue,
      newValue,
      reason,
    });
  }

  function confirmAction({ reason }) {
    const now = new Date().toISOString();
    const updated = cases.map((item) => {
      if (item.id !== selectedCase.id) return item;
      const next = { ...item, notes: [...(item.notes || [])], timeline: [...(item.timeline || [])] };
      if (pendingAction.type === 'assign') {
        const admin = ADMIN_MOCK_DATA.administrators.find((candidate) => candidate.id === nextAssignee);
        const previous = ADMIN_MOCK_DATA.administrators.find((candidate) => candidate.id === item.assignedAdminId)?.name || 'Unassigned';
        next.assignedAdminId = admin?.id || null;
        next.timeline.unshift({ title: admin ? 'Case assigned' : 'Case unassigned', description: `${previous} → ${admin?.name || 'Unassigned'}. ${reason}`, time: now });
        logCaseAction('Updated dispute assignment', previous, admin?.name || 'Unassigned', reason);
      } else if (pendingAction.type === 'status') {
        const previous = item.status;
        next.status = nextStatus;
        next.timeline.unshift({ title: `Status changed to ${nextStatus}`, description: reason, time: now });
        logCaseAction(nextStatus === 'Resolved' || nextStatus === 'Closed' ? 'Resolved dispute' : 'Changed dispute status', previous, nextStatus, reason);
      } else {
        next.notes.unshift({ text: note.trim(), author: currentAdmin.name, time: now, reason });
        next.timeline.unshift({ title: 'Internal note added', description: `${note.trim()} · ${reason}`, time: now });
        logCaseAction('Added dispute internal note', null, note.trim(), reason);
      }
      return next;
    });
    setCases(updated);
    saveAdminDisputes(updated);
    setPendingAction(null);
    setNote('');
    setNextAssignee('');
    setNextStatus('');
  }

  if (caseId && !selectedCase) {
    return <AdminLayout><section className="admin-shell-page"><PageHeader title="Dispute not found" description={`No demo case matches ${caseId}.`} /><Link to="/admin/orders/disputes">Back to disputes</Link></section></AdminLayout>;
  }

  if (!selectedCase) {
    const columns = [
      { key: 'id', label: 'Case', render: (item) => <Link to={`/admin/orders/disputes/${item.id}`}>{item.id}</Link> },
      { key: 'type', label: 'Type' },
      { key: 'relatedRecordId', label: 'Related record', render: (item) => <Link to={item.relatedRecordType === 'Reservation' ? `/admin/reservations/${item.relatedRecordId}` : `/admin/orders/${item.relatedRecordId}`}>{item.relatedRecordId}</Link> },
      { key: 'status', label: 'Status', render: (item) => <StatusBadge status={item.status} /> },
      { key: 'assignedAdminId', label: 'Assigned admin', render: (item) => ADMIN_MOCK_DATA.administrators.find((admin) => admin.id === item.assignedAdminId)?.name || 'Unassigned' },
      { key: 'priority', label: 'Priority', render: (item) => <StatusBadge status={item.priority} /> },
      { key: 'createdAt', label: 'Created', render: (item) => formatDateTime(item.createdAt) },
    ];
    return (
      <AdminLayout>
        <section className="admin-shell-page">
          <PageHeader title="Disputes and Escalations" description="Central case records for issues requiring platform investigation." actions={<Link className="admin-action-button" to="/admin/orders">Back to orders</Link>} />
          <FilterBar search={search} onSearchChange={setSearch} searchLabel="Search case, type, or record">
            <label className="admin-filter-control">Status<select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}><option value="">All statuses</option>{[...new Set(cases.map((item) => item.status))].map((item) => <option key={item}>{item}</option>)}</select></label>
          </FilterBar>
          <DataTable columns={columns} rows={filteredCases} emptyTitle="No matching cases" emptyDescription="No disputes match the current search or status." />
        </section>
      </AdminLayout>
    );
  }

  const relatedHref = selectedCase.relatedRecordType === 'Reservation'
    ? `/admin/reservations/${selectedCase.relatedRecordId}`
    : `/admin/orders/${selectedCase.relatedRecordId}`;
  const assignedAdmin = ADMIN_MOCK_DATA.administrators.find((admin) => admin.id === selectedCase.assignedAdminId);

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title={selectedCase.id} description={`${selectedCase.type} · ${selectedCase.relatedRecordType} ${selectedCase.relatedRecordId}`} actions={<Link className="admin-action-button" to="/admin/orders/disputes">Back to cases</Link>} />
        <div className="admin-record-panel">
          <h2>Case record</h2>
          <ul className="admin-detail-list">
            <li><strong>Type</strong>{selectedCase.type}</li>
            <li><strong>Related record</strong><Link to={relatedHref}>{selectedCase.relatedRecordType} {selectedCase.relatedRecordId}</Link></li>
            <li><strong>Status</strong><StatusBadge status={selectedCase.status} /></li>
            <li><strong>Assigned admin</strong>{assignedAdmin?.name || 'Unassigned'}</li>
            <li><strong>Priority</strong><StatusBadge status={selectedCase.priority} /></li>
            <li><strong>Created</strong>{formatDateTime(selectedCase.createdAt)}</li>
          </ul>
        </div>
        {canManage ? (
          <div className="admin-record-panel">
            <h2>Case actions</h2>
            <div className="admin-filter-bar">
              <label className="admin-filter-control">Assign administrator<select value={nextAssignee || selectedCase.assignedAdminId || ''} onChange={(event) => setNextAssignee(event.target.value)}><option value="">Unassigned</option>{ADMIN_MOCK_DATA.administrators.filter((admin) => admin.status === 'Active').map((admin) => <option key={admin.id} value={admin.id}>{admin.name} · {admin.role}</option>)}</select></label>
              <button className="admin-action-button" type="button" disabled={(nextAssignee || selectedCase.assignedAdminId || '') === (selectedCase.assignedAdminId || '')} onClick={() => setPendingAction({ type: 'assign', title: 'Confirm case assignment', label: 'Save assignment' })}>Assign / reassign</button>
              <label className="admin-filter-control">Case status<select value={nextStatus || selectedCase.status} onChange={(event) => setNextStatus(event.target.value)}>{CASE_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
              <button className="admin-action-button" type="button" disabled={(nextStatus || selectedCase.status) === selectedCase.status} onClick={() => setPendingAction({ type: 'status', title: nextStatus === 'Resolved' || nextStatus === 'Closed' ? 'Resolve case' : 'Change case status', label: nextStatus === 'Resolved' || nextStatus === 'Closed' ? 'Resolve case' : 'Update status' })}>Update status</button>
              <label className="admin-filter-control">Internal note<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
              <button className="admin-action-button" type="button" disabled={!note.trim()} onClick={() => setPendingAction({ type: 'note', title: 'Add case note', label: 'Add note' })}>Add internal note</button>
            </div>
          </div>
        ) : <p className="admin-shell-note">Your role can view this case but cannot assign or resolve it. Backend authorization is required in production.</p>}
        <div className="admin-record-panel">
          <h2>Evidence attachments</h2>
          {selectedCase.evidence.length ? selectedCase.evidence.map((file) => (
            <div className="admin-record-panel" key={file}>
              <strong>{file}</strong>
              <button className="admin-action-button" type="button" onClick={() => setPreviewFile(previewFile === file ? '' : file)}>{previewFile === file ? 'Hide preview' : 'Preview mock file'}</button>
              {previewFile === file && <div className="admin-document-preview" role="img" aria-label={`Illustrative preview placeholder for ${file}`}><strong>Mock attachment preview</strong><span>{file} · illustrative placeholder, not an actual customer document</span></div>}
            </div>
          )) : <p>No evidence attachments are recorded.</p>}
        </div>
        <div className="admin-record-panel"><h2>Internal notes</h2>{selectedCase.notes.length ? <ul className="admin-detail-list">{selectedCase.notes.map((item, index) => <li key={`${item.time}-${index}`}><strong>{item.author} · {formatDateTime(item.time)}</strong>{item.text}<span>Reason: {item.reason}</span></li>)}</ul> : <p>No internal notes have been added.</p>}</div>
        <div className="admin-record-panel"><h2>Resolution history</h2><Timeline items={selectedCase.timeline} /></div>
        <ConfirmDialog
          open={Boolean(pendingAction)}
          title={pendingAction?.title}
          description="The action and reason will be recorded in the mock audit log."
          confirmLabel={pendingAction?.label}
          requireReauthentication
          requireReason
          onClose={() => setPendingAction(null)}
          onConfirm={confirmAction}
        />
      </section>
    </AdminLayout>
  );
}

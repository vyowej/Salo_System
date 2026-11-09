import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { ConfirmDialog, DataTable, FilterBar, PageHeader, StatusBadge, Timeline } from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { hasAdminPermission } from '../constants';
import { ADMIN_MOCK_DATA, createAdminDispute, getReservationBreakdown } from '../mocks';
import { formatDateTime, formatPeso } from '../utils/format';
import { appendAdminAuditLog } from '../utils/auditLog';

export default function AdminReservationsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentAdmin } = useAdminSession();
  const reservation = useMemo(() => ADMIN_MOCK_DATA.reservations.find((item) => item.id === id), [id]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [restaurant, setRestaurant] = useState('');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [pendingEscalation, setPendingEscalation] = useState(false);
  const canEscalate = hasAdminPermission(currentAdmin.role, 'support', 'create')
    || hasAdminPermission(currentAdmin.role, 'reservations', 'create');

  if (id && !reservation) {
    return <AdminLayout><section className="admin-shell-page"><PageHeader title="Reservation not found" description={`No demo reservation matches reference ${id}.`} /><Link to="/admin/reservations">Back to reservations</Link></section></AdminLayout>;
  }

  function confirmEscalation({ reason }) {
    const dispute = createAdminDispute({
      type: 'Reservation fee dispute',
      relatedRecordType: 'Reservation',
      relatedRecordId: reservation.id,
      assignedAdminId: currentAdmin.id,
      priority: 'Normal',
      evidence: [],
      notes: [],
      timeline: [{ title: 'Reservation escalated', description: reason, time: new Date().toISOString() }],
    });
    appendAdminAuditLog({
      who: currentAdmin.name,
      role: currentAdmin.role,
      action: 'Escalated reservation to dispute case',
      record: { type: 'Reservation', id: reservation.id },
      previousValue: 'No active case',
      newValue: dispute.id,
      reason,
    });
    setPendingEscalation(false);
    navigate(`/admin/orders/disputes/${dispute.id}`);
  }

  if (reservation) {
    const breakdown = getReservationBreakdown(reservation.id);
    return (
      <AdminLayout>
        <section className="admin-shell-page">
          <PageHeader title={reservation.id} description={`${reservation.customerName} · ${reservation.restaurantName}`} actions={<Link className="admin-action-button" to="/admin/reservations">Back to reservations</Link>} />
          <div className="admin-record-panel">
            <h2>Reservation details</h2>
            <ul className="admin-detail-list">
              <li><strong>Customer</strong>{reservation.customerName} · {reservation.customerEmail}</li>
              <li><strong>Restaurant</strong>{reservation.restaurantName}</li>
              <li><strong>Date and time</strong>{formatDateTime(reservation.reservedAt)}</li>
              <li><strong>Guests</strong>{reservation.guests}</li>
              <li><strong>Table</strong>{reservation.table}</li>
              <li><strong>Status</strong><StatusBadge status={reservation.status} /></li>
              <li><strong>Reservation fee</strong>{formatPeso(breakdown.reservationFee)}</li>
              <li><strong>Payment status</strong><StatusBadge status={reservation.paymentStatus} /></li>
              <li><strong>Cancellation information</strong>{reservation.cancellationInfo ? `${reservation.cancellationInfo.cancelledBy} · ${reservation.cancellationInfo.reason} · ${reservation.cancellationInfo.refundStatus} · ${formatDateTime(reservation.cancellationInfo.cancelledAt)}` : 'No cancellation recorded'}</li>
            </ul>
            <p className="admin-shell-note">Restaurant owners manage day-to-day tables and reservations. Admin handles investigation and escalation.</p>
            {canEscalate
              ? <button className="admin-action-button" type="button" onClick={() => setPendingEscalation(true)}>Escalate reservation fee issue</button>
              : <p className="admin-shell-note">Your role can view reservations but cannot create escalations. Backend authorization is required in production.</p>}
          </div>
          <div className="admin-record-panel"><h2>Reservation timeline</h2><Timeline items={reservation.timeline} /></div>
          <ConfirmDialog
            open={pendingEscalation}
            title="Escalate reservation"
            description="Create a reservation-fee dispute case for platform investigation."
            confirmLabel="Create escalation"
            requireReauthentication
            requireReason
            onClose={() => setPendingEscalation(false)}
            onConfirm={confirmEscalation}
          />
        </section>
      </AdminLayout>
    );
  }

  const reservations = ADMIN_MOCK_DATA.reservations;
  const filtered = reservations.filter((item) => (
    (!search || item.id.toLowerCase().includes(search.trim().toLowerCase()))
    && (!status || item.status === status)
    && (!restaurant || item.restaurantId === restaurant)
    && (!dateRange.from || item.reservedAt.slice(0, 10) >= dateRange.from)
    && (!dateRange.to || item.reservedAt.slice(0, 10) <= dateRange.to)
  ));
  const columns = [
    { key: 'id', label: 'Reference', render: (item) => <Link to={`/admin/reservations/${item.id}`}>{item.id}</Link> },
    { key: 'customerName', label: 'Customer' },
    { key: 'restaurantName', label: 'Restaurant' },
    { key: 'reservedAt', label: 'Date / time', render: (item) => formatDateTime(item.reservedAt) },
    { key: 'guests', label: 'Guests' },
    { key: 'table', label: 'Table' },
    { key: 'status', label: 'Status', render: (item) => <StatusBadge status={item.status} /> },
    { key: 'fee', label: 'Reservation fee', render: (item) => formatPeso(getReservationBreakdown(item.id).reservationFee) },
    { key: 'paymentStatus', label: 'Payment', render: (item) => <StatusBadge status={item.paymentStatus} /> },
  ];

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Reservations" description="Monitor platform-wide reservation activity, payment records, cancellations, and escalations." />
        <p className="admin-shell-note">Restaurant owners manage day-to-day tables and reservations; platform administrators investigate and handle escalated issues.</p>
        <FilterBar search={search} onSearchChange={setSearch} searchLabel="Search reservation reference">
          <label className="admin-filter-control">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{[...new Set(reservations.map((item) => item.status))].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="admin-filter-control">Restaurant<select value={restaurant} onChange={(event) => setRestaurant(event.target.value)}><option value="">All restaurants</option>{ADMIN_MOCK_DATA.restaurants.filter((item) => reservations.some((reservationItem) => reservationItem.restaurantId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="admin-filter-control">From<input aria-label="Reservation date from" type="date" value={dateRange.from} onChange={(event) => setDateRange((previous) => ({ ...previous, from: event.target.value }))} /></label>
          <label className="admin-filter-control">To<input aria-label="Reservation date to" type="date" value={dateRange.to} onChange={(event) => setDateRange((previous) => ({ ...previous, to: event.target.value }))} /></label>
        </FilterBar>
        <DataTable columns={columns} rows={filtered} emptyTitle="No matching reservations" emptyDescription="Try changing the search term or filters." />
      </section>
    </AdminLayout>
  );
}

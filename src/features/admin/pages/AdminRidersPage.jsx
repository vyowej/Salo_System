import { useState, useEffect } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import adminService from '../../../services/adminService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

const TABS = ['All', 'Active', 'Pending Verification', 'Suspended'];

export default function AdminRidersPage() {
  const [riders, setRiders] = useState([]);
  const [tab, setTab] = useState('All');
  const [search, setSearch] = useState('');

  function loadRiders() {
    setRiders(adminService.getRiders());
  }

  useEffect(() => {
    loadRiders();
  }, []);

  function handleStatus(id, newStatus) {
    adminService.updateRiderStatus(id, newStatus);
    loadRiders();
  }

  const filtered = riders.filter((r) => {
    const matchTab = tab === 'All' || r.status === tab;
    const matchSearch =
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.vehicle.toLowerCase().includes(search.toLowerCase()) ||
      r.phone.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  return (
    <AdminLayout>
      {/* ── Page Header ────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--salo-green)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Logistics & Fleet
          </span>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}>
            Courier Fleet & LTO Verification
          </h1>
          <p className="page-subtitle">
            Validate driver licenses, monitor on-the-road couriers, and track cash-on-delivery settlements
          </p>
        </div>
      </div>

      {/* ── Tabs & Search Bar ──────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto' }}>
          {TABS.map((t) => {
            const count = t === 'All' ? riders.length : riders.filter((r) => r.status === t).length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-full)',
                  border: tab === t ? '1px solid var(--accent)' : '1px solid var(--border-primary)',
                  background: tab === t ? 'var(--accent)' : 'var(--surface-primary)',
                  color: tab === t ? '#fff' : 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{t}</span>
                <span style={{
                  background: tab === t ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)',
                  color: tab === t ? '#fff' : 'var(--text-muted)',
                  borderRadius: 'var(--radius-full)',
                  padding: '1px 6px',
                  fontSize: 11,
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-lg)',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          minWidth: 260,
        }}>
          <input
            type="text"
            placeholder="Search courier, plate, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              width: '100%',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      {/* ── Riders Table ───────────────────────────────── */}
      <div style={{
        background: 'var(--surface-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-4)',
        boxShadow: 'var(--shadow-sm)',
        overflowX: 'auto',
      }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-8) 0', color: 'var(--text-muted)' }}>
            <p>No couriers found matching this filter.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--border-secondary)', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '12px 14px' }}>Rider Name</th>
                <th style={{ padding: '12px 14px' }}>Motorcycle & Plate</th>
                <th style={{ padding: '12px 14px' }}>LTO Driver License</th>
                <th style={{ padding: '12px 14px' }}>Assigned Zone</th>
                <th style={{ padding: '12px 14px' }}>COD Cash Held</th>
                <th style={{ padding: '12px 14px' }}>Rating</th>
                <th style={{ padding: '12px 14px' }}>Status</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rider) => (
                <tr key={rider.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                  <td style={{ padding: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {rider.name}
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                      📞 {rider.phone}
                    </span>
                  </td>
                  <td style={{ padding: '14px', fontSize: 'var(--font-size-xs)' }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block' }}>{rider.vehicle}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>{rider.isOnline ? '🟢 Live on Dispatch' : '⚪ Offline'}</span>
                  </td>
                  <td style={{ padding: '14px' }}>
                    <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                      {rider.licenseNumber}
                    </code>
                  </td>
                  <td style={{ padding: '14px', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    {rider.zone}
                  </td>
                  <td style={{ padding: '14px' }}>
                    <span style={{ fontWeight: 700, color: rider.cashOnHand > 3000 ? 'var(--salo-error)' : 'var(--accent)' }}>
                      ₱{rider.cashOnHand.toLocaleString('en-PH')}
                    </span>
                    {rider.cashOnHand > 3000 && (
                      <span style={{ display: 'block', fontSize: 10, color: 'var(--salo-error)', fontWeight: 600 }}>High Cash Alert</span>
                    )}
                  </td>
                  <td style={{ padding: '14px', color: 'var(--text-secondary)' }}>
                    {rider.rating > 0 ? `★ ${rider.rating} (${rider.totalTrips})` : 'New Applicant'}
                  </td>
                  <td style={{ padding: '14px' }}>
                    <Badge
                      variant={rider.status === 'Active' ? 'success' : rider.status === 'Pending Verification' ? 'warning' : 'default'}
                      size="sm"
                      dot
                    >
                      {rider.status}
                    </Badge>
                  </td>
                  <td style={{ padding: '14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {rider.status === 'Pending Verification' && (
                        <>
                          <Button variant="primary" size="sm" onClick={() => handleStatus(rider.id, 'Active')}>
                            Verify & Activate
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleStatus(rider.id, 'Suspended')} style={{ color: 'var(--salo-error)' }}>
                            Decline
                          </Button>
                        </>
                      )}
                      {rider.status === 'Active' && (
                        <Button variant="outline" size="sm" onClick={() => handleStatus(rider.id, 'Suspended')} style={{ color: 'var(--salo-error)' }}>
                          Suspend
                        </Button>
                      )}
                      {rider.status === 'Suspended' && (
                        <Button variant="secondary" size="sm" onClick={() => handleStatus(rider.id, 'Active')}>
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}

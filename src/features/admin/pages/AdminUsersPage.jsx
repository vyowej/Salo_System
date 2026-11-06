import { useState, useEffect } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import adminService from '../../../services/adminService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

const ROLES = ['All Roles', 'Customer', 'Restaurant Owner', 'Delivery Rider', 'Administrator'];

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState('All Roles');
  const [search, setSearch] = useState('');

  function loadUsers() {
    setUsers(adminService.getUsers());
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function handleStatus(id, newStatus) {
    adminService.updateUserStatus(id, newStatus);
    loadUsers();
  }

  const filtered = users.filter((u) => {
    const matchRole = roleFilter === 'All Roles' || u.role === roleFilter;
    const term = search.toLowerCase();
    const matchSearch = u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term);
    return matchRole && matchSearch;
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
              color: 'var(--salo-brown, #5D4037)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Access & Security
          </span>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}>
            Global User Directory ({users.length})
          </h1>
          <p className="page-subtitle">
            Search, inspect, and manage accounts across all 4 user roles on the SALO network
          </p>
        </div>
      </div>

      {/* ── Tabs & Search Bar ──────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto' }}>
          {ROLES.map((r) => {
            const count = r === 'All Roles' ? users.length : users.filter((u) => u.role === r).length;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-full)',
                  border: roleFilter === r ? '1px solid var(--accent)' : '1px solid var(--border-primary)',
                  background: roleFilter === r ? 'var(--accent)' : 'var(--surface-primary)',
                  color: roleFilter === r ? '#fff' : 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{r}</span>
                <span style={{
                  background: roleFilter === r ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)',
                  color: roleFilter === r ? '#fff' : 'var(--text-muted)',
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
            placeholder="Search name or email..."
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

      {/* ── Users Table ────────────────────────────────── */}
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
            <p>No user accounts found matching this filter.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--border-secondary)', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '12px 14px' }}>User Details</th>
                <th style={{ padding: '12px 14px' }}>Email Address</th>
                <th style={{ padding: '12px 14px' }}>Role</th>
                <th style={{ padding: '12px 14px' }}>Activity Volume</th>
                <th style={{ padding: '12px 14px' }}>Member Since</th>
                <th style={{ padding: '12px 14px' }}>Status</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                  <td style={{ padding: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {u.name}
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                      ID: {u.id}
                    </span>
                  </td>
                  <td style={{ padding: '14px', color: 'var(--text-secondary)' }}>
                    {u.email}
                  </td>
                  <td style={{ padding: '14px' }}>
                    <Badge
                      variant={
                        u.role === 'Customer'
                          ? 'primary'
                          : u.role === 'Restaurant Owner'
                          ? 'warning'
                          : u.role === 'Delivery Rider'
                          ? 'success'
                          : 'default'
                      }
                      size="sm"
                    >
                      {u.role}
                    </Badge>
                  </td>
                  <td style={{ padding: '14px', color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                    {u.trips > 0 ? `${u.trips} transactions` : 'Platform Admin'}
                  </td>
                  <td style={{ padding: '14px', color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
                    {u.joined}
                  </td>
                  <td style={{ padding: '14px' }}>
                    <Badge variant={u.status === 'Active' ? 'success' : 'default'} size="sm" dot>
                      {u.status}
                    </Badge>
                  </td>
                  <td style={{ padding: '14px', textAlign: 'right' }}>
                    {u.role !== 'Administrator' ? (
                      u.status === 'Active' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStatus(u.id, 'Suspended')}
                          style={{ color: 'var(--salo-error)' }}
                        >
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleStatus(u.id, 'Active')}
                        >
                          Reactivate
                        </Button>
                      )
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Protected</span>
                    )}
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

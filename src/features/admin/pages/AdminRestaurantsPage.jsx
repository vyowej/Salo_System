import { useState, useEffect } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import adminService from '../../../services/adminService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import { Input } from '../../../components/forms';

const TABS = ['All', 'Active', 'Pending Approval', 'Suspended'];

export default function AdminRestaurantsPage() {
  const [restaurants, setRestaurants] = useState([]);
  const [tab, setTab] = useState('All');
  const [search, setSearch] = useState('');

  // Commission modal
  const [editingRest, setEditingRest] = useState(null);
  const [newRate, setNewRate] = useState(10);

  useEffect(() => {
    loadRestaurants();
  }, []);

  function loadRestaurants() {
    setRestaurants(adminService.getRestaurants());
  }

  function handleStatus(id, newStatus) {
    adminService.updateRestaurantStatus(id, newStatus);
    loadRestaurants();
  }

  function handleSaveCommission(e) {
    e.preventDefault();
    if (!editingRest) return;
    adminService.updateRestaurantCommission(editingRest.id, newRate);
    setEditingRest(null);
    loadRestaurants();
  }

  const filtered = restaurants.filter((r) => {
    const matchTab = tab === 'All' || r.status === tab;
    const matchSearch =
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.cuisine.toLowerCase().includes(search.toLowerCase()) ||
      r.ownerEmail.toLowerCase().includes(search.toLowerCase());
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
              color: 'var(--salo-brown, #5D4037)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Partner Management
          </span>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}>
            Restaurant Partners & Onboarding
          </h1>
          <p className="page-subtitle">
            Verify merchant credentials, manage take-rate commissions, and maintain food quality standards
          </p>
        </div>
      </div>

      {/* ── Tabs & Search Bar ──────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto' }}>
          {TABS.map((t) => {
            const count = t === 'All' ? restaurants.length : restaurants.filter((r) => r.status === t).length;
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
            placeholder="Search kitchen or email..."
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

      {/* ── Restaurants Table ──────────────────────────── */}
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
            <p>No restaurants found in this category.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--border-secondary)', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '12px 14px' }}>Restaurant Name</th>
                <th style={{ padding: '12px 14px' }}>Owner & Contact</th>
                <th style={{ padding: '12px 14px' }}>Cuisine & Address</th>
                <th style={{ padding: '12px 14px' }}>Take Rate</th>
                <th style={{ padding: '12px 14px' }}>Rating</th>
                <th style={{ padding: '12px 14px' }}>Status</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                  <td style={{ padding: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {r.name}
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                      Joined {r.joinedDate}
                    </span>
                  </td>
                  <td style={{ padding: '14px' }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block' }}>{r.ownerName}</strong>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{r.ownerEmail}</span>
                  </td>
                  <td style={{ padding: '14px', fontSize: 'var(--font-size-xs)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>{r.cuisine}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{r.address}</span>
                  </td>
                  <td style={{ padding: '14px' }}>
                    <button
                      type="button"
                      onClick={() => { setEditingRest(r); setNewRate(r.commissionRate); }}
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                        padding: '4px 8px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--accent)',
                        cursor: 'pointer',
                      }}
                      title="Click to change commission"
                    >
                      {r.commissionRate}% ✎
                    </button>
                  </td>
                  <td style={{ padding: '14px', color: 'var(--text-secondary)' }}>
                    {r.rating > 0 ? `★ ${r.rating}` : 'New Store'}
                  </td>
                  <td style={{ padding: '14px' }}>
                    <Badge
                      variant={r.status === 'Active' ? 'success' : r.status === 'Pending Approval' ? 'warning' : 'default'}
                      size="sm"
                      dot
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td style={{ padding: '14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {r.status === 'Pending Approval' && (
                        <>
                          <Button variant="primary" size="sm" onClick={() => handleStatus(r.id, 'Active')}>
                            Approve
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleStatus(r.id, 'Suspended')} style={{ color: 'var(--salo-error)' }}>
                            Reject
                          </Button>
                        </>
                      )}
                      {r.status === 'Active' && (
                        <Button variant="outline" size="sm" onClick={() => handleStatus(r.id, 'Suspended')} style={{ color: 'var(--salo-error)' }}>
                          Suspend
                        </Button>
                      )}
                      {r.status === 'Suspended' && (
                        <Button variant="secondary" size="sm" onClick={() => handleStatus(r.id, 'Active')}>
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

      {/* ── Commission Modal ─────────────────────────────── */}
      <Modal
        open={Boolean(editingRest)}
        onClose={() => setEditingRest(null)}
        title="Adjust Commission Take Rate"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', width: '100%' }}>
            <Button variant="ghost" onClick={() => setEditingRest(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveCommission}>
              Update Rate
            </Button>
          </div>
        }
      >
        {editingRest && (
          <form onSubmit={handleSaveCommission} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
              Set customized platform commission rate for <strong>{editingRest.name}</strong>:
            </p>

            <Input
              id="comm-rate"
              label="Commission Take Rate (%)"
              type="number"
              min="5"
              max="25"
              step="0.5"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              required
              helper="Standard platform baseline is 10.0%. Premium partners may negotiate down to 8%."
            />
          </form>
        )}
      </Modal>
    </AdminLayout>
  );
}

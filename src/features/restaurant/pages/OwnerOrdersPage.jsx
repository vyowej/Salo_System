import { useState, useEffect } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

/* ── Helpers ──────────────────────────────────────────────── */
function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

function summarizeItems(items = []) {
  return items
    .map((it) => `${it.name.split(' ')[0]} x${it.qty}`)
    .join(', ');
}

function paymentBadgeVariant(method = '') {
  const m = method.toLowerCase();
  if (m === 'gcash') return 'info';
  if (m === 'maya') return 'primary';
  if (m === 'cash on delivery' || m === 'cod') return 'default';
  return 'default';
}

function statusVariant(status = '') {
  const s = status.toLowerCase();
  if (s === 'pending') return 'warning';
  if (s === 'preparing') return 'primary';
  if (s === 'ready for pickup' || s === 'out for delivery') return 'info';
  if (s === 'completed') return 'success';
  if (s === 'cancelled') return 'error';
  return 'default';
}

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'Pending', label: 'Pending' },
  { id: 'Preparing', label: 'Preparing' },
  { id: 'Ready for Pickup', label: 'Ready' },
  { id: 'Completed', label: 'Completed' },
  { id: 'Cancelled', label: 'Cancelled' },
];

/* ── Inline Toggle Switch ─────────────────────────────────── */
/* (not needed in orders page but kept here as shared style ref) */

/* ── Component ────────────────────────────────────────────── */
export default function OwnerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    setOrders(ownerService.getOrders());
  }, []);

  function reload() {
    setOrders(ownerService.getOrders());
  }

  function handleStatus(orderId, status) {
    ownerService.updateOrderStatus(orderId, status);
    reload();
  }

  const filtered =
    filter === 'all'
      ? orders
      : orders.filter((o) => o.status === filter);

  return (
    <OwnerLayout>
      {/* ── Page Header ────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Restaurant Operations
        </span>
        <h1
          className="page-title"
          style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}
        >
          Live Orders
        </h1>
        <p className="page-subtitle">
          Manage incoming and active orders in real time
        </p>
      </div>

      {/* ── Tab Filter Bar ─────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          flexWrap: 'wrap',
          marginBottom: 'var(--space-6)',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              border:
                filter === tab.id
                  ? '1.5px solid var(--accent)'
                  : '1px solid var(--border-primary)',
              background:
                filter === tab.id ? 'var(--accent)' : 'var(--surface-primary)',
              color: filter === tab.id ? '#fff' : 'var(--text-secondary)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Empty State ────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 'var(--space-12) 0',
            background: 'var(--surface-primary)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--border-primary)',
          }}
        >
          <p style={{ fontSize: 'var(--font-size-2xl)', marginBottom: 'var(--space-2)' }}>
            🍽️
          </p>
          <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
            No orders in this category yet.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {filtered.map((order) => {
            const isExpanded = expandedId === order.id;
            return (
              <div
                key={order.id}
                style={{
                  background: 'var(--surface-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-xl)',
                  overflow: 'hidden',
                  transition: 'border-color var(--transition-fast)',
                }}
              >
                {/* ── Order Row ── */}
                <div
                  onClick={() =>
                    setExpandedId(isExpanded ? null : order.id)
                  }
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr auto',
                    alignItems: 'center',
                    gap: 'var(--space-4)',
                    padding: 'var(--space-4) var(--space-5)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = 'var(--surface-hover)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = 'transparent')
                  }
                >
                  {/* Order # */}
                  <div>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {order.id}
                    </span>
                    <p
                      style={{
                        fontSize: 10,
                        color: 'var(--text-muted)',
                        marginTop: 2,
                      }}
                    >
                      {formatTime(order.createdAt)}
                    </p>
                  </div>

                  {/* Customer + Items */}
                  <div>
                    <p
                      style={{
                        fontWeight: 600,
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {order.customerName}
                    </p>
                    <p
                      style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        marginTop: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {summarizeItems(order.items)}
                    </p>
                  </div>

                  {/* Total */}
                  <div>
                    <p
                      style={{
                        fontWeight: 700,
                        fontSize: 'var(--font-size-md)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      ₱{(order.total ?? order.subtotal ?? 0).toLocaleString()}
                    </p>
                  </div>

                  {/* Payment Method */}
                  <div>
                    <Badge
                      variant={paymentBadgeVariant(order.paymentMethod)}
                      size="sm"
                    >
                      {order.paymentMethod || 'COD'}
                    </Badge>
                  </div>

                  {/* Status */}
                  <div>
                    <Badge
                      variant={statusVariant(order.status)}
                      dot
                      size="sm"
                    >
                      {order.status}
                    </Badge>
                  </div>

                  {/* Expand chevron */}
                  <div
                    style={{
                      color: 'var(--text-muted)',
                      transition: 'transform var(--transition-fast)',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                </div>

                {/* ── Expanded Detail ── */}
                {isExpanded && (
                  <div
                    style={{
                      borderTop: '1px solid var(--border-secondary)',
                      padding: 'var(--space-4) var(--space-5)',
                      background: 'var(--surface-secondary)',
                    }}
                  >
                    {/* Items list */}
                    <p
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 700,
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: 'var(--space-2)',
                      }}
                    >
                      Order Items
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-1)',
                        marginBottom: 'var(--space-4)',
                      }}
                    >
                      {order.items.map((item, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 'var(--font-size-sm)',
                          }}
                        >
                          <span style={{ color: 'var(--text-primary)' }}>
                            {item.name}{' '}
                            <span style={{ color: 'var(--text-muted)' }}>
                              × {item.qty}
                            </span>
                          </span>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                            ₱{(item.price * item.qty).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Meta */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 'var(--space-3)',
                        marginBottom: 'var(--space-4)',
                      }}
                    >
                      <div>
                        <p
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          Delivery Address
                        </p>
                        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 2 }}>
                          {order.deliveryAddress || order.address || '—'}
                        </p>
                      </div>
                      {(order.notes) && (
                        <div>
                          <p
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: 'var(--text-muted)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Customer Notes
                          </p>
                          <p
                            style={{
                              fontSize: 'var(--font-size-sm)',
                              color: 'var(--text-secondary)',
                              marginTop: 2,
                              fontStyle: 'italic',
                            }}
                          >
                            "{order.notes}"
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      {order.status === 'Pending' && (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatus(order.id, 'Preparing');
                            }}
                          >
                            Accept Order
                          </Button>
                          <Button
                            variant="danger-outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatus(order.id, 'Cancelled');
                            }}
                          >
                            Decline
                          </Button>
                        </>
                      )}
                      {order.status === 'Preparing' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatus(order.id, 'Ready for Pickup');
                          }}
                        >
                          Mark Ready
                        </Button>
                      )}
                      {order.status === 'Ready for Pickup' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatus(order.id, 'Completed');
                          }}
                        >
                          Complete Order
                        </Button>
                      )}
                      {order.status === 'Out for Delivery' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatus(order.id, 'Completed');
                          }}
                        >
                          Mark Delivered
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </OwnerLayout>
  );
}

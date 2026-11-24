import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '../common/Button';
import ReverbStatusBadge from '../common/ReverbStatusBadge';
import connectService from '../../services/connectService';
import { getEcho, subscribeEchoConnectionStatus } from '../../services/echoService';
import { formatDateTimeManila } from '../../utils/format';
import './OrderChatPanel.css';

export default function OrderChatPanel({
  orderId,
  viewerRole,
  currentUserId,
  initialUnreadCount = 0,
  isOrderEnded = false,
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [quickReplies, setQuickReplies] = useState([]);
  const [isReadOnly, setIsReadOnly] = useState(isOrderEnded);
  const [unreadCount, setUnreadCount] = useState(Number(initialUnreadCount || 0));
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const listEndRef = useRef(null);
  const prevConnRef = useRef('disconnected');

  useEffect(() => {
    setUnreadCount(Number(initialUnreadCount || 0));
  }, [initialUnreadCount]);

  useEffect(() => {
    if (isOrderEnded) {
      setIsReadOnly(true);
    }
  }, [isOrderEnded]);

  const loadConversation = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError('');
    try {
      const data = await connectService.getConversation(orderId);
      if (data) {
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setQuickReplies(Array.isArray(data.quick_replies) ? data.quick_replies : []);
        setIsReadOnly(Boolean(data.is_read_only));
        setUnreadCount(0);
      }
    } catch (err) {
      setError(err?.message || 'Unable to load messages.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (open && orderId) {
      loadConversation();
    }
  }, [open, orderId, loadConversation]);

  // Auto-scroll when messages change while open
  useEffect(() => {
    if (open && listEndRef.current) {
      listEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [open, messages.length]);

  // Subscribe to real-time message events on private-order.{orderId}
  useEffect(() => {
    if (!orderId) return undefined;
    const echo = getEcho();
    if (!echo) return undefined;

    const channel = echo.join(`order.${orderId}`);

    channel.listen('.MessageSent', (payload) => {
      const msg = payload?.message;
      if (!msg) return;
      setMessages((prev) => {
        if (prev.some((m) => Number(m.id) === Number(msg.id))) return prev;
        return [...prev, msg];
      });
      const isFromSelf =
        (currentUserId && Number(msg.sender_id) === Number(currentUserId)) ||
        msg.sender_role === viewerRole;

      if (!isFromSelf) {
        if (open) {
          // Refresh to mark as read on server
          connectService.getConversation(orderId).catch(() => {});
        } else {
          setUnreadCount((c) => c + 1);
        }
      }
    });

    channel.listen('.MessagesRead', (payload) => {
      if (!payload?.read_at) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.read_at || Number(m.sender_id) === Number(payload.reader_user_id)
            ? m
            : { ...m, read_at: payload.read_at },
        ),
      );
    });

    return () => {
      channel.stopListening('.MessageSent');
      channel.stopListening('.MessagesRead');
    };
  }, [orderId, open, viewerRole, currentUserId]);

  // Refetch on WebSocket reconnect when open
  useEffect(() => {
    return subscribeEchoConnectionStatus((status) => {
      const prev = prevConnRef.current;
      prevConnRef.current = status;
      if (status === 'connected' && prev !== 'connected' && open && orderId) {
        loadConversation();
      }
    });
  }, [open, orderId, loadConversation]);

  const handleSend = async (textToSend) => {
    const clean = String(textToSend ?? draft).trim();
    if (!clean || sending || isReadOnly || !orderId) return;
    setSending(true);
    setError('');
    try {
      const res = await connectService.sendMessage(orderId, clean);
      if (res?.message) {
        setMessages((prev) => {
          if (prev.some((m) => Number(m.id) === Number(res.message.id))) return prev;
          return [...prev, res.message];
        });
      }
      if (textToSend === undefined) {
        setDraft('');
      }
    } catch (err) {
      setError(err?.message || 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  if (!orderId) return null;

  return (
    <div className="order-chat-card">
      <button
        type="button"
        className="order-chat-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="order-chat-toggle-left">
          <strong>Order Chat</strong>
          {unreadCount > 0 && (
            <span className="order-chat-unread" aria-label={`${unreadCount} unread messages`}>
              {unreadCount}
            </span>
          )}
        </div>
        <div className="order-chat-toggle-right">
          <ReverbStatusBadge />
          <span>{open ? 'Hide' : 'Open'}</span>
        </div>
      </button>

      {open && (
        <div className="order-chat-body">
          {error && (
            <div className="order-chat-error" role="alert">
              {error}
            </div>
          )}

          {isReadOnly && (
            <div className="order-chat-readonly" role="status">
              Chat is read-only because this order has ended.
            </div>
          )}

          <div className="order-chat-messages" aria-live="polite">
            {loading ? (
              <p className="order-chat-empty">Loading messages…</p>
            ) : messages.length === 0 ? (
              <p className="order-chat-empty">
                No messages yet. Use a quick reply or send a message below.
              </p>
            ) : (
              messages.map((m) => {
                const isMine = m.sender_role === viewerRole;
                return (
                  <div key={m.id} className={`order-chat-bubble ${isMine ? 'is-mine' : 'is-theirs'}`}>
                    <div className="order-chat-meta">
                      <span>{isMine ? 'You' : m.sender_name || m.sender_role}</span>
                      <span>{formatDateTimeManila(m.created_at)}</span>
                    </div>
                    <p className="order-chat-text">{m.message}</p>
                    {isMine && (
                      <span className="order-chat-read">{m.read_at ? 'Read' : 'Sent'}</span>
                    )}
                  </div>
                );
              })
            )}
            <div ref={listEndRef} />
          </div>

          {!isReadOnly && quickReplies.length > 0 && (
            <div className="order-chat-quick-replies" aria-label="Quick replies">
              {quickReplies.map((qr) => (
                <button
                  key={qr}
                  type="button"
                  className="order-chat-qr-btn"
                  disabled={sending}
                  onClick={() => handleSend(qr)}
                >
                  {qr}
                </button>
              ))}
            </div>
          )}

          {!isReadOnly && (
            <form
              className="order-chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              <input
                type="text"
                className="order-chat-input"
                value={draft}
                maxLength={500}
                disabled={sending}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                aria-label="Message input"
              />
              <Button type="submit" variant="primary" size="sm" disabled={sending || !draft.trim()}>
                {sending ? 'Sending…' : 'Send'}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

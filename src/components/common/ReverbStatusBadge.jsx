import { useEffect, useState } from 'react';
import { subscribeEchoConnectionStatus } from '../../services/echoService';
import './ReverbStatusBadge.css';

const STATUS_META = {
  connected: { label: 'Live', tone: 'connected' },
  connecting: { label: 'Connecting…', tone: 'connecting' },
  initialized: { label: 'Connecting…', tone: 'connecting' },
  unavailable: { label: 'Reconnecting…', tone: 'disconnected' },
  failed: { label: 'Offline', tone: 'disconnected' },
  disconnected: { label: 'Offline', tone: 'disconnected' },
};

export default function ReverbStatusBadge({ className = '' }) {
  const [status, setStatus] = useState('disconnected');

  useEffect(() => subscribeEchoConnectionStatus(setStatus), []);

  const meta = STATUS_META[status] || STATUS_META.disconnected;

  return (
    <span
      className={`reverb-status-badge is-${meta.tone} ${className}`.trim()}
      title={`Real-time connection: ${status}`}
      aria-label={`Real-time status: ${meta.label}`}
    >
      <span className="reverb-status-dot" aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}

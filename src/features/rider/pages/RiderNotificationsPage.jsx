import { useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import useScenario from '../hooks/useScenario';
import { getRiderMock } from '../mocks';
import { notificationTypeGroups } from '../constants/notificationTypes';
import { formatRelativeTime } from '../utils/format';
import './RiderNotificationsPage.css';

export default function RiderNotificationsPage() {
  const scenario = useScenario();
  const source = getRiderMock('notifications', scenario);
  const [selectedType, setSelectedType] = useState('all');
  const [allRead, setAllRead] = useState(false);
  const viewState = scenario === 'active' ? 'ready' : scenario;

  const visibleNotifications = useMemo(() => source.filter((item) => selectedType === 'all' || item.type === selectedType), [selectedType, source]);
  const unreadCount = source.filter((item) => item.unread && !allRead).length;

  return (
    <div className="rider-page-shell">
      <PageHeader
        title="Notifications"
        subtitle="Stay up to date on your account, shifts, deliveries, and rider support."
        eyebrow="Updates"
        actions={<Button variant="outline" size="sm" onClick={() => setAllRead(true)} disabled={unreadCount === 0}>Mark all as read</Button>}
      />
      <StateView state={viewState} emptyTitle="No notifications" emptyMessage="New rider updates will appear here." onRetry={() => window.location.reload()}>
        <div className="rider-notification-filters" role="group" aria-label="Filter notifications by type">
          {notificationTypeGroups.map((group) => (
            <button
              type="button"
              key={group.key}
              className={selectedType === group.key ? 'is-selected' : ''}
              aria-pressed={selectedType === group.key}
              onClick={() => setSelectedType(group.key)}
            >
              {group.label}
            </button>
          ))}
        </div>
        {visibleNotifications.length === 0 ? (
          <div className="rider-notifications-empty">No notifications in this category.</div>
        ) : (
          <div className="rider-notification-list">
            {visibleNotifications.map((notice) => {
              const isUnread = notice.unread && !allRead;
              return (
                <Card key={notice.id} className={`rider-notification-card ${isUnread ? 'is-unread' : 'is-read'}`}>
                  <CardBody>
                    <span className="rider-notification-state">{isUnread ? 'Unread' : 'Read'}</span>
                    <div className="rider-notification-copy">
                      <div className="rider-notification-title-row">
                        <strong>{notice.title}</strong>
                        <span className="rider-notification-type">{notice.type}</span>
                      </div>
                      <p>{notice.message}</p>
                      <small>{formatRelativeTime(notice.time)}</small>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </StateView>
    </div>
  );
}

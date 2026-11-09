import { useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import { statusConfig } from '../constants/statusConfig';
import { getRiderMock } from '../mocks';
import { formatDate } from '../utils/format';
import useScenario from '../hooks/useScenario';
import './RiderSchedulePage.css';

export default function RiderSchedulePage() {
  const scenario = useScenario();
  const [view, setView] = useState('list');
  const shifts = useMemo(() => getRiderMock('shifts', scenario) || [], [scenario]);
  const calendar = useMemo(() => getRiderMock('scheduleCalendar', scenario) || [], [scenario]);

  return (
    <div className="rider-page-shell">
      <PageHeader title="Schedule & shifts" subtitle="View assignment windows and schedule changes." eyebrow="Your hours" />
      <StateView state={scenario === 'default' ? 'ready' : scenario} emptyTitle="No shifts available" emptyMessage="There are no assigned shifts in this preview." onRetry={() => window.location.reload()}>
        <Card>
          <CardBody>
            <div className="rider-schedule-toolbar">
              <div className="rider-segmented" role="tablist" aria-label="Schedule views">
                <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>List</button>
                <button type="button" className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>Calendar</button>
              </div>
              <Button variant="outline" size="sm">Request change</Button>
            </div>

            {view === 'list' ? (
              <div className="rider-shift-list">
                {shifts.map((shift) => (
                  <div key={`${shift.day}-${shift.date}`} className="rider-shift-row">
                    <div>
                      <strong>{shift.day}</strong>
                      <p>{formatDate(shift.date)}</p>
                    </div>
                    <div>
                      <strong>{shift.start} - {shift.end}</strong>
                      <p>{shift.zone}</p>
                    </div>
                    <StatusBadge status={shift.status || 'upcoming'} config={statusConfig.shiftStatuses} />
                    {shift.changed && <span className="rider-change-badge">Schedule changed</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rider-calendar-grid">
                {calendar.map((day) => (
                  <div key={day.day} className="rider-calendar-day">
                    <span>{day.day}</span>
                    <div className="rider-calendar-slot">{day.shift}</div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </StateView>
    </div>
  );
}

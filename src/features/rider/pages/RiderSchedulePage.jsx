import { useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import { statusConfig } from '../constants/statusConfig';
import { riderMockData } from '../mocks';
import useScenario from '../hooks/useScenario';
import './RiderSchedulePage.css';

const calendarDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function RiderSchedulePage() {
  const scenario = useScenario();
  const [view, setView] = useState('list');
  const shifts = useMemo(() => riderMockData.shifts || [], []);

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
                      <p>{shift.date}</p>
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
                {calendarDays.map((day, index) => (
                  <div key={day} className="rider-calendar-day">
                    <span>{day}</span>
                    <div className="rider-calendar-slot">
                      {index % 2 === 0 ? '08:00 - 17:00' : '12:00 - 20:00'}
                    </div>
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

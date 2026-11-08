import { useMemo, useState } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import { DesignPreviewBanner, PreviewDialog, PreviewPageHeader, PreviewStatePanel } from './team/r7Preview';
import { ACTIVITY_MODULES, ACTIVITY_SAMPLES, ACTIVITY_TYPES } from './team/activitySamples';
import './team/r7Activity.css';

function RoleLabel({ role }) {
  return <span className={`r7-role-label r7-role-${role.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{role === 'Owner' ? '♛ ' : ''}{role}</span>;
}

function ActivityDetail({ entry }) {
  if (!entry) return null;
  const keys = [...new Set([...Object.keys(entry.before), ...Object.keys(entry.after)])];
  return <div className="r7-activity-detail"><div className="r7-activity-person"><span className="r7-activity-avatar">{entry.user.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span><strong>{entry.user}</strong><small><RoleLabel role={entry.role} /></small></span></div>
    <dl className="r7-activity-metadata"><div><dt>When</dt><dd>{entry.date} · {entry.time}</dd></div><div><dt>Restaurant</dt><dd>Salo Kitchen · Uptown</dd></div><div><dt>Module</dt><dd>{entry.module}</dd></div><div><dt>Affected record</dt><dd>{entry.record}</dd></div></dl>
    <h3>Changed fields</h3><div className="r7-before-after"><section><h4>Before</h4>{keys.map((key) => <div key={key}><span>{key}</span><strong>{entry.before[key] ?? '—'}</strong></div>)}</section><section><h4>After</h4>{keys.map((key) => <div key={key}><span>{key}</span><strong>{entry.after[key] ?? '—'}</strong></div>)}</section></div>
    <p className="r7-history-note">This design preview presents sample audit details. Activity logs are a historical audit record, separate from notifications.</p>
  </div>;
}

export default function OwnerActivityPage() {
  const [previewState, setPreviewState] = useState('Sample data');
  const [search, setSearch] = useState('');
  const [person, setPerson] = useState('All people');
  const [type, setType] = useState('All activity types');
  const [module, setModule] = useState('All modules');
  const [dateRange, setDateRange] = useState('Last 30 days');
  const [selected, setSelected] = useState(null);
  const people = ['All people', ...new Set(ACTIVITY_SAMPLES.map((entry) => entry.user))];
  const filtered = useMemo(() => ACTIVITY_SAMPLES.filter((entry) =>
    (person === 'All people' || entry.user === person)
    && (type === 'All activity types' || entry.type === type)
    && (module === 'All modules' || entry.module === module)
    && `${entry.description} ${entry.user} ${entry.record} ${entry.module}`.toLowerCase().includes(search.toLowerCase())), [person, type, module, search]);

  return <OwnerLayout>
    <DesignPreviewBanner state={previewState} onStateChange={setPreviewState} />
    <PreviewPageHeader eyebrow="Restaurant history" title="Activity Logs" detail="Review notable changes and actions across this restaurant." />
    <PreviewStatePanel state={previewState} name="activity" onRetry={() => setPreviewState('Sample data')} />
    {previewState === 'Sample data' && <>
      <div className="r7-activity-filters"><label className="r7-activity-search"><span aria-hidden="true">⌕</span><span className="sr-only">Search activity</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search descriptions or records" /></label>
        <label>Person<select value={person} onChange={(event) => setPerson(event.target.value)}>{people.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Activity type<select value={type} onChange={(event) => setType(event.target.value)}>{ACTIVITY_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Module<select value={module} onChange={(event) => setModule(event.target.value)}>{ACTIVITY_MODULES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Date range<select value={dateRange} onChange={(event) => setDateRange(event.target.value)}>{['Today', 'Last 7 days', 'Last 30 days', 'Custom'].map((item) => <option key={item}>{item}</option>)}</select></label>
        {dateRange === 'Custom' && <><label>From<input type="date" aria-label="Activity start date" /></label><label>To<input type="date" aria-label="Activity end date" /></label></>}
      </div>
      {filtered.length ? <>
        <div className="r7-activity-table-wrap"><table className="r7-activity-table"><thead><tr><th>Activity</th><th>Person</th><th>Role</th><th>Module</th><th>Affected record</th><th>Date / time</th></tr></thead><tbody>{filtered.map((entry) => <tr key={entry.id} tabIndex="0" onClick={() => setSelected(entry)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(entry); } }} aria-label={`View details: ${entry.description}`}><td><strong>{entry.description}</strong><small>{entry.type}</small></td><td>{entry.user}</td><td><RoleLabel role={entry.role} /></td><td>{entry.module}</td><td>{entry.record}</td><td>{entry.date}<small>{entry.time}</small></td></tr>)}</tbody></table></div>
        <div className="r7-activity-cards">{filtered.map((entry) => <button type="button" className="r7-activity-card" key={entry.id} onClick={() => setSelected(entry)}><div><strong>{entry.description}</strong><span>{entry.date} · {entry.time}</span></div><div><span>{entry.user} · <RoleLabel role={entry.role} /></span><span>{entry.module} · {entry.record}</span></div><small>View details →</small></button>)}</div>
      </> : <div className="r7-state-panel r7-empty-state"><span aria-hidden="true">⌕</span><h2>No matching activity</h2><p>Change your filters or search terms to see more entries.</p></div>}
      <p className="r7-history-note">Activity Logs are a historical audit record, different from notifications. All entries on this page are design samples.</p>
    </>}
    <PreviewDialog open={Boolean(selected)} onClose={() => setSelected(null)} title="Activity details" drawer><ActivityDetail entry={selected} /></PreviewDialog>
  </OwnerLayout>;
}

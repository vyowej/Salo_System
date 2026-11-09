import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Button from '../../../components/common/Button';
import RiderLayout from '../../../layouts/RiderLayout';
import { riderMockData, riderPreviewState } from '../mocks';
import {
  AVAILABILITY_STATUSES,
  COD_STATUSES,
  FAILURE_REASONS,
  HISTORY_FILTERS,
  NOTIFICATION_TYPES,
  RIDER_PAGE_META,
  SETTINGS_SECTIONS,
  SUPPORT_CATEGORIES,
  SUPPORT_TICKET_STATUSES,
} from '../constants/riderConstants';
import {
  RiderCard,
  RiderLinkButton,
  RiderMetric,
  RiderPageHeading,
  RiderPreviewControls,
  RiderSelect,
  RiderStatePanel,
  RiderStatusBadge,
  RiderTimeline,
  RiderUploadField,
} from '../components/RiderUI';
import './RiderWorkspacePage.css';

const DATA = riderMockData;

function useScreenPreview() {
  const [state, setState] = useState(riderPreviewState.sample);
  return { state, setState };
}

function RiderPreview({ state, setState, data }) {
  return (
    <div className="rider-preview-bar">
      <span>{DATA.previewCopy.notConnected}</span>
      <RiderPreviewControls
        state={state}
        states={Object.values(riderPreviewState)}
        onChange={setState}
        label={DATA.previewCopy.stateLabel}
      />
      <RiderStatePanel state={state} data={DATA.previewCopy} onStateChange={setState} />
    </div>
  );
}

function Dashboard({ state, setState }) {
  const data = DATA.dashboard;
  const [available, setAvailable] = useState(data.availability);
  return (
    <>
      <RiderPageHeading eyebrow={RIDER_PAGE_META['/rider'].eyebrow} title={RIDER_PAGE_META['/rider'].title} description={DATA.previewCopy.notConnected} />
      <RiderPreview state={state} setState={setState} data={data} />
      {state !== riderPreviewState.sample && <RiderStatePanel state={state} data={DATA.previewCopy} onStateChange={setState} />}
      {state === riderPreviewState.sample && (
        <div className="rider-stack">
          <div className="rider-grid rider-dashboard-top">
            <RiderCard title={data.profileName} description={data.zone}>
              <div className="rider-stack">
                <div className="rider-inline"><RiderStatusBadge status={data.accountStatus} tone="success" /><RiderStatusBadge status={available} tone="neutral" /></div>
                <p className="rider-note">{'Current account and availability are illustrative sample values.'}</p>
                <label className="rider-switch-row">
                  <span>{'Driver Mode · visual toggle'}</span>
                  <button type="button" className="rider-switch" role="switch" aria-checked={available === 'Online and Available'} onClick={() => setAvailable((value) => value === 'Offline' ? 'Online and Available' : 'Offline')}>{available === 'Offline' ? 'Off' : 'On'}</button>
                </label>
                <div><strong>{'Current location'}</strong><p className="rider-card-description">{data.location.status} · {data.location.updatedAt}</p></div>
              </div>
            </RiderCard>
            <RiderCard title={'Current shift'} description={data.shift.zone}>
              <div className="rider-stack">
                <div className="rider-inline"><strong>{data.shift.date}</strong><RiderStatusBadge status={data.shift.status} /></div>
                <p>{data.shift.start} – {data.shift.end}</p>
                <RiderLinkButton to="/rider/schedule">{'View schedule'}</RiderLinkButton>
              </div>
            </RiderCard>
          </div>
          <div className="rider-metrics">
            {data.metrics.map((metric, index) => <RiderMetric key={metric.label} {...metric} tone={index === 1 ? 'success' : index === 2 ? 'warning' : 'default'} />)}
          </div>
          <RiderCard title={'Active delivery'} description={DATA.previewCopy.noAssignment}>
            <div className="rider-empty-state compact"><span className="rider-empty-icon" aria-hidden="true">⌁</span><strong>{DATA.previewCopy.noAssignment}</strong><RiderLinkButton to="/rider/jobs">{'Browse delivery offers'}</RiderLinkButton></div>
          </RiderCard>
          <div className="rider-grid">
            <RiderCard title={'Go Online checklist'} description={'Eligibility reasons are display-only and are not evaluated by this preview.'}>
              {data.eligibility.map((item) => <div key={item.label} className={`rider-check-row ${item.met ? 'is-met' : ''}`}><span className="rider-check-icon" aria-hidden="true">{item.met ? '✓' : '○'}</span><div><strong>{item.label}</strong><p className="rider-card-description">{item.reason}</p></div></div>)}
              <div className="rider-inline rider-status-wrap">{AVAILABILITY_STATUSES.map((status) => <RiderStatusBadge key={status} status={status} />)}</div>
            </RiderCard>
            <RiderCard title={'Recent notifications'} actions={<RiderLinkButton to="/rider/notifications">{'View all'}</RiderLinkButton>}>
              <div className="rider-list">{data.recentNotifications.map((notice) => <div className="rider-list-row" key={notice.title}><div><strong>{notice.title}</strong><p className="rider-card-description">{notice.detail}</p></div><span className="rider-card-description">{notice.time}</span></div>)}</div>
            </RiderCard>
          </div>
          <RiderCard title={'Quick actions'}>
            <div className="rider-inline">{data.quickActions.map((action) => <Button as={Link} to={action.href} key={action.href} variant="outline" size="sm">{action.label}</Button>)}</div>
          </RiderCard>
        </div>
      )}
    </>
  );
}

function Offers({ state, setState }) {
  const [message, setMessage] = useState('');
  return (
    <>
      <RiderPageHeading eyebrow={RIDER_PAGE_META['/rider/jobs'].eyebrow} title={RIDER_PAGE_META['/rider/jobs'].title} description={DATA.previewCopy.notConnected} />
      <RiderPreview state={state} setState={setState} data={DATA.offers} />
      {state !== riderPreviewState.sample && <RiderStatePanel state={state} data={DATA.previewCopy} onStateChange={setState} />}
      {state === riderPreviewState.sample && <div className="rider-stack">
        {message && <div className="rider-state-alert is-success" role="status">{message}</div>}
        {DATA.offers.length === 0 ? <div className="rider-empty-state">{DATA.previewCopy.noOffers}</div> : DATA.offers.map((offer) => (
          <RiderCard key={offer.id} title={offer.restaurant} description={offer.id} actions={<RiderStatusBadge status={offer.status} />}>
            <div className="rider-grid">
              <div className="rider-stack"><p><strong>{'Pickup'}</strong><br />{offer.pickup}</p><p><strong>{'Delivery area'}</strong><br />{offer.deliveryArea}</p><p><strong>{'Instructions'}</strong><br />{offer.instructions}</p></div>
              <div className="rider-stack"><p><strong>{'Distance'}</strong><br />{offer.distance}</p><p><strong>{'Estimated time'}</strong><br />{offer.eta}</p><p><strong>{'Compensation'}</strong><br />{offer.compensation}</p><p><strong>{'Payment type'}</strong><br />{offer.paymentType} {offer.cod && <RiderStatusBadge status={'COD'} tone="warning" />}</p>{offer.cod && <p>{offer.cod}</p>}</div>
            </div>
            <div className="rider-offer-footer"><div><strong>{offer.countdown}</strong><p className="rider-card-description">{'Offer expiration preview only'}</p></div><div className="rider-inline"><Button variant="primary" size="sm" onClick={() => setMessage('Offer acceptance preview · no assignment was made.')}>{'Accept · preview'}</Button><Button variant="outline" size="sm" onClick={() => setMessage('Offer decline preview · no dispatch update was sent.')}>{'Decline · preview'}</Button></div></div>
          </RiderCard>
        ))}
      </div>}
    </>
  );
}

function ActiveDelivery({ state, setState }) {
  const data = DATA.deliveryPreview;
  const [tab, setTab] = useState('Delivery');
  const [method, setMethod] = useState(data.proof.method);
  const [image, setImage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [reason, setReason] = useState(FAILURE_REASONS[0]);
  function previewFile(event) {
    const file = event.target.files?.[0];
    if (file) setImage(URL.createObjectURL(file));
  }
  return (
    <>
      <RiderPageHeading eyebrow={RIDER_PAGE_META['/rider/active'].eyebrow} title={RIDER_PAGE_META['/rider/active'].title} description={DATA.previewCopy.notConnected} />
      <RiderPreview state={state} setState={setState} data={data} />
      {state !== riderPreviewState.sample && <RiderStatePanel state={state} data={DATA.previewCopy} onStateChange={setState} />}
      {state === riderPreviewState.sample && <>
        <div className="rider-segmented" role="tablist" aria-label={'Delivery workspace sections'}>{['Delivery', 'Proof of delivery', 'Report a problem'].map((item) => <Button key={item} role="tab" aria-selected={tab === item} variant={tab === item ? 'primary' : 'outline'} size="sm" onClick={() => setTab(item)}>{item}</Button>)}</div>
        <div className="rider-stack rider-top-gap">
          {tab === 'Delivery' && <>
            <div className="rider-empty-state"><span className="rider-empty-icon" aria-hidden="true">⌁</span><strong>{DATA.previewCopy.noAssignment}</strong><span>{'When a delivery is assigned, its details and status timeline will appear here.'}</span></div>
            <RiderCard title={'Illustrative delivery layout'} description={data.id}>
              <div className="rider-inline rider-status-wrap">{data.statuses.map((status) => <RiderStatusBadge key={status} status={status} tone={status === data.activeStatus ? 'success' : 'neutral'} />)}</div>
              <div className="rider-grid rider-top-gap"><div><strong>{data.restaurant}</strong><p>{data.pickup}</p></div><div><strong>{data.customer}</strong><p>{data.dropoff}</p></div></div>
              <div className="rider-note">{data.instructions}</div>
              <div className="rider-inline rider-top-gap"><a className="rider-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.dropoff)}`} target="_blank" rel="noreferrer">{'Open in Maps'}</a><Button variant="outline" size="sm">{'Call customer'}</Button><Button variant="ghost" size="sm" onClick={() => setTab('Report a problem')}>{'Cannot reach customer'}</Button></div>
              <div className="rider-note rider-top-gap">{'Illustrative screen only. No turn-by-turn navigation is provided.'}</div>
            </RiderCard>
          </>}
          {tab === 'Proof of delivery' && <RiderCard title={'Proof of delivery'} description={DATA.previewCopy.disabledComplete}>
            <div className="rider-stack">
              <div className="rider-segmented">{['Hand to customer', 'Contactless'].map((item) => <Button key={item} variant={method === item ? 'primary' : 'outline'} size="sm" onClick={() => setMethod(item)}>{item}</Button>)}</div>
              <RiderUploadField label={'Delivery photo'} accept="image/*" onChange={previewFile} preview={image} hint={DATA.previewCopy.previewUpload} />
              <label className="rider-field"><span>{'Recipient name'}</span><input aria-label={'Recipient name'} placeholder={data.proof.recipient} /></label>
              <label className="rider-field"><span>{'Delivery PIN · optional'}</span><input inputMode="numeric" placeholder={data.proof.pin || 'Optional PIN'} /></label>
              <div className="rider-note">{DATA.previewCopy.disabledComplete}</div>
              <Button variant="primary" disabled>{'Complete delivery'}</Button>
            </div>
          </RiderCard>}
          {tab === 'Report a problem' && <RiderCard title={'Report a delivery problem'} description={DATA.support.emergency.guidance}>
            {submitted ? <div className="rider-status-banner tone-warning"><strong>{'Under Admin review'}</strong><span>{'This report is a local visual confirmation only.'}</span></div> : <div className="rider-stack">
              <RiderSelect id="rider-failure-reason" label={'Reason'} options={FAILURE_REASONS} value={reason} onChange={(event) => setReason(event.target.value)} />
              <label className="rider-field"><span>{'Explanation'}</span><textarea placeholder={'Describe the delivery issue'} /></label>
              <RiderUploadField label={'Attach supporting photo'} accept="image/*" onChange={previewFile} preview={image} hint={DATA.previewCopy.previewUpload} />
              <Button variant="primary" onClick={() => setSubmitted(true)}>{'Submit report preview'}</Button>
            </div>}
            <div className="rider-note rider-danger rider-top-gap"><strong>{DATA.support.emergency.title}</strong><p>{DATA.support.emergency.contact}</p><Button variant="outline">{'Open emergency support preview'}</Button></div>
          </RiderCard>}
        </div>
      </>}
    </>
  );
}

function Schedule({ state, setState }) {
  const [selected, setSelected] = useState(DATA.shifts[0]);
  return <>
    <RiderPageHeading eyebrow={RIDER_PAGE_META['/rider/schedule'].eyebrow} title={RIDER_PAGE_META['/rider/schedule'].title} description={DATA.previewCopy.notConnected} />
    <RiderPreview state={state} setState={setState} data={DATA.shifts} />
    {state !== riderPreviewState.sample ? <RiderStatePanel state={state} data={DATA.previewCopy} onStateChange={setState} /> : <div className="rider-grid">
      <RiderCard title={'Calendar view'} description={'Schedule dates use Asia/Manila time when connected to real data.'}>
        <div className="rider-calendar">{DATA.shifts.map((shift) => <button key={shift.day} className={`rider-calendar-day ${selected.day === shift.day ? 'is-selected' : ''}`} onClick={() => setSelected(shift)}><strong>{shift.day}</strong><span>{shift.date}</span></button>)}</div>
      </RiderCard>
      <RiderCard title={'Shift details'} actions={selected.changed && <RiderStatusBadge status={'Schedule changed'} tone="warning" />}>
        <div className="rider-stack"><strong>{selected.day}</strong><span>{selected.start} – {selected.end}</span><span>{selected.zone}</span><RiderStatusBadge status={selected.status} /><Button variant="outline" size="sm">{'Request schedule change · preview'}</Button></div>
      </RiderCard>
      <RiderCard title={'Assigned shifts'}><div className="rider-list">{DATA.shifts.map((shift) => <button type="button" className="rider-list-row rider-list-button" key={shift.day} onClick={() => setSelected(shift)}><span><strong>{shift.day}</strong><small>{shift.date} · {shift.zone}</small></span><RiderStatusBadge status={shift.status} /></button>)}</div></RiderCard>
    </div>}
  </>;
}

function MapTracking({ state, setState }) {
  const data = DATA.map;
  return <>
    <RiderPageHeading eyebrow={RIDER_PAGE_META['/rider/map'].eyebrow} title={RIDER_PAGE_META['/rider/map'].title} description={DATA.previewCopy.notConnected} />
    <RiderPreview state={state} setState={setState} data={data} />
    {state !== riderPreviewState.sample ? <RiderStatePanel state={state} data={DATA.previewCopy} onStateChange={setState} /> : <div className="rider-stack">
      <div className="rider-note rider-warning" role="status">{data.warning} · {data.lastUpdated}</div>
      <RiderCard title={'Location permission'} description={DATA.previewCopy.locationPermission}><Button variant="outline">{'Review location permission'}</Button><p className="rider-card-description">{data.permission}</p></RiderCard>
      <RiderCard title={'Active delivery map preview'} description={'Illustrative map panel · not live tracking'}>
        <div className="rider-map-preview" role="img" aria-label={'Non-live map preview with pickup, rider, and drop-off markers'}>
          <span className="rider-map-marker pickup">{data.pickupLabel}</span><span className="rider-map-marker rider">{data.riderLabel}</span><span className="rider-map-marker dropoff">{data.dropoffLabel}</span>
        </div>
      </RiderCard>
    </div>}
  </>;
}

function Earnings({ state, setState }) {
  return <>
    <RiderPageHeading eyebrow={RIDER_PAGE_META['/rider/earnings'].eyebrow} title={RIDER_PAGE_META['/rider/earnings'].title} description={DATA.previewCopy.notConnected} />
    <RiderPreview state={state} setState={setState} data={DATA.earnings} />
    {state !== riderPreviewState.sample ? <RiderStatePanel state={state} data={DATA.previewCopy} onStateChange={setState} /> : <div className="rider-stack">
      <div className="rider-metrics">{DATA.earnings.summaries.map((item) => <RiderMetric key={item.label} {...item} tone="success" />)}</div>
      <RiderCard title={'Earnings trend'} description={'Illustrative CSS chart · no financial data is being calculated'}>
        <div className="rider-chart" role="img" aria-label={'Illustrative seven-period earnings chart'}>{DATA.earnings.chart.map((item) => <div className="rider-chart-column" key={item.label}><span className="rider-chart-bar" style={{ height: `${Math.max(4, item.amount)}%` }} /><span>{item.label}</span></div>)}</div>
      </RiderCard>
      <RiderCard title={'Earnings records'}><div className="rider-table-wrap"><table className="rider-table"><thead><tr>{['Delivery', 'Date', 'Compensation', 'Incentives', 'Tips', 'Adjustments', 'Payout status'].map((item) => <th key={item}>{item}</th>)}</tr></thead><tbody>{DATA.earnings.records.map((item) => <tr key={item.delivery}><td>{item.delivery}</td><td>{item.date}</td><td>{item.compensation}</td><td>{item.incentive}</td><td>{item.tip}</td><td>{item.adjustment}</td><td>{item.payoutStatus}</td></tr>)}</tbody></table></div></RiderCard>
      <div className="rider-grid"><RiderCard title={'Payout method'}><p>{DATA.earnings.payoutMethod}</p></RiderCard><RiderCard title={'Payout history'}>{DATA.earnings.payoutHistory.map((item) => <div className="rider-list-row" key={item.reference}><span>{item.reference} · {item.date}</span><span>{item.amount} · {item.status}</span></div>)}</RiderCard></div>
      <CodPanel />
    </div>}
  </>;
}

function CodPanel() {
  return <RiderCard title={'Cash on Delivery'} description={DATA.cod.incomeNote}>
    <div className="rider-grid"><div className="rider-stack"><span>{'COD balance · not income'}</span><strong className="rider-large-value">{DATA.cod.balance}</strong><span>{'Amount to collect · read only'}</span><strong>{DATA.cod.collectionAmount}</strong><RiderStatusBadge status={DATA.cod.collectionStatus} /></div><div className="rider-stack">{DATA.cod.statuses.map((status) => <RiderStatusBadge key={status} status={status} />)}</div></div>
    <div className="rider-table-wrap rider-top-gap"><table className="rider-table"><thead><tr>{['Remittance', 'Date', 'Amount', 'Status'].map((item) => <th key={item}>{item}</th>)}</tr></thead><tbody>{DATA.cod.history.map((item) => <tr key={item.reference}><td>{item.reference}</td><td>{item.date}</td><td>{item.amount}</td><td><RiderStatusBadge status={DATA.previewCopy.pendingAdmin} tone="warning" /></td></tr>)}</tbody></table></div>
    <p className="rider-note rider-warning">{DATA.cod.riderNotice}</p>
  </RiderCard>;
}

function History({ state, setState }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(HISTORY_FILTERS.statuses[0]);
  const [paymentType, setPaymentType] = useState(HISTORY_FILTERS.paymentTypes[0]);
  const [codStatus, setCodStatus] = useState(HISTORY_FILTERS.codStatuses[0]);
  const [selected, setSelected] = useState(null);
  const filtered = useMemo(() => DATA.history.filter((item) => (status === HISTORY_FILTERS.statuses[0] || item.status === status) && (paymentType === HISTORY_FILTERS.paymentTypes[0] || item.paymentType === paymentType) && (codStatus === HISTORY_FILTERS.codStatuses[0] || item.codStatus === codStatus) && `${item.id} ${item.restaurant} ${item.area}`.toLowerCase().includes(query.toLowerCase())), [status, paymentType, codStatus, query]);
  return <>
    <RiderPageHeading eyebrow={RIDER_PAGE_META['/rider/history'].eyebrow} title={RIDER_PAGE_META['/rider/history'].title} description={DATA.previewCopy.notConnected} />
    <RiderPreview state={state} setState={setState} data={DATA.history} />
    {state !== riderPreviewState.sample ? <RiderStatePanel state={state} data={DATA.previewCopy} onStateChange={setState} /> : <RiderCard title={'Delivery records'}>
      <div className="rider-filter-grid">
        <label className="rider-field"><span>{'Search'}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={'Search records'} /></label>
        <RiderSelect id="history-date-range" label={'Date range'} options={HISTORY_FILTERS.dateRanges} value={HISTORY_FILTERS.dateRanges[0]} onChange={() => {}} />
        <RiderSelect id="history-status" label={'Status'} options={HISTORY_FILTERS.statuses} value={status} onChange={(event) => setStatus(event.target.value)} />
        <RiderSelect id="history-restaurant" label={'Restaurant'} options={HISTORY_FILTERS.restaurants.concat([...new Set(DATA.history.map((item) => item.restaurant))])} value={HISTORY_FILTERS.restaurants[0]} onChange={() => {}} />
        <RiderSelect id="history-payment" label={'Payment type'} options={HISTORY_FILTERS.paymentTypes} value={paymentType} onChange={(event) => setPaymentType(event.target.value)} />
        <RiderSelect id="history-cod" label={'COD status'} options={HISTORY_FILTERS.codStatuses} value={codStatus} onChange={(event) => setCodStatus(event.target.value)} />
      </div>
      {filtered.length === 0 ? <div className="rider-empty-state">{DATA.previewCopy.noHistory}</div> : <div className="rider-history-list rider-top-gap">{filtered.map((item) => <button key={item.id} type="button" className="rider-history-row" onClick={() => setSelected(item)}><span><strong>{item.id}</strong><small>{item.restaurant} · {item.date} · {item.area}</small></span><span className="rider-inline"><RiderStatusBadge status={item.status} /><span>{item.compensation}</span></span></button>)}</div>}
      {selected && <div className="rider-detail-panel" role="dialog" aria-label={'Delivery record detail'}><div className="rider-inline"><h3>{selected.id}</h3><Button variant="ghost" size="sm" onClick={() => setSelected(null)}>{'Close'}</Button></div><RiderTimeline items={selected.timeline} /><h4>{'Proof of delivery'}</h4><p>{selected.proof}</p></div>}
    </RiderCard>}
  </>;
}

function Notifications({ state, setState }) {
  const [type, setType] = useState(NOTIFICATION_TYPES[0]);
  const [items, setItems] = useState(DATA.notifications);
  const filtered = items.filter((item) => type === NOTIFICATION_TYPES[0] || item.type === type);
  return <>
    <RiderPageHeading eyebrow={RIDER_PAGE_META['/rider/notifications'].eyebrow} title={RIDER_PAGE_META['/rider/notifications'].title} description={DATA.previewCopy.notConnected} />
    <RiderPreview state={state} setState={setState} data={DATA.notifications} />
    {state !== riderPreviewState.sample ? <RiderStatePanel state={state} data={DATA.previewCopy} onStateChange={setState} /> : <RiderCard title={'Notification center'} actions={<RiderSelect id="notification-type" label={'Type'} options={NOTIFICATION_TYPES} value={type} onChange={(event) => setType(event.target.value)} />}>
      {filtered.length ? <div className="rider-list">{filtered.map((item) => <article key={item.id} className={`rider-notification ${item.unread ? 'is-unread' : ''}`}><div className="rider-inline"><RiderStatusBadge status={item.type} /><span>{item.time}</span>{item.unread && <Badge variant="primary" size="sm">{'Unread'}</Badge>}</div><h3>{item.title}</h3><p>{item.message}</p><Button variant="ghost" size="sm" onClick={() => setItems((all) => all.map((notice) => notice.id === item.id ? { ...notice, unread: false } : notice))}>{item.unread ? 'Mark as read' : 'Read'}</Button></article>)}</div> : <div className="rider-empty-state">{DATA.previewCopy.noNotifications}</div>}
    </RiderCard>}
  </>;
}

function Support({ state, setState }) {
  const [category, setCategory] = useState(SUPPORT_CATEGORIES[0]);
  const [sent, setSent] = useState(false);
  const [selected, setSelected] = useState(DATA.support.tickets[0]);
  const [attachment, setAttachment] = useState('');
  return <>
    <RiderPageHeading eyebrow={RIDER_PAGE_META['/rider/support'].eyebrow} title={RIDER_PAGE_META['/rider/support'].title} description={DATA.previewCopy.notConnected} />
    <RiderPreview state={state} setState={setState} data={DATA.support} />
    {state !== riderPreviewState.sample ? <RiderStatePanel state={state} data={DATA.previewCopy} onStateChange={setState} /> : <div className="rider-grid">
      <RiderCard title={'Submit a support request'} description={DATA.previewCopy.previewUpload}>
        {sent ? <div className="rider-state-alert is-success" role="status"><strong>{'Request preview created'}</strong><span>{'No ticket was sent or saved.'}</span></div> : <div className="rider-stack">
          <RiderSelect id="support-category" label={'Category'} options={SUPPORT_CATEGORIES} value={category} onChange={(event) => setCategory(event.target.value)} />
          <label className="rider-field"><span>{'Related delivery reference · optional'}</span><input placeholder={'Enter a delivery reference'} /></label>
          <label className="rider-field"><span>{'Description'}</span><textarea placeholder={'Describe how support can help'} /></label>
          <RiderUploadField label={'Attachment'} accept="image/*,.pdf" onChange={(event) => setAttachment(event.target.files?.[0]?.name || '')} hint={attachment || DATA.previewCopy.previewUpload} />
          <Button variant="primary" onClick={() => setSent(true)}>{'Submit request preview'}</Button>
        </div>}
      </RiderCard>
      <RiderCard title={'Support tickets'}>
        {DATA.support.tickets.length ? <div className="rider-list">{DATA.support.tickets.map((ticket) => <button className="rider-list-row rider-list-button" key={ticket.id} onClick={() => setSelected(ticket)}><span><strong>{ticket.subject}</strong><small>{ticket.category} · {ticket.updated}</small></span><RiderStatusBadge status={ticket.status} /></button>)}</div> : <div className="rider-empty-state">{DATA.previewCopy.noTicket}</div>}
        {selected && <div className="rider-detail-panel"><div className="rider-inline"><strong>{selected.id}</strong><RiderStatusBadge status={selected.status} /></div>{selected.thread.map((message) => <p className="rider-note" key={message.message}><strong>{message.author}</strong><br />{message.message}<br />{message.time}</p>)}<label className="rider-field"><span>{'Reply preview'}</span><textarea placeholder={'Write a reply'} /></label><Button variant="outline" size="sm">{'Send reply preview'}</Button></div>}
      </RiderCard>
      <RiderCard title={DATA.support.emergency.title} className="rider-danger"><p>{DATA.support.emergency.contact}</p><p>{DATA.support.emergency.guidance}</p><div className="rider-inline"><Button variant="danger-outline">{'Emergency support'}</Button><span>{SUPPORT_TICKET_STATUSES.join(' · ')}</span></div></RiderCard>
    </div>}
  </>;
}

function ProfileSettings({ state, setState, settings = false }) {
  const profile = DATA.profile;
  const [vehicleChange, setVehicleChange] = useState(false);
  const [toggles, setToggles] = useState({});
  const [image, setImage] = useState(profile.photo);
  const page = settings ? '/rider/settings' : '/rider/profile';
  return <>
    <RiderPageHeading eyebrow={RIDER_PAGE_META[page].eyebrow} title={RIDER_PAGE_META[page].title} description={DATA.previewCopy.notConnected} />
    <RiderPreview state={state} setState={setState} data={profile} />
    {state !== riderPreviewState.sample ? <RiderStatePanel state={state} data={DATA.previewCopy} onStateChange={setState} /> : settings ? <div className="rider-stack">
      {SETTINGS_SECTIONS.map((section) => <RiderCard key={section} title={section}>
        {section === SETTINGS_SECTIONS[0] ? ['Delivery offers', 'Shift reminders', 'Application updates', 'COD reminders'].map((item) => <label className="rider-setting-row" key={item}><span>{item}</span><button type="button" role="switch" aria-checked={Boolean(toggles[item])} className="rider-switch" onClick={() => setToggles((all) => ({ ...all, [item]: !all[item] }))}>{toggles[item] ? 'On' : 'Off'}</button></label>) : section === SETTINGS_SECTIONS[1] ? <div className="rider-stack"><label className="rider-field"><span>{'Current password'}</span><input type="password" autoComplete="current-password" /></label><label className="rider-field"><span>{'New password'}</span><input type="password" autoComplete="new-password" /></label><Button variant="outline">{'Update password preview'}</Button></div> : <div className="rider-note">{section === SETTINGS_SECTIONS[2] ? DATA.previewCopy.locationPermission : section === SETTINGS_SECTIONS[5] ? 'Sign out from the rider workspace.' : 'Information is shown as a design preview.'}</div>}
      </RiderCard>)}
    </div> : <div className="rider-grid">
      <RiderCard title={'Rider profile'} description={profile.email}>
        <div className="rider-profile-header"><div className="rider-photo">{image ? <img src={image} alt={profile.name} /> : profile.initials}</div><div><h2>{profile.name}</h2><RiderStatusBadge status={profile.accountStatus} tone="success" /></div></div>
        <div className="rider-stack rider-top-gap"><p>{profile.phone}</p><p>{profile.address}</p><p>{profile.zone}</p><RiderUploadField label={'Profile photo'} accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) setImage(URL.createObjectURL(file)); }} preview={image} hint={DATA.previewCopy.previewUpload} /></div>
      </RiderCard>
      <RiderCard title={'Vehicle & documents'} description={profile.vehicleType}>
        <div className="rider-stack"><p>{profile.vehicle}</p><p>{profile.plate}</p><p>{profile.license}</p><p>{profile.governmentId}</p><RiderStatusBadge status={vehicleChange ? 'Pending review' : 'No pending vehicle change'} tone={vehicleChange ? 'warning' : 'neutral'} /><Button variant="outline" onClick={() => setVehicleChange(true)}>{'Request vehicle change · preview'}</Button><RiderUploadField label={'Document preview'} accept="image/*,.pdf" onChange={() => {}} hint={DATA.previewCopy.previewUpload} /></div>
      </RiderCard>
    </div>}
  </>;
}

function Safety({ state, setState }) {
  return <>
    <RiderPageHeading eyebrow={RIDER_PAGE_META['/rider/safety'].eyebrow} title={RIDER_PAGE_META['/rider/safety'].title} description={DATA.previewCopy.notConnected} />
    <RiderPreview state={state} setState={setState} data={DATA.safety} />
    {state !== riderPreviewState.sample ? <RiderStatePanel state={state} data={DATA.previewCopy} onStateChange={setState} /> : <div className="rider-stack">
      <div className="rider-note rider-danger"><strong>{DATA.safety.drivingNotice}</strong></div>
      <RiderCard title={'Road-safety guidelines'}><div className="rider-grid">{DATA.safety.guidelines.map((item) => <article className="rider-panel" key={item.title}><h3>{item.title}</h3><p>{item.detail}</p></article>)}</div></RiderCard>
      <RiderCard title={'Document & equipment reminders'}><div className="rider-list">{DATA.safety.reminders.map((item) => <div className="rider-list-row" key={item.title}><span><strong>{item.title}</strong><small>{item.detail}</small></span><RiderStatusBadge status={item.status} tone="warning" /></div>)}</div></RiderCard>
      <RiderCard title={'Emergency contacts'}><div className="rider-list">{DATA.safety.emergencyContacts.map((item) => <div className="rider-list-row" key={item.title}><strong>{item.title}</strong><span>{item.value}</span></div>)}</div><Button as={Link} to="/rider/support" variant="danger-outline">{'Open safety support'}</Button></RiderCard>
    </div>}
  </>;
}

function RouteContent({ state, setState }) {
  const { pathname } = useLocation();
  if (pathname === '/rider/jobs') return <Offers state={state} setState={setState} />;
  if (pathname === '/rider/active') return <ActiveDelivery state={state} setState={setState} />;
  if (pathname === '/rider/map') return <MapTracking state={state} setState={setState} />;
  if (pathname === '/rider/schedule') return <Schedule state={state} setState={setState} />;
  if (pathname === '/rider/earnings') return <Earnings state={state} setState={setState} />;
  if (pathname === '/rider/history') return <History state={state} setState={setState} />;
  if (pathname === '/rider/notifications') return <Notifications state={state} setState={setState} />;
  if (pathname === '/rider/support') return <Support state={state} setState={setState} />;
  if (pathname === '/rider/profile') return <ProfileSettings state={state} setState={setState} />;
  if (pathname === '/rider/settings') return <ProfileSettings state={state} setState={setState} settings />;
  if (pathname === '/rider/safety') return <Safety state={state} setState={setState} />;
  return <Dashboard state={state} setState={setState} />;
}

export default function RiderWorkspacePage() {
  const { state, setState } = useScreenPreview();
  return <RiderLayout><RouteContent state={state} setState={setState} /></RiderLayout>;
}

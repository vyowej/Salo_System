import { useLocation } from 'react-router-dom';
import Button from '../../../components/common/Button';
import RiderLayout from '../../../layouts/RiderLayout';
import { RiderCard, RiderPageHeading, RiderStatusBadge, RiderTimeline } from '../components/RiderUI';
import { RIDER_APPLICATION_STATUSES, RIDER_PAGE_META } from '../constants/riderConstants';
import { riderMockData } from '../mocks';
import './RiderApplicationPage.css';

export default function RiderApplicationStatusPage() {
  const { pathname } = useLocation();
  const accountPage = pathname === '/rider/account';
  const appData = riderMockData.application;
  const currentStatus = riderMockData.profile.applicationStatus;
  const currentAccount = riderMockData.profile.accountStatus;
  return (
    <RiderLayout>
      <RiderPageHeading
        eyebrow={RIDER_PAGE_META[accountPage ? '/rider/account' : '/rider/application/status'].eyebrow}
        title={RIDER_PAGE_META[accountPage ? '/rider/account' : '/rider/application/status'].title}
        description={riderMockData.previewCopy.notConnected}
      />
      {accountPage ? <div className="rider-stack">
        {appData.accountStates.map((item) => <RiderCard key={item.label} title={item.label} className={`rider-account-state tone-${item.tone}`}>
          <p>{item.detail}</p>
          {item.label === 'Approved · Awaiting activation' && <>
            <label className="rider-field"><span>{'One-time verification code'}</span><input inputMode="numeric" autoComplete="one-time-code" aria-label={'One-time verification code'} placeholder={'Enter verification code'} /></label>
            <div className="rider-inline rider-top-gap"><Button variant="primary">{'Verify preview'}</Button><Button variant="ghost">{'Resend code preview'}</Button></div>
          </>}
        </RiderCard>)}
      </div> : <div className="rider-grid">
        <RiderCard title={'Current application status'} description={riderMockData.profile.email} actions={<RiderStatusBadge status={currentStatus} tone="warning" />}>
          <div className="rider-status-banner tone-warning"><strong>{currentStatus}</strong><span>{appData.requestedInformation}</span></div>
          <div className="rider-top-gap"><RiderTimeline items={appData.statuses.map((item) => ({ label: item.status, time: item.date, note: item.note, complete: item.status === 'Submitted' }))} active={currentStatus} /></div>
          {currentStatus === RIDER_APPLICATION_STATUSES[3] && <div className="rider-stack"><label className="rider-field"><span>{'Response to requested information'}</span><textarea placeholder={appData.requestedInformation} /></label><Button variant="primary">{'Resubmit information preview'}</Button></div>}
          <Button as="a" href="/rider/application" variant="outline">{'Review application preview'}</Button>
        </RiderCard>
        <RiderCard title={'Account state'}><div className="rider-stack">{appData.accountStates.map((item) => <div key={item.label} className={`rider-status-banner tone-${item.tone}`}><div className="rider-inline"><RiderStatusBadge status={item.label} tone={item.tone} />{item.label === currentAccount && <strong>{'Current preview state'}</strong>}</div><span>{item.detail}</span></div>)}</div></RiderCard>
      </div>}
    </RiderLayout>
  );
}

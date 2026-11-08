import { useEffect, useMemo, useRef, useState } from 'react';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import OwnerLayout from '../../../layouts/OwnerLayout';
import {
  OWNER_MEMBERSHIPS,
  OWNERSHIP_INVITATIONS,
  PERMISSION_GROUPS,
  POSITION_OPTIONS,
  STAFF_INVITATIONS,
  STAFF_SEARCH_SAMPLES,
  STAFF_SAMPLES,
  TEAM_PREVIEW_STATES,
} from './team/teamSamples';
import './team/TeamAndStaffPage.css';

const TABS = ['Staff', 'Invitations', 'Owners'];
const initialsFromName = (name = '') => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

function Avatar({ name, initials, color = 'coral', large = false }) {
  return <span className={`team-avatar team-avatar-${color} ${large ? 'team-avatar-large' : ''}`} aria-label={`${name} profile`}>{initials || initialsFromName(name)}</span>;
}

function PreviewStatePicker({ value, onChange }) {
  if (!import.meta.env.DEV) return null;
  return (
    <label className="team-preview-state">
      <span>Preview state</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="Choose design preview state">
        {TEAM_PREVIEW_STATES.map((state) => <option key={state}>{state}</option>)}
      </select>
    </label>
  );
}

function PreviewState({ state, type, onRetry }) {
  if (state === 'Loading') {
    return <div className="team-state-card" aria-label="Loading preview">
      {[0, 1, 2].map((item) => <div className="team-skeleton-row" key={item}><span /><div><i /><i /></div><i /></div>)}
    </div>;
  }
  if (state === 'Empty') {
    return <div className="team-state-card team-empty-state"><span className="team-empty-icon" aria-hidden="true">✦</span><h2>No {type} yet</h2><p>When there’s something to show, it will appear here.</p><Button variant="outline">Explore the preview</Button></div>;
  }
  if (state === 'Error') {
    return <div className="team-state-card team-error-state" role="alert"><span className="team-empty-icon" aria-hidden="true">!</span><h2>This preview couldn’t load</h2><p>This sample state demonstrates how an error message will appear.</p><Button variant="outline" onClick={onRetry}>Try again</Button></div>;
  }
  return null;
}

function PreviewDialog({ open, onClose, title, children, className = '', role = 'dialog' }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    const focusable = () => [...panel.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
    (focusable()[0] || panel)?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...panelRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
    if (!items.length) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="team-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} className={`team-dialog ${className}`} role={role} aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={handleKeyDown}>
        <header className="team-dialog-header">
          <div><p className="team-eyebrow">SALO · DESIGN PREVIEW</p><h2>{title}</h2></div>
          <button type="button" className="team-close-button" onClick={onClose} aria-label={`Close ${title}`}>×</button>
        </header>
        <div className="team-dialog-content">{children}</div>
      </section>
    </div>
  );
}

function SectionHeading({ eyebrow, title, detail, action }) {
  return <div className="team-section-heading"><div><p className="team-eyebrow">{eyebrow}</p><h2>{title}</h2>{detail && <p className="team-muted">{detail}</p>}</div>{action}</div>;
}

function StaffPage({ staff, onOpenStaff, onInvite }) {
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState('All positions');
  const [actionMenu, setActionMenu] = useState('');
  const filtered = useMemo(() => staff.filter((member) => (
    (!query || `${member.name} ${member.username} ${member.email}`.toLowerCase().includes(query.toLowerCase()))
    && (position === 'All positions' || member.position === position)
  )), [staff, query, position]);

  return (
    <>
      <SectionHeading eyebrow="Restaurant team" title="Staff" detail="People and access assigned to this restaurant." action={<Button onClick={onInvite} leftIcon={<span aria-hidden="true">＋</span>}>Invite staff</Button>} />
      <div className="team-toolbar">
        <label className="team-search"><span className="sr-only">Search staff</span><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, username, or email" /></label>
        <label className="team-filter"><span className="sr-only">Filter by position</span><select value={position} onChange={(event) => setPosition(event.target.value)}><option>All positions</option>{POSITION_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      {filtered.length ? (
        <div className="team-table-wrap">
          <table className="team-table">
            <thead><tr><th>Staff member</th><th>Position</th><th>Responsibilities</th><th>Status</th><th>Date joined</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{filtered.map((member) => (
              <tr key={member.id}>
                <td><div className="team-person"><Avatar {...member} /><span><strong>{member.name}</strong><small>{member.username} · {member.email}</small></span></div></td>
                <td><span className="team-position-badge">{member.position}</span></td>
                <td><div className="team-chip-list">{member.responsibilities.map((item) => <span className="team-chip" key={item}>{item}</span>)}</div></td>
                <td><Badge status={member.status.toLowerCase()}>{member.status}</Badge></td>
                <td>{member.joined}</td>
                <td><div className="team-row-action"><button type="button" className="team-more-button" aria-label={`Actions for ${member.name}`} aria-expanded={actionMenu === member.id} onClick={() => setActionMenu(actionMenu === member.id ? '' : member.id)}>•••</button>
                  {actionMenu === member.id && <div className="team-action-menu" role="group" aria-label={`${member.name} actions`}>
                    {['View details', 'Change position', 'Update permissions', 'Suspend access', 'Remove'].map((item) => <button key={item} type="button" onClick={() => { setActionMenu(''); onOpenStaff(member, item); }}>{item}</button>)}
                  </div>}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
          <div className="team-mobile-cards">{filtered.map((member) => <article className="team-staff-card" key={member.id}>
            <div className="team-staff-card-head"><div className="team-person"><Avatar {...member} /><span><strong>{member.name}</strong><small>{member.username}</small></span></div><Badge status={member.status.toLowerCase()}>{member.status}</Badge></div>
            <div className="team-card-detail"><span>Position</span><span className="team-position-badge">{member.position}</span></div>
            <div className="team-card-detail"><span>Responsibilities</span><div className="team-chip-list">{member.responsibilities.map((item) => <span className="team-chip" key={item}>{item}</span>)}</div></div>
            <div className="team-card-detail"><span>Date joined</span><span>{member.joined}</span></div>
            <Button variant="outline" size="sm" onClick={() => onOpenStaff(member, 'View details')}>View details & access</Button>
          </article>)}</div>
        </div>
      ) : <div className="team-state-card team-empty-state"><h2>No staff match those filters</h2><p>Try another name or position.</p></div>}
      <p className="team-footnote">Staff access is separate from ownership membership.</p>
    </>
  );
}

function StaffDetails({ member, onClose, mode, onConfirmAction }) {
  const [position, setPosition] = useState(member.position);
  const [permissions, setPermissions] = useState(() => new Set(member.permissions));
  const [confirmAction, setConfirmAction] = useState(['Suspend access', 'Remove'].includes(mode) ? mode : '');
  const togglePermission = (key) => setPermissions((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <PreviewDialog open onClose={onClose} title={mode || 'Staff details'} className="team-drawer">
      <div className="team-profile-header"><Avatar {...member} large /><div><h3>{member.name}</h3><p>{member.username} · {member.email}</p><Badge status={member.status.toLowerCase()}>{member.status}</Badge></div></div>
      <label className="team-field"><span>Position</span><select value={position} onChange={(event) => setPosition(event.target.value)}>{POSITION_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <div className="team-info-note"><span aria-hidden="true">ⓘ</span><p>Staff permissions never grant ownership.</p></div>
      <div className="team-subsection-heading"><div><h3>Permission matrix</h3><p>Choose access by restaurant function.</p></div></div>
      <div className="team-presets" aria-label="Position presets">{['Manager', 'Order Handler', 'Reservation Handler', 'Inventory Manager', 'Menu Manager'].map((item) => <button type="button" className={position === item ? 'active' : ''} key={item} onClick={() => setPosition(item)}>{item}</button>)}</div>
      <div className="team-permission-groups">{PERMISSION_GROUPS.map((group) => {
        const enabled = group.permissions.filter(([key]) => permissions.has(key)).length;
        const allEnabled = enabled === group.permissions.length;
        return <section className="team-permission-group" key={group.name}>
          <header><div><h4>{group.name}</h4><span>{enabled} of {group.permissions.length} enabled</span></div><button type="button" className="team-text-button" onClick={() => setPermissions((current) => {
            const next = new Set(current);
            group.permissions.forEach(([key]) => allEnabled ? next.delete(key) : next.add(key));
            return next;
          })}>{allEnabled ? 'Clear all' : 'Select all'}</button></header>
          {group.permissions.map(([key, label]) => <label className="team-permission-row" key={key}><span>{label}</span><input type="checkbox" role="switch" checked={permissions.has(key)} onChange={() => togglePermission(key)} aria-label={label} /></label>)}
        </section>;
      })}</div>
      <section className="team-danger-zone"><div><p className="team-eyebrow">Danger zone</p><h3>Staff access</h3><p>These actions do not affect ownership.</p></div><div className="team-danger-actions">
        <Button variant="danger-outline" onClick={() => setConfirmAction('Suspend access')}>Suspend access</Button><Button variant="danger" onClick={() => setConfirmAction('Remove staff member')}>Remove staff member</Button>
      </div></section>
      {confirmAction && <PreviewDialog open onClose={() => setConfirmAction('')} title={`Confirm ${confirmAction.toLowerCase()}`} role="alertdialog" className="team-confirm-dialog">
        <div className="team-confirm-content"><span aria-hidden="true">!</span><p><strong>{confirmAction} for {member.name}?</strong><br />This is a visual confirmation only. No account or membership will be changed.</p></div>
        <div className="team-dialog-actions"><Button variant="outline" onClick={() => setConfirmAction('')}>Cancel</Button><Button variant="danger" onClick={() => { onConfirmAction(confirmAction); setConfirmAction(''); }}>Continue preview</Button></div>
      </PreviewDialog>}
      <div className="team-drawer-footer"><Button variant="outline" onClick={onClose}>Close preview</Button><Button onClick={onClose}>Save preview</Button></div>
    </PreviewDialog>
  );
}

function InviteStaffDialog({ onClose }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [position, setPosition] = useState('Order Handler');
  const [sent, setSent] = useState(false);
  const matching = STAFF_SEARCH_SAMPLES.filter((candidate) => `${candidate.name} ${candidate.username} ${candidate.email}`.toLowerCase().includes(query.toLowerCase()));
  const selected = STAFF_SEARCH_SAMPLES.find((candidate) => candidate.id === selectedId);
  return <PreviewDialog open onClose={onClose} title="Invite staff">
    {sent ? <div className="team-success-state"><span aria-hidden="true">✓</span><h3>Invitation preview sent</h3><p>This is a local design state only. No invitation was sent.</p><Button onClick={onClose}>Done</Button></div> : <>
      <p className="team-muted">Find an existing SALO account by username or email.</p>
      <label className="team-field"><span>Search SALO users</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Username or email" autoFocus /></label>
      {query && <div className="team-candidate-list" aria-live="polite">{matching.length ? matching.map((candidate) => <button type="button" className={`team-candidate ${selectedId === candidate.id ? 'selected' : ''}`} key={candidate.id} onClick={() => setSelectedId(candidate.id)}><Avatar {...candidate} /><span><strong>{candidate.name}</strong><small>{candidate.username} · {candidate.email}</small></span><span className="team-select-indicator">{selectedId === candidate.id ? 'Selected' : 'Select'}</span></button>) : <div className="team-inline-empty">No matching user. Try another username or email.</div>}</div>}
      {!query && <div className="team-inline-empty">Search for a username or email to see eligible accounts.</div>}
      {selected && <div className="team-invite-review"><h3>Selected account</h3><div className="team-person"><Avatar {...selected} /><span><strong>{selected.name}</strong><small>{selected.email}</small></span></div>
        <label className="team-field"><span>Position</span><select value={position} onChange={(event) => setPosition(event.target.value)}>{POSITION_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <div><strong>Responsibilities preview</strong><div className="team-chip-list">{(position === 'Order Handler' ? ['View Orders', 'Accept Orders', 'Update Preparation Status'] : ['View assigned section', 'Manage assigned tasks']).map((item) => <span className="team-chip" key={item}>{item}</span>)}</div></div>
      </div>}
      <div className="team-dialog-actions"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!selected} onClick={() => setSent(true)}>Send invitation</Button></div>
    </>}
  </PreviewDialog>;
}

function InvitationsPage() {
  const [staffInvitations, setStaffInvitations] = useState(STAFF_INVITATIONS);
  const statusVariant = (status) => ({ Pending: 'warning', Accepted: 'success', Declined: 'error', Expired: 'default', Revoked: 'default' })[status] || 'default';
  return <>
    <SectionHeading eyebrow="Access requests" title="Invitations" detail="Staff access and ownership invitations are managed as separate processes." />
    <section className="team-invitation-section"><header><div><p className="team-eyebrow">Staff access</p><h3>Staff invitations</h3></div><span className="team-count">{staffInvitations.length} invitations</span></header>
      <div className="team-invitation-list">{staffInvitations.map((invitation) => <article className="team-invitation-row" key={invitation.id}><div className="team-person"><Avatar name={invitation.user} initials={initialsFromName(invitation.user)} color="blue" /><span><strong>{invitation.user}</strong><small>{invitation.email}</small></span></div><div className="team-invitation-meta"><span>{invitation.restaurant}</span><strong>{invitation.position}</strong><small>Invited {invitation.date}</small><div className="team-chip-list">{invitation.responsibilities.map((item) => <span className="team-chip" key={item}>{item}</span>)}</div></div><div className="team-invitation-status"><Badge variant={statusVariant(invitation.status)}>{invitation.status}</Badge>{invitation.status === 'Pending' && <Button variant="ghost" size="sm" onClick={() => setStaffInvitations((current) => current.map((item) => item.id === invitation.id ? { ...item, status: 'Revoked' } : item))}>Revoke</Button>}</div></article>)}</div>
    </section>
    <section className="team-invitation-section team-ownership-invitations"><header><div><p className="team-eyebrow">Different membership type</p><h3>Ownership invitations</h3><p>Co-owner invitations are not staff invitations and do not use staff permissions.</p></div></header>
      {OWNERSHIP_INVITATIONS.map((invitation) => <article className="team-owner-pending" key={invitation.id}><div className="team-crown-mark" aria-hidden="true">♛</div><div><strong>{invitation.user}</strong><span>{invitation.email} · {invitation.restaurant}</span><small>Sent {invitation.date} · {invitation.approval}</small></div><Badge variant="warning">{invitation.status}</Badge></article>)}
    </section>
  </>;
}

function OwnerCard({ owner, inactive = false }) {
  return <article className={`team-owner-card ${inactive ? 'inactive' : ''}`}><div className="team-owner-card-mark" aria-hidden="true">♛</div><Avatar name={owner.name} initials={owner.initials} color="gold" large /><div className="team-owner-card-copy"><div className="team-owner-card-name"><h3>{owner.name}</h3><Badge variant={inactive ? 'default' : 'success'}>{inactive ? 'Inactive' : 'Approved owner'}</Badge></div><p>{owner.username} · {owner.email}</p><span>Member since {owner.joined}</span><small>{owner.note}</small></div></article>;
}

function InviteCoOwnerDialog({ onClose }) {
  const [step, setStep] = useState(1);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const matching = STAFF_SEARCH_SAMPLES.filter((candidate) => `${candidate.name} ${candidate.username} ${candidate.email}`.toLowerCase().includes(query.toLowerCase()));
  const selected = STAFF_SEARCH_SAMPLES.find((candidate) => candidate.id === selectedId);
  return <PreviewDialog open onClose={onClose} title="Invite a co-owner" className="team-coowner-dialog">
    <div className="team-step-indicator" aria-label={`Step ${Math.min(step, 4)} of 4`}>{['Find account', 'Review', 'Confirm', 'Status'].map((label, index) => <span className={index + 1 <= step ? 'active' : ''} key={label}><i>{index + 1}</i>{label}</span>)}</div>
    <div className="team-owner-warning"><span aria-hidden="true">♛</span><p><strong>A co-owner gets full owner-level access to this restaurant.</strong><br />This is a distinct ownership membership, not a staff position.</p></div>
    {step === 1 && <div><label className="team-field"><span>Search existing SALO users</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Username or email" /></label>{query && <div className="team-candidate-list">{matching.length ? matching.map((candidate) => <button type="button" className={`team-candidate ${selectedId === candidate.id ? 'selected' : ''}`} key={candidate.id} onClick={() => setSelectedId(candidate.id)}><Avatar {...candidate} /><span><strong>{candidate.name}</strong><small>{candidate.username} · {candidate.email}</small></span><span>{selectedId === candidate.id ? 'Selected' : 'Select'}</span></button>) : <div className="team-inline-empty">No matching user found.</div>}</div>}</div>}
    {step === 2 && <div className="team-selected-owner"><h3>Review selected account</h3>{selected ? <div className="team-person"><Avatar {...selected} color="gold" large /><span><strong>{selected.name}</strong><small>{selected.username} · {selected.email}</small></span></div> : <p>Select an account in the previous step.</p>}<p className="team-muted">Invitation is for Salo Kitchen — Uptown. Ownership policy details are handled separately.</p></div>}
    {step === 3 && <div className="team-confirm-owner"><h3>Confirm ownership invitation</h3><p>Invite {selected?.name} to become a co-owner of Salo Kitchen — Uptown?</p><div className="team-owner-warning"><span aria-hidden="true">!</span><p>Co-owners receive full owner-level access. Transfer, removal, and dispute procedures follow separate business rules.</p></div></div>}
    {step === 4 && <div className="team-success-state"><span aria-hidden="true">✓</span><h3>Invitation preview ready</h3><p>This design preview does not send an invitation or create an ownership record.</p></div>}
    <div className="team-dialog-actions">{step > 1 && step < 4 && <Button variant="ghost" onClick={() => setStep((value) => value - 1)}>Back</Button>}<span />{step < 4 && <Button disabled={(step === 1 || step === 2) && !selected} onClick={() => setStep((value) => value + 1)}>{step === 3 ? 'Confirm and send preview' : 'Continue'}</Button>}{step === 4 && <Button onClick={onClose}>Done</Button>}</div>
  </PreviewDialog>;
}

function OwnersPage({ onInvite }) {
  return <div className="team-owners-view">
    <section className="team-owners-hero"><div className="team-crown-mark" aria-hidden="true">♛</div><div><p className="team-eyebrow">Ownership · separate from staff</p><h2>Restaurant owners</h2><p>Approved owners share owner-level access to this restaurant. Ownership is never assigned through staff permissions.</p></div><Button onClick={onInvite} leftIcon={<span aria-hidden="true">＋</span>}>Invite co-owner</Button></section>
    <section className="team-ownership-section"><SectionHeading eyebrow="Approved memberships" title="Approved owners" detail="Each owner uses their own SALO account." /><div className="team-owner-grid">{OWNER_MEMBERSHIPS.approved.map((owner) => <OwnerCard owner={owner} key={owner.id} />)}</div></section>
    <section className="team-ownership-section"><SectionHeading eyebrow="Awaiting response" title="Pending ownership invitations" detail="These are co-owner invitations, not staff access requests." />{OWNERSHIP_INVITATIONS.map((invitation) => <article className="team-owner-pending" key={invitation.id}><div className="team-crown-mark" aria-hidden="true">♛</div><div><strong>{invitation.user}</strong><span>{invitation.email} · {invitation.restaurant}</span><small>Sent {invitation.date} · {invitation.approval}</small></div><Badge variant="warning">Pending</Badge></article>)}</section>
    <section className="team-ownership-section"><SectionHeading eyebrow="Membership records" title="Suspended or inactive" detail="Historical membership information remains distinct from ordinary staff." /><div className="team-owner-grid">{OWNER_MEMBERSHIPS.inactive.map((owner) => <OwnerCard owner={owner} inactive key={owner.id} />)}</div></section>
    <section className="team-ownership-section"><SectionHeading eyebrow="History" title="Ownership membership history" detail="Sample timeline of invitations and membership milestones." /><ol className="team-owner-timeline">{OWNER_MEMBERSHIPS.history.map((item) => <li key={item.id}><span className="team-timeline-dot" /><time>{item.date}</time><div><strong>{item.title}</strong><p>{item.detail}</p></div></li>)}</ol></section>
    <p className="team-policy-note">Ownership transfer, removal, and disputes follow separate business rules. <a href="#ownership-policy" onClick={(event) => event.preventDefault()}>Review ownership policies</a></p>
  </div>;
}

export default function TeamAndStaffPage() {
  const [tab, setTab] = useState('Staff');
  const [previewState, setPreviewState] = useState('Sample data');
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [staffAction, setStaffAction] = useState('Staff details');
  const [dialog, setDialog] = useState('');
  const [visibleStaff, setVisibleStaff] = useState(STAFF_SAMPLES);
  const closeDialog = () => setDialog('');

  const handleStaffAction = (member, action) => {
    setSelectedStaff(member);
    setStaffAction(action);
  };
  const handleConfirmStaffAction = (action) => {
    if (action === 'Remove staff member') setVisibleStaff((current) => current.filter((member) => member.id !== selectedStaff.id));
    if (action === 'Suspend access') setVisibleStaff((current) => current.map((member) => member.id === selectedStaff.id ? { ...member, status: 'Suspended' } : member));
    setSelectedStaff(null);
  };

  return <OwnerLayout>
    <main className="team-page">
      <div className="team-preview-banner"><div><span className="team-preview-mark" aria-hidden="true">✦</span><span><strong>Design preview - sample data</strong><small>Presentation only · no invitations or membership changes are saved</small></span></div><PreviewStatePicker value={previewState} onChange={setPreviewState} /></div>
      <header className="team-page-header"><div><p className="team-eyebrow">Workspace management</p><h1>Team and Staff</h1><p>Manage staff access separately from restaurant ownership.</p></div><div className="team-header-stat"><span>Staff members</span><strong>{visibleStaff.length}</strong><small>Owner memberships are shown separately</small></div></header>
      <div className="team-tabs" role="tablist" aria-label="Team management views">{TABS.map((item) => <button key={item} id={`team-tab-${item.toLowerCase()}`} role="tab" aria-selected={tab === item} aria-controls="team-tab-panel" type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}{item === 'Invitations' && <span className="team-tab-count">{STAFF_INVITATIONS.filter((invite) => invite.status === 'Pending').length}</span>}</button>)}</div>
      <section id="team-tab-panel" className="team-tab-panel" role="tabpanel" aria-labelledby={`team-tab-${tab.toLowerCase()}`}>
        {previewState !== 'Sample data' ? <PreviewState state={previewState} type={tab.toLowerCase()} onRetry={() => setPreviewState('Sample data')} /> : tab === 'Staff' ? <StaffPage staff={visibleStaff} onOpenStaff={handleStaffAction} onInvite={() => setDialog('staff-invite')} /> : tab === 'Invitations' ? <InvitationsPage /> : <OwnersPage onInvite={() => setDialog('co-owner-invite')} />}
      </section>
    </main>
    {selectedStaff && <StaffDetails member={selectedStaff} mode={staffAction} onClose={() => setSelectedStaff(null)} onConfirmAction={handleConfirmStaffAction} />}
    {dialog === 'staff-invite' && <InviteStaffDialog onClose={closeDialog} />}
    {dialog === 'co-owner-invite' && <InviteCoOwnerDialog onClose={closeDialog} />}
  </OwnerLayout>;
}

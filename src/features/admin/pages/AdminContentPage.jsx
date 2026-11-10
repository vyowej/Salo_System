import { useMemo, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import { ConfirmDialog, DataTable, PageHeader, StatusBadge, Tabs } from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { ADMIN_MOCK_DATA, getAdminContentData, saveAdminWorkspaceRecords } from '../mocks';
import { appendAdminAuditLog } from '../utils/auditLog';
import { formatDateTime, formatDateTimeInput } from '../utils/format';

const CONTENT_TABS = [
  { value: 'banners', label: 'Banners' },
  { value: 'featuredRestaurants', label: 'Featured restaurants' },
  { value: 'featuredCategories', label: 'Featured categories' },
  { value: 'announcements', label: 'Announcements' },
  { value: 'categories', label: 'Restaurant categories' },
];

const LABELS = {
  banners: 'Banner',
  featuredRestaurants: 'Featured restaurant',
  featuredCategories: 'Featured category',
  announcements: 'Announcement',
  categories: 'Restaurant category',
};

function blankRecord(type) {
  if (type === 'banners') return { title: '', placement: 'Homepage hero', imageLabel: '', link: '/customer/restaurants', startAt: '', endAt: '', status: 'Draft' };
  if (type === 'featuredRestaurants') return { restaurantId: ADMIN_MOCK_DATA.restaurants[0]?.id || '', placement: 'Homepage', rank: 1, startAt: '', endAt: '', status: 'Draft' };
  if (type === 'featuredCategories') return { categoryId: '', placement: 'Homepage', rank: 1, status: 'Draft' };
  if (type === 'announcements') return { title: '', body: '', audience: 'All users', startAt: '', endAt: '', status: 'Draft' };
  return { name: '', description: '', status: 'Active' };
}

function nameFor(type, item, categories) {
  if (type === 'featuredRestaurants') return ADMIN_MOCK_DATA.restaurants.find((restaurant) => restaurant.id === item.restaurantId)?.name || 'Unknown restaurant';
  if (type === 'featuredCategories') return categories.find((category) => category.id === item.categoryId)?.name || 'Unknown category';
  return item.title || item.name;
}

export default function AdminContentPage() {
  const { currentAdmin, permissions } = useAdminSession();
  const initial = getAdminContentData();
  const [records, setRecords] = useState(initial);
  const [activeTab, setActiveTab] = useState('banners');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [notice, setNotice] = useState('');
  const canCreate = permissions.content?.includes('create');
  const canEdit = permissions.content?.includes('edit');
  const canActivate = permissions.content?.includes('activate');
  const categories = records.categories;
  const rows = records[activeTab] || [];

  const columns = useMemo(() => {
    const base = [
      { key: 'name', label: LABELS[activeTab], render: (item) => <><strong>{nameFor(activeTab, item, categories)}</strong>{item.description && <><br /><span className="admin-muted">{item.description}</span></>}</> },
      { key: 'placement', label: 'Placement / audience', render: (item) => item.placement || item.audience || '—' },
      { key: 'schedule', label: 'Schedule', render: (item) => item.startAt ? <>{formatDateTime(item.startAt)}<br /><span className="admin-muted">to {formatDateTime(item.endAt)}</span></> : '—' },
      { key: 'status', label: 'Status', render: (item) => <StatusBadge status={item.status} /> },
      { key: 'actions', label: 'Actions', render: (item) => <div className="admin-action-row">
        <button className="admin-action-button" type="button" disabled={!canEdit} onClick={() => {
          setEditing(item);
          setDraft({
            ...item,
            ...(item.startAt ? { startAt: formatDateTimeInput(item.startAt) } : {}),
            ...(item.endAt ? { endAt: formatDateTimeInput(item.endAt) } : {}),
          });
          setNotice('');
        }}>Edit</button>
        {canActivate && <button className="admin-action-button" type="button" onClick={() => setPendingAction({ type: 'status', item, status: item.status === 'Active' ? 'Inactive' : 'Active', title: item.status === 'Active' ? 'Deactivate content' : 'Activate content', confirmLabel: item.status === 'Active' ? 'Deactivate' : 'Activate' })}>{item.status === 'Active' ? 'Deactivate' : 'Activate'}</button>}
      </div> },
    ];
    if (activeTab === 'featuredRestaurants' || activeTab === 'featuredCategories') {
      base.splice(2, 0, { key: 'rank', label: 'Display order' });
    }
    if (activeTab === 'banners') {
      base.splice(2, 0, { key: 'preview', label: 'Preview', render: (item) => <div className="admin-content-preview"><strong>{item.imageLabel || 'Artwork preview'}</strong><span>{item.title}</span></div> });
    }
    return base;
  }, [activeTab, canActivate, canEdit, categories]);

  function updateField(key, value) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  function validDraft() {
    if (!draft) return false;
    if (activeTab === 'categories') return Boolean(draft.name.trim());
    if (activeTab === 'featuredRestaurants') return Boolean(draft.restaurantId && draft.placement);
    if (activeTab === 'featuredCategories') return Boolean(draft.categoryId && draft.placement);
    const start = draft.startAt ? new Date(draft.startAt).getTime() : 0;
    const end = draft.endAt ? new Date(draft.endAt).getTime() : 0;
    if (!draft.title?.trim() || start && end && end <= start) return false;
    return activeTab !== 'announcements' || Boolean(draft.body?.trim());
  }

  function submitDraft(event) {
    event.preventDefault();
    if (!validDraft()) {
      setNotice('Complete required fields and ensure the end date is after the start date.');
      return;
    }
    if (activeTab === 'categories' && records.categories.some((category) => category.name.toLowerCase() === draft.name.trim().toLowerCase() && category.id !== editing?.id)) {
      setNotice('A category with this name already exists.');
      return;
    }
    setPendingAction({ type: 'save', title: editing ? `Save ${LABELS[activeTab].toLowerCase()} changes` : `Create ${LABELS[activeTab].toLowerCase()}`, confirmLabel: editing ? 'Save changes' : 'Create' });
  }

  function confirmAction({ reason }) {
    const now = new Date().toISOString();
    if (pendingAction.type === 'save') {
      const current = records[activeTab];
      const saved = {
        ...draft,
        id: editing?.id || `${activeTab}-${Date.now()}`,
        updatedAt: now,
        updatedBy: currentAdmin.name,
        ...(activeTab === 'categories' ? { name: draft.name.trim(), description: draft.description.trim() } : {}),
      };
      const next = { ...records, [activeTab]: editing ? current.map((item) => item.id === editing.id ? saved : item) : [saved, ...current] };
      setRecords(next);
      saveAdminWorkspaceRecords(activeTab, next[activeTab]);
      appendAdminAuditLog({
        who: currentAdmin.name,
        role: currentAdmin.role,
        action: `${editing ? 'Updated' : 'Created'} ${LABELS[activeTab].toLowerCase()}`,
        record: { type: LABELS[activeTab], id: saved.id },
        time: now,
        previousValue: editing ? nameFor(activeTab, editing, categories) : null,
        newValue: nameFor(activeTab, saved, categories),
        reason,
        reference: saved.id,
      });
      setNotice(`${LABELS[activeTab]} saved in browser demo state.`);
      setDraft(null);
      setEditing(null);
    } else {
      const current = records[activeTab];
      const updated = current.map((item) => item.id === pendingAction.item.id ? { ...item, status: pendingAction.status, updatedAt: now, updatedBy: currentAdmin.name } : item);
      setRecords((previous) => ({ ...previous, [activeTab]: updated }));
      saveAdminWorkspaceRecords(activeTab, updated);
      appendAdminAuditLog({
        who: currentAdmin.name,
        role: currentAdmin.role,
        action: `${pendingAction.status === 'Active' ? 'Activated' : 'Deactivated'} ${LABELS[activeTab].toLowerCase()}`,
        record: { type: LABELS[activeTab], id: pendingAction.item.id },
        time: now,
        previousValue: pendingAction.item.status,
        newValue: pendingAction.status,
        reason,
        reference: pendingAction.item.id,
      });
      setNotice(`${nameFor(activeTab, pendingAction.item, categories)} is now ${pendingAction.status.toLowerCase()}.`);
    }
    setPendingAction(null);
  }

  function renderEditor() {
    if (!draft) return null;
    const field = (label, key, props = {}) => <label className="admin-filter-control">{label}<input value={draft[key] ?? ''} onChange={(event) => updateField(key, event.target.value)} {...props} /></label>;
    return (
      <form className="admin-record-panel admin-workspace-form" onSubmit={submitDraft}>
        <div className="admin-workspace-heading"><h2>{editing ? 'Edit' : 'Create'} {LABELS[activeTab]}</h2><button className="admin-action-button" type="button" onClick={() => { setDraft(null); setEditing(null); }}>Cancel</button></div>
        {activeTab === 'banners' && <>
          {field('Title', 'title', { required: true })}
          <label className="admin-filter-control">Placement<select value={draft.placement} onChange={(event) => updateField('placement', event.target.value)}>{['Homepage hero', 'Homepage secondary', 'Promotional banner'].map((value) => <option key={value}>{value}</option>)}</select></label>
          {field('Artwork description (demo preview only)', 'imageLabel', { required: true })}
          {field('Destination link', 'link', { type: 'text' })}
          {field('Starts at', 'startAt', { type: 'datetime-local', required: true })}
          {field('Ends at', 'endAt', { type: 'datetime-local', required: true })}
        </>}
        {activeTab === 'featuredRestaurants' && <>
          <label className="admin-filter-control">Restaurant<select value={draft.restaurantId} onChange={(event) => updateField('restaurantId', event.target.value)}>{ADMIN_MOCK_DATA.restaurants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="admin-filter-control">Placement<select value={draft.placement} onChange={(event) => updateField('placement', event.target.value)}>{['Homepage', 'Popular near you', 'Curated collection'].map((value) => <option key={value}>{value}</option>)}</select></label>
          {field('Display order', 'rank', { type: 'number', min: 1 })}
          {field('Starts at', 'startAt', { type: 'datetime-local', required: true })}
          {field('Ends at', 'endAt', { type: 'datetime-local', required: true })}
        </>}
        {activeTab === 'featuredCategories' && <>
          <label className="admin-filter-control">Category<select value={draft.categoryId} onChange={(event) => updateField('categoryId', event.target.value)}><option value="">Select category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="admin-filter-control">Placement<select value={draft.placement} onChange={(event) => updateField('placement', event.target.value)}>{['Homepage', 'Browse categories'].map((value) => <option key={value}>{value}</option>)}</select></label>
          {field('Display order', 'rank', { type: 'number', min: 1 })}
        </>}
        {activeTab === 'announcements' && <>
          {field('Title', 'title', { required: true })}
          <label className="admin-filter-control">Announcement<textarea required value={draft.body} onChange={(event) => updateField('body', event.target.value)} /></label>
          <label className="admin-filter-control">Audience<select value={draft.audience} onChange={(event) => updateField('audience', event.target.value)}>{['All users', 'Customers', 'Restaurant partners', 'Riders'].map((value) => <option key={value}>{value}</option>)}</select></label>
          {field('Starts at', 'startAt', { type: 'datetime-local', required: true })}
          {field('Ends at', 'endAt', { type: 'datetime-local', required: true })}
        </>}
        {activeTab === 'categories' && <>
          {field('Category name', 'name', { required: true })}
          <label className="admin-filter-control">Description<input value={draft.description} onChange={(event) => updateField('description', event.target.value)} /></label>
        </>}
        {activeTab === 'banners' && <div className="admin-content-preview admin-content-preview--large"><strong>{draft.imageLabel || 'Artwork preview'}</strong><span>{draft.title || 'Banner title preview'}</span><small>{draft.placement}</small></div>}
        <button className="admin-action-button" type="submit">{editing ? 'Review changes' : 'Review and create'}</button>
      </form>
    );
  }

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Content Management" description="Manage homepage banners, featured collections, announcements, and platform restaurant categories." actions={canCreate && <button className="admin-action-button" type="button" onClick={() => { setEditing(null); setDraft(blankRecord(activeTab)); setNotice(''); }}>Create {LABELS[activeTab].toLowerCase()}</button>} />
        <p className="admin-shell-note">Content records and image descriptions are browser-local demo data. No image upload or external storage is configured.</p>
        {notice && <p className="admin-inline-notice" role="status">{notice}</p>}
        <Tabs items={CONTENT_TABS} value={activeTab} onChange={(value) => { setActiveTab(value); setDraft(null); setEditing(null); setNotice(''); }} label="Content management areas" />
        {renderEditor()}
        {activeTab === 'banners' && rows.map((item) => <div className="admin-content-preview" key={`preview-${item.id}`}><strong>{item.imageLabel}</strong><span>{item.title}</span><small>{item.placement} · {item.status}</small></div>)}
        <DataTable columns={columns} rows={rows} emptyTitle={`No ${LABELS[activeTab].toLowerCase()} records`} emptyDescription="Create a demo record to populate this content list." />
      </section>
      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.title}
        description="This content change is saved only in browser demo state and recorded in the audit log."
        confirmLabel={pendingAction?.confirmLabel}
        requireReauthentication
        requireReason
        onClose={() => setPendingAction(null)}
        onConfirm={confirmAction}
      />
    </AdminLayout>
  );
}

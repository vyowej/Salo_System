import { useMemo, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import { ConfirmDialog, DataTable, DetailDrawer, Modal, PageHeader, StatCard, StatusBadge, Tabs, Timeline } from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { ADMIN_MOCK_DATA, getAdminWorkspaceRecords, saveAdminWorkspaceRecords } from '../mocks';
import { appendAdminAuditLog } from '../utils/auditLog';
import { formatDateTime, formatDateTimeInput, formatPeso } from '../utils/format';

const DISCOUNT_TYPES = [
  'Percentage discount',
  'Fixed amount discount',
  'Free delivery',
  'Discounted delivery fee',
  'Minimum-spend discount',
  'First-order discount',
  'Returning-customer discount',
  'Limited-time promotion',
  'Platform-wide promotional campaign',
  'Selected-restaurant promotion',
];
const FUNDING_SOURCES = ['Platform-funded', 'Restaurant-funded', 'Shared-funded'];

function freshCampaign() {
  return {
    name: '',
    description: '',
    type: DISCOUNT_TYPES[0],
    value: 10,
    minimumSpend: 0,
    maximumDiscount: 0,
    startsAt: '',
    endsAt: '',
    restaurants: [],
    locations: [],
    customerGroups: ['All customers'],
    usageLimit: 100,
    perCustomerLimit: 1,
    orderTypes: ['Delivery'],
    paymentMethods: ['All'],
    code: '',
    fundingSource: 'Platform-funded',
    platformShare: 100,
    restaurantShare: 0,
    budget: 0,
    usageCount: 0,
    discountTotal: 0,
    customerCount: 0,
    ordersGenerated: 0,
    status: 'Draft',
    history: [],
  };
}

function effectiveStatus(campaign) {
  if (campaign.status === 'Deactivated' || campaign.status === 'Draft') return campaign.status;
  const now = Date.now();
  if (campaign.endsAt && new Date(campaign.endsAt).getTime() < now) return 'Expired';
  if (campaign.startsAt && new Date(campaign.startsAt).getTime() > now) return 'Scheduled';
  return campaign.status === 'Expired' ? 'Expired' : 'Active';
}

function splitList(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export default function AdminDiscountsPage() {
  const { currentAdmin, permissions } = useAdminSession();
  const { query: globalQuery } = useAdminPageSearch({ scopeLabel: 'Discounts', placeholder: 'Search promotions by name, code, or type', searchableFields: ['name', 'code', 'type'] });
  const [campaigns, setCampaigns] = useState(getAdminWorkspaceRecords('discounts'));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeTab, setActiveTab] = useState('Campaigns');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState('');
  const canCreate = permissions.discounts?.includes('create');
  const canEdit = permissions.discounts?.includes('edit');
  const canActivate = permissions.discounts?.includes('activate');

  const filtered = useMemo(() => campaigns.filter((campaign) => {
    const status = effectiveStatus(campaign);
    const term = (globalQuery || search).trim().toLowerCase();
    return (!term || `${campaign.name} ${campaign.code} ${campaign.type}`.toLowerCase().includes(term))
      && (!statusFilter || status === statusFilter);
  }), [campaigns, globalQuery, search, statusFilter]);

  function updateField(key, value) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  function startCreate() {
    setEditing(null);
    setDraft(freshCampaign());
    setNotice('');
  }

  function startEdit(campaign) {
    setEditing(campaign);
    setDraft({
      ...campaign,
      startsAt: formatDateTimeInput(campaign.startsAt),
      endsAt: formatDateTimeInput(campaign.endsAt),
      restaurantsText: campaign.restaurants.join(', '),
      locationsText: campaign.locations.join(', '),
      groupsText: campaign.customerGroups.join(', '),
      orderTypesText: campaign.orderTypes.join(', '),
      paymentMethodsText: campaign.paymentMethods.join(', '),
    });
    setNotice('');
  }

  function submitDraft(event) {
    event.preventDefault();
    const start = new Date(draft.startsAt).getTime();
    const end = new Date(draft.endsAt).getTime();
    const sharedValid = draft.fundingSource !== 'Shared-funded'
      || Number(draft.platformShare) + Number(draft.restaurantShare) === 100;
    if (!draft.name.trim() || !draft.description.trim() || !Number.isFinite(start) || !Number.isFinite(end) || end <= start
      || Number(draft.value) < 0 || Number(draft.minimumSpend) < 0 || Number(draft.usageLimit) < 0 || !sharedValid) {
      setNotice('Review required fields, amount limits, schedule, and shared-funding allocation (must total 100%).');
      return;
    }
    if (draft.type === 'Percentage discount' && Number(draft.value) > 100) {
      setNotice('Percentage discounts cannot exceed 100%.');
      return;
    }
    setPendingAction({ type: 'save', title: editing ? 'Save campaign changes' : 'Create campaign', confirmLabel: editing ? 'Save campaign' : 'Create campaign' });
  }

  function audit(action, campaign, previousValue, newValue, reason) {
    appendAdminAuditLog({
      who: currentAdmin.name,
      role: currentAdmin.role,
      action,
      record: { type: 'Discount campaign', id: campaign.id },
      time: new Date().toISOString(),
      previousValue,
      newValue,
      reason,
      reference: campaign.code || campaign.id,
    });
  }

  function confirmAction({ reason }) {
    const now = new Date().toISOString();
    if (pendingAction.type === 'save') {
      const start = new Date(draft.startsAt);
      const end = new Date(draft.endsAt);
      const campaign = {
        ...draft,
        id: editing?.id || `promo-${Date.now()}`,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        restaurants: draft.restaurantsText !== undefined ? splitList(draft.restaurantsText) : draft.restaurants,
        locations: draft.locationsText !== undefined ? splitList(draft.locationsText) : draft.locations,
        customerGroups: draft.groupsText !== undefined ? splitList(draft.groupsText) : draft.customerGroups,
        orderTypes: draft.orderTypesText !== undefined ? splitList(draft.orderTypesText) : draft.orderTypes,
        paymentMethods: draft.paymentMethodsText !== undefined ? splitList(draft.paymentMethodsText) : draft.paymentMethods,
        status: draft.status === 'Deactivated' ? 'Deactivated' : (start.getTime() > Date.now() ? 'Scheduled' : 'Active'),
        updatedAt: now,
        updatedBy: currentAdmin.name,
      };
      const next = editing ? campaigns.map((item) => item.id === campaign.id ? campaign : item) : [campaign, ...campaigns];
      setCampaigns(next);
      saveAdminWorkspaceRecords('discounts', next);
      audit(editing ? 'Updated discount campaign' : 'Created discount campaign', campaign, editing?.name || null, campaign.name, reason);
      setNotice(`${campaign.name} saved. Historical order discounts remain unchanged.`);
      setEditing(null);
      setDraft(null);
    } else {
      const { campaign: original, status } = pendingAction;
      const updatedCampaign = { ...original, status, updatedAt: now, updatedBy: currentAdmin.name, history: [...(original.history || []), { actor: currentAdmin.name, time: now, from: effectiveStatus(original), to: status, reason }] };
      const next = campaigns.map((item) => item.id === original.id ? updatedCampaign : item);
      setCampaigns(next);
      saveAdminWorkspaceRecords('discounts', next);
      audit(`${status === 'Active' ? 'Activated' : 'Deactivated'} discount campaign`, original, effectiveStatus(original), status, reason);
      setNotice(`${original.name} is now ${status.toLowerCase()}. Expired or deactivated promotions are not offered to new orders.`);
    }
    setPendingAction(null);
  }

  const columns = [
    { key: 'name', label: 'Campaign', render: (item) => <button className="admin-text-link" type="button" onClick={() => setSelected(item)}><strong>{item.name}</strong><span>{item.code || 'No promotion code'} · {item.type}</span></button> },
    { key: 'fundingSource', label: 'Funding', render: (item) => <>{item.fundingSource}<br /><span className="admin-muted">Platform {item.platformShare}% · Restaurant {item.restaurantShare}%</span></> },
    { key: 'schedule', label: 'Schedule', render: (item) => <>{formatDateTime(item.startsAt)}<br /><span className="admin-muted">to {formatDateTime(item.endsAt)}</span></> },
    { key: 'performance', label: 'Usage / discount', render: (item) => `${item.usageCount} uses · ${formatPeso(item.discountTotal)}` },
    { key: 'budget', label: 'Budget remaining', render: (item) => item.budget ? formatPeso(Math.max(0, item.budget - item.discountTotal)) : 'Not configured' },
    { key: 'status', label: 'Status', render: (item) => <StatusBadge status={effectiveStatus(item)} /> },
    { key: 'actions', label: 'Actions', render: (item) => <div className="admin-action-row">
      <button className="admin-action-button" type="button" disabled={!canEdit} onClick={() => startEdit(item)}>Edit</button>
      {canActivate && effectiveStatus(item) !== 'Expired' && <button className="admin-action-button" type="button" disabled={effectiveStatus(item) === 'Deactivated' && new Date(item.endsAt).getTime() < Date.now()} onClick={() => setPendingAction({ type: 'status', campaign: item, status: effectiveStatus(item) === 'Active' || effectiveStatus(item) === 'Scheduled' ? 'Deactivated' : (new Date(item.startsAt).getTime() > Date.now() ? 'Scheduled' : 'Active'), title: effectiveStatus(item) === 'Active' || effectiveStatus(item) === 'Scheduled' ? 'Deactivate campaign' : 'Activate campaign', confirmLabel: effectiveStatus(item) === 'Active' || effectiveStatus(item) === 'Scheduled' ? 'Deactivate' : 'Activate' })}>{effectiveStatus(item) === 'Active' || effectiveStatus(item) === 'Scheduled' ? 'Deactivate' : 'Activate'}</button>}
    </div> },
  ];

  function renderEditor() {
    if (!draft) return null;
    const field = (label, key, props = {}) => <label className="admin-filter-control">{label}<input value={draft[key] ?? ''} onChange={(event) => updateField(key, event.target.value)} {...props} /></label>;


  
    return (
      <Modal
        open={Boolean(draft)}
        onClose={() => { setDraft(null); setEditing(null); }}
        size="wide"
        title={editing ? 'Edit campaign' : 'Create campaign'}
        footer={(
          <>
            <button className="admin-action-button" type="button" onClick={() => { setDraft(null); setEditing(null); }}>Cancel</button>
            <button className="admin-action-button" type="submit" form="discount-editor-form">{editing ? 'Review campaign changes' : 'Review campaign'}</button>
          </>
        )}
      >
        <form id="discount-editor-form" className="admin-modal-form admin-modal-form--two-col" onSubmit={submitDraft}>

        {field('Promotion name', 'name', { required: true })}
        <label className="admin-filter-control">Description<textarea required value={draft.description} onChange={(event) => updateField('description', event.target.value)} /></label>
        <label className="admin-filter-control">Discount type<select value={draft.type} onChange={(event) => updateField('type', event.target.value)}>{DISCOUNT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
        {field(draft.type.includes('Percentage') ? 'Discount percent' : 'Discount amount / delivery reduction', 'value', { type: 'number', min: 0, step: '0.01', required: true })}
        {field('Minimum order amount', 'minimumSpend', { type: 'number', min: 0, step: '0.01' })}
        {field('Maximum discount amount', 'maximumDiscount', { type: 'number', min: 0, step: '0.01' })}
        {field('Starts at', 'startsAt', { type: 'datetime-local', required: true })}
        {field('Expires at', 'endsAt', { type: 'datetime-local', required: true })}
        <label className="admin-filter-control">Applicable restaurants (IDs, comma-separated; blank means all)<input value={draft.restaurantsText ?? draft.restaurants.join(', ')} onChange={(event) => updateField('restaurantsText', event.target.value)} placeholder={ADMIN_MOCK_DATA.restaurants.map((item) => item.id).join(', ')} /></label>
        <label className="admin-filter-control">Locations (comma-separated)<input value={draft.locationsText ?? draft.locations.join(', ')} onChange={(event) => updateField('locationsText', event.target.value)} placeholder="Quezon City, Makati" /></label>
        <label className="admin-filter-control">Eligible customer groups (comma-separated)<input value={draft.groupsText ?? draft.customerGroups.join(', ')} onChange={(event) => updateField('groupsText', event.target.value)} placeholder="All customers, First order, Returning customers" /></label>
        {field('Total usage limit', 'usageLimit', { type: 'number', min: 0 })}
        {field('Per-customer usage limit', 'perCustomerLimit', { type: 'number', min: 1 })}
        <label className="admin-filter-control">Applicable order types (comma-separated)<input value={draft.orderTypesText ?? draft.orderTypes.join(', ')} onChange={(event) => updateField('orderTypesText', event.target.value)} placeholder="Delivery, Pickup" /></label>
        <label className="admin-filter-control">Payment methods (comma-separated)<input value={draft.paymentMethodsText ?? draft.paymentMethods.join(', ')} onChange={(event) => updateField('paymentMethodsText', event.target.value)} placeholder="All, GCash, Maya" /></label>
        {field('Promotion code (optional)', 'code')}
        <label className="admin-filter-control">Funding source<select value={draft.fundingSource} onChange={(event) => updateField('fundingSource', event.target.value)}>{FUNDING_SOURCES.map((source) => <option key={source}>{source}</option>)}</select></label>
        {field('Platform funding share (%)', 'platformShare', { type: 'number', min: 0, max: 100 })}
        {field('Restaurant funding share (%)', 'restaurantShare', { type: 'number', min: 0, max: 100 })}
        {field('Campaign budget (optional)', 'budget', { type: 'number', min: 0, step: '0.01' })}
        <div className="admin-shell-note">Shared funding allocation must total 100%. Saving or editing a campaign never changes the discount snapshot stored on completed orders.</div>
  
        </form>
      </Modal>

    );
  }

  const totalUsage = campaigns.reduce((sum, item) => sum + Number(item.usageCount || 0), 0);
  const totalDiscount = campaigns.reduce((sum, item) => sum + Number(item.discountTotal || 0), 0);
  const activeCampaignCount = campaigns.filter((item) => effectiveStatus(item) === 'Active').length;
  const fundingTotals = {
    platform: campaigns.reduce((sum, item) => sum + (item.fundingSource === 'Platform-funded' ? Number(item.discountTotal || 0) : item.fundingSource === 'Shared-funded' ? Number(item.discountTotal || 0) * Number(item.platformShare || 0) / 100 : 0), 0),
    restaurant: campaigns.reduce((sum, item) => sum + (item.fundingSource === 'Restaurant-funded' ? Number(item.discountTotal || 0) : item.fundingSource === 'Shared-funded' ? Number(item.discountTotal || 0) * Number(item.restaurantShare || 0) / 100 : 0), 0),
  };



  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Discounts and Promotions" description="Create and monitor platform promotional campaigns. Existing order discount snapshots are immutable." actions={activeTab === 'Campaigns' && canCreate ? <button className="admin-action-button" type="button" onClick={startCreate}>Create campaign</button> : null} />
        <p className="admin-shell-note">Expired or deactivated promotions are no longer available for new eligible orders. Existing completed transactions retain the discount applied at checkout.</p>
        {notice && <p className="admin-inline-notice" role="status">{notice}</p>}
        <Tabs items={['Campaigns', 'Performance']} value={activeTab} onChange={(value) => { setActiveTab(value); setDraft(null); setEditing(null); }} label="Discount workspace views" />
        {activeTab === 'Campaigns' ? (
          <>
            <div className="admin-filter-bar">
              <label className="admin-filter-control">Search<input aria-label="Search promotions" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Campaign, code, or type" /></label>
              <label className="admin-filter-control">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{['Draft', 'Scheduled', 'Active', 'Expired', 'Deactivated'].map((status) => <option key={status}>{status}</option>)}</select></label>
            </div>
            {renderEditor()}
            <DataTable columns={columns} rows={filtered} tableSearch={globalQuery} showLocalSearch emptyTitle="No campaigns found" emptyDescription="Create a campaign or adjust search and status filters." />
          </>
        ) : (
          <>
            <div className="admin-stat-grid">
              <StatCard label="Active campaigns" value={activeCampaignCount} hint="Scheduled and expired campaigns are excluded" tone="gold" />
              <StatCard label="Discount uses" value={totalUsage} hint="Recorded campaign redemptions" tone="brown" />
              <StatCard label="Discount expenditure" value={formatPeso(totalDiscount)} hint="All campaign funding sources" tone="gold" />
              <StatCard label="Platform-funded share" value={formatPeso(fundingTotals.platform)} hint={`Restaurant-funded share ${formatPeso(fundingTotals.restaurant)}`} tone="gold" />
            </div>
            <DataTable tableSearch={globalQuery} showLocalSearch columns={[
              { key: 'name', label: 'Campaign', render: (item) => <button className="admin-text-link" type="button" onClick={() => setSelected(item)}><strong>{item.name}</strong><span>{item.type}</span></button> },
              { key: 'usageCount', label: 'Uses / customers', render: (item) => `${item.usageCount} / ${item.customerCount}` },
              { key: 'ordersGenerated', label: 'Orders generated' },
              { key: 'discountTotal', label: 'Discount total', render: (item) => formatPeso(item.discountTotal) },
              { key: 'conversion', label: 'Conversion', render: (item) => item.usageCount ? `${Math.round(item.ordersGenerated / Math.max(1, item.customerCount) * 100)}% orders per customer` : 'No redemptions yet' },
              { key: 'budget', label: 'Remaining budget', render: (item) => item.budget ? formatPeso(Math.max(0, item.budget - item.discountTotal)) : 'Not configured' },
            ]} rows={campaigns} emptyTitle="No campaign performance" emptyDescription="Campaign performance appears after redemptions are recorded." />
          </>
        )}
      </section>
      <DetailDrawer open={Boolean(selected)} title={selected?.name || 'Campaign details'} onClose={() => setSelected(null)}>
        {selected && <div className="admin-drawer-content">
          <dl className="admin-audit-detail">
            <div><dt>Type and value</dt><dd>{selected.type} · {selected.value}</dd></div>
            <div><dt>Funding</dt><dd>{selected.fundingSource} · Platform {selected.platformShare}% / Restaurant {selected.restaurantShare}%</dd></div>
            <div><dt>Schedule</dt><dd>{formatDateTime(selected.startsAt)} – {formatDateTime(selected.endsAt)}</dd></div>
            <div><dt>Eligibility</dt><dd>{selected.customerGroups.join(', ')} · {selected.orderTypes.join(', ')}</dd></div>
            <div><dt>Restaurants / locations</dt><dd>{selected.restaurants.length ? selected.restaurants.join(', ') : 'All restaurants'} · {selected.locations.length ? selected.locations.join(', ') : 'All locations'}</dd></div>
            <div><dt>Performance</dt><dd>{selected.usageCount} uses · {formatPeso(selected.discountTotal)} · {selected.ordersGenerated} orders</dd></div>
          </dl>
          <p>{selected.description}</p>
          <h3>Campaign history</h3>
          <Timeline items={(selected.history || []).map((item, index) => ({ id: `${selected.id}-${index}`, title: `${item.from} → ${item.to}`, description: `${item.actor}: ${item.reason}`, time: item.time }))} />
        </div>}
      </DetailDrawer>
      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.title}
        description="This change is recorded in the audit log. It does not alter historical order snapshots."
        confirmLabel={pendingAction?.confirmLabel}
        requireReauthentication
        requireReason
        onClose={() => setPendingAction(null)}
        onConfirm={confirmAction}
      />
    </AdminLayout>
  );
}

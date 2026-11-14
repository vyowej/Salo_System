import { useMemo, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import {
  ConfirmDialog,
  DataTable,
  PageHeader,
  Modal,
  StatusBadge,
  Tabs,
} from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { hasAdminPermission, ADMIN_FEE_STATUS_TRANSITIONS } from '../constants';
import {
  ADMIN_MOCK_DATA,
  changeFeeStatus,
  getFeeConfigurations,
  getFeePreview,
  getOrderBreakdown,
  saveFeeConfiguration,
} from '../mocks';
import { appendAdminAuditLog } from '../utils/auditLog';
import { formatDateTime, formatDateTimeInput, formatPeso } from '../utils/format';
import './AdminFinancePages.css';

const TABS = ['Delivery Fees', 'Commission', 'Other Fees', 'History'];
const ORDER_TYPES = ['Delivery', 'Pickup', 'Reservation'];

function createDraft(category) {
  const suffix = Date.now();
  if (category === 'Delivery Fees') return {
    id: `fee-delivery-${suffix}`, category, name: 'New delivery fee', model: 'Fixed',
    baseFee: 49, includedDistance: 3, additionalDistanceRate: 10, zones: {},
    minimum: 39, maximum: 149, effectiveAt: new Date().toISOString(),
    orderTypes: ['Delivery'], serviceAreaIds: [], specialConditions: '',
    status: 'Draft', versions: [],
  };
  if (category === 'Commission') return {
    id: `fee-commission-${suffix}`, category, name: 'New commission arrangement',
    model: 'Percentage', rate: 10, fixedAmount: 0, restaurantId: '',
    effectiveAt: new Date().toISOString(), orderTypes: ['Delivery', 'Pickup'],
    serviceAreaIds: [], specialConditions: '', status: 'Draft', versions: [],
  };
  return {
    id: `fee-other-${suffix}`, category, name: 'Customer service fee',
    description: '', calculation: 'Fixed', amount: 0, applicability: '',
    effectiveAt: new Date().toISOString(), endAt: '', status: 'Draft', versions: [],
  };
}

export default function AdminFeesPage() {
  const { currentAdmin } = useAdminSession();
  const { query: globalQuery } = useAdminPageSearch({ scopeLabel: 'Fees and Commissions', placeholder: 'Search fee rules by name, model, or status', searchableFields: ['name', 'model', 'status'] });
  const canEdit = hasAdminPermission(currentAdmin.role, 'fees', 'edit');
  const canActivate = hasAdminPermission(currentAdmin.role, 'fees', 'activate');
  const [activeTab, setActiveTab] = useState('Delivery Fees');
  const [configurations, setConfigurations] = useState(getFeeConfigurations);
  const [draft, setDraft] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [previewOrderId, setPreviewOrderId] = useState(ADMIN_MOCK_DATA.orders[0].id);
  const [previewInput, setPreviewInput] = useState(() => ({
    subtotal: getOrderBreakdown(ADMIN_MOCK_DATA.orders[0].id).restaurantSales,
    distance: 4,
    zone: 'QC North',
    orderType: 'Delivery',
    restaurantId: 'rest-1',
    paymentMethod: 'Cash on Delivery (COD)',
    promo: false,
    discountAmount: 30,
    promoFunding: 'Platform',
    scheduled: false,
  }));
  const [previewConfigId, setPreviewConfigId] = useState('');
  const serviceAreas = ADMIN_MOCK_DATA.serviceAreas;

  const currentRows = useMemo(() => configurations.filter((item) => {
    const term = globalQuery.trim().toLowerCase();
    return item.category === activeTab
      && (!term || [item.name, item.model, item.description, item.status].some((v) => String(v || '').toLowerCase().includes(term)));
  }), [activeTab, configurations, globalQuery]);
  const previewDraft = draft || configurations.find((item) => item.id === previewConfigId) || null;
  const currentDelivery = configurations.find((item) => item.category === 'Delivery Fees' && item.status === 'Active');
  const proposedDelivery = previewDraft?.category === 'Delivery Fees' ? previewDraft : currentDelivery;
  const currentCommission = configurations.find((item) => item.category === 'Commission' && item.status === 'Active' && !item.restaurantId);
  const proposedCommission = previewDraft?.category === 'Commission' ? previewDraft : currentCommission;
  const currentOtherFees = configurations.find((item) => item.category === 'Other Fees' && item.name === 'Customer service fee' && item.status === 'Active');
  const proposedOtherFees = previewDraft?.category === 'Other Fees' ? { ...previewDraft, status: 'Active' } : currentOtherFees;
  const currentPreview = getFeePreview(previewInput, currentDelivery, currentCommission, currentOtherFees);
  const proposedPreview = getFeePreview(previewInput, proposedDelivery, proposedCommission, proposedOtherFees);

  function setField(key, value) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  function openEditor(configuration) {
    setDraft({ ...configuration });
    setPreviewConfigId(configuration.id);
  }

  function recordAudit(action, before, after, reason) {
    appendAdminAuditLog({
      who: currentAdmin.name,
      role: currentAdmin.role,
      action,
      record: { type: 'Fee configuration', id: pendingAction?.configuration?.id || draft?.id },
      time: new Date().toISOString(),
      previousValue: before,
      newValue: after,
      reason,
    });
  }

  function confirmChange({ reason }) {
    if (pendingAction.type === 'save') {
      const previous = configurations.find((item) => item.id === draft.id);
      const saved = saveFeeConfiguration(draft, currentAdmin.name, reason);
      setConfigurations(getFeeConfigurations());
      recordAudit(previous ? 'Updated fee configuration' : 'Created fee configuration', previous || null, saved, reason);
      setDraft(null);
      setPendingAction(null);
      return;
    }
    const { configuration, status } = pendingAction;
    const updated = changeFeeStatus(configuration.id, status, currentAdmin.name, reason);
    setConfigurations(getFeeConfigurations());
    recordAudit(`Changed fee configuration status to ${status}`, configuration.status, status, reason);
    if (draft?.id === configuration.id) setDraft(updated);
    setPendingAction(null);
  }

  function startSave() {
    if (!draft?.name?.trim()) return;
    if (draft.category === 'Commission' && draft.model !== 'Fixed' && (!Number.isFinite(Number(draft.rate)) || Number(draft.rate) < 0)) return;
    if (draft.category === 'Other Fees' && (!Number.isFinite(Number(draft.amount)) || Number(draft.amount) < 0)) return;
    setPendingAction({ type: 'save', title: draft.status === 'Draft' ? 'Save fee configuration' : 'Confirm fee configuration change', confirmLabel: 'Save configuration' });
  }

  function renderEditor() {
    if (!draft || draft.category !== activeTab || activeTab === 'History') return null;
    const serviceAreaIds = draft.serviceAreaIds || [];
    const orderTypes = draft.orderTypes || [];


    return (
      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        size="wide"
        title={configurations.some((item) => item.id === draft.id) ? 'Edit configuration' : 'New draft configuration'}
        footer={(
          <>
            <button className="admin-action-button" type="button" onClick={() => setDraft(null)}>Close</button>
            <button className="admin-action-button" type="button" onClick={startSave} disabled={!canEdit}>Save changes</button>
          </>
        )}
      >
        <div aria-label="Fee configuration editor">
        <h2>{configurations.some((item) => item.id === draft.id) ? 'Edit configuration' : 'New draft configuration'}</h2>
        <fieldset className="admin-finance-form-grid" disabled={!canEdit}>
          <label className="admin-filter-control">Name{draft.category === 'Other Fees'
            ? <select value={draft.name || ''} onChange={(event) => setField('name', event.target.value)}>{['Customer service fee', 'Small-order fee', 'Reservation service fee', 'Reservation booking fee'].map((name) => <option key={name}>{name}</option>)}</select>
            : <input value={draft.name || ''} onChange={(event) => setField('name', event.target.value)} />}</label>
          {draft.category === 'Delivery Fees' && <>
            <label className="admin-filter-control">Delivery model<select value={draft.model} onChange={(event) => setField('model', event.target.value)}>{['Fixed', 'Distance-based', 'Zone-based', 'Base + distance', 'Special area', 'Scheduled surcharge'].map((model) => <option key={model}>{model}</option>)}</select></label>
            <label className="admin-filter-control">Base fee<input type="number" min="0" step="0.01" value={draft.baseFee ?? 0} onChange={(event) => setField('baseFee', Number(event.target.value))} /></label>
            <label className="admin-filter-control">Included distance (km)<input type="number" min="0" step="0.1" value={draft.includedDistance ?? 0} onChange={(event) => setField('includedDistance', Number(event.target.value))} /></label>
            <label className="admin-filter-control">Additional distance rate / km<input type="number" min="0" step="0.01" value={draft.additionalDistanceRate ?? 0} onChange={(event) => setField('additionalDistanceRate', Number(event.target.value))} /></label>
            <label className="admin-filter-control">Minimum fee<input type="number" min="0" step="0.01" value={draft.minimum ?? 0} onChange={(event) => setField('minimum', Number(event.target.value))} /></label>
            <label className="admin-filter-control">Maximum fee (0 = no cap)<input type="number" min="0" step="0.01" value={draft.maximum ?? 0} onChange={(event) => setField('maximum', Number(event.target.value))} /></label>
            <label className="admin-filter-control">Scheduled surcharge<input type="number" min="0" step="0.01" value={draft.surcharge ?? 0} onChange={(event) => setField('surcharge', Number(event.target.value))} /></label>
            <label className="admin-filter-control">Zone rates (zone=amount, comma-separated)<input value={Object.entries(draft.zones || {}).map(([zone, amount]) => `${zone}=${amount}`).join(', ')} onChange={(event) => setField('zones', Object.fromEntries(event.target.value.split(',').map((entry) => entry.trim().split('=').map((part) => part.trim())).filter(([zone, amount]) => zone && amount).map(([zone, amount]) => [zone, Number(amount)])))} /></label>
          </>}
          {draft.category === 'Commission' && <>
            <label className="admin-filter-control">Commission structure<select value={draft.model} onChange={(event) => setField('model', event.target.value)}>{['Percentage', 'Fixed', 'Per-restaurant arrangement', 'Promotional commission'].map((model) => <option key={model}>{model}</option>)}</select></label>
            <label className="admin-filter-control">{draft.model === 'Fixed' ? 'Fixed commission amount' : 'Commission rate (%)'}<input type="number" min="0" step="0.1" value={draft.model === 'Fixed' ? draft.fixedAmount ?? 0 : draft.rate ?? 0} onChange={(event) => setField(draft.model === 'Fixed' ? 'fixedAmount' : 'rate', Number(event.target.value))} /></label>
            <label className="admin-filter-control">Restaurant arrangement<select value={draft.restaurantId || ''} onChange={(event) => setField('restaurantId', event.target.value)}><option value="">Platform default</option>{ADMIN_MOCK_DATA.restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</select></label>
          </>}
          {draft.category === 'Other Fees' && <>
            <label className="admin-filter-control">Description<input value={draft.description || ''} onChange={(event) => setField('description', event.target.value)} /></label>
            <label className="admin-filter-control">Calculation method<select value={draft.calculation || 'Fixed'} onChange={(event) => setField('calculation', event.target.value)}><option>Fixed</option><option>Percentage</option><option>Rule-based</option></select></label>
            <label className="admin-filter-control">Amount / rate<input type="number" min="0" step="0.01" value={draft.amount ?? 0} onChange={(event) => setField('amount', Number(event.target.value))} /></label>
            <label className="admin-filter-control">Applicability<input value={draft.applicability || ''} onChange={(event) => setField('applicability', event.target.value)} /></label>
          </>}
          <label className="admin-filter-control">Effective date/time<input type="datetime-local" value={formatDateTimeInput(draft.effectiveAt)} onChange={(event) => setField('effectiveAt', event.target.value ? new Date(`${event.target.value}:00+08:00`).toISOString() : '')} /></label>
          <label className="admin-filter-control">End date/time (optional)<input type="datetime-local" value={formatDateTimeInput(draft.endAt)} onChange={(event) => setField('endAt', event.target.value ? new Date(`${event.target.value}:00+08:00`).toISOString() : '')} /></label>
          <label className="admin-filter-control">Special conditions<textarea value={draft.specialConditions || ''} onChange={(event) => setField('specialConditions', event.target.value)} /></label>
        </fieldset>
        {draft.category !== 'Other Fees' && <>
          <fieldset className="admin-choice-group" disabled={!canEdit}><legend>Applicable order types</legend>{ORDER_TYPES.map((type) => <label key={type}><input type="checkbox" checked={orderTypes.includes(type)} onChange={(event) => setField('orderTypes', event.target.checked ? [...orderTypes, type] : orderTypes.filter((value) => value !== type))} />{type}</label>)}</fieldset>
          <fieldset className="admin-choice-group" disabled={!canEdit}><legend>Service areas</legend>{serviceAreas.map((area) => <label key={area.id}><input type="checkbox" checked={serviceAreaIds.includes(area.id)} onChange={(event) => setField('serviceAreaIds', event.target.checked ? [...serviceAreaIds, area.id] : serviceAreaIds.filter((value) => value !== area.id))} />{area.name}</label>)}</fieldset>
        </>}
        <div className="admin-action-row">
          <button className="admin-action-button" type="button" onClick={startSave} disabled={!canEdit}>Save changes</button>
          <button className="admin-action-button" type="button" onClick={() => setDraft(null)}>Close editor</button>
          {!canEdit && <span className="admin-shell-note">This role is view-only for fee configuration.</span>}
        </div>
        </div>
      </Modal>
    );
  }

  const columns = [
    { key: 'name', label: 'Configuration', render: (item) => <><strong>{item.name}</strong><br />{item.description || item.model}{item.restaurantId ? <><br />{ADMIN_MOCK_DATA.restaurants.find((restaurant) => restaurant.id === item.restaurantId)?.name}</> : null}</> },
    { key: 'calculation', label: 'Model / value', render: (item) => item.category === 'Commission' ? (item.model === 'Fixed' ? formatPeso(item.fixedAmount) : `${item.rate}%`) : item.category === 'Delivery Fees' ? `${item.model} · ${formatPeso(item.baseFee)}` : `${item.calculation} · ${formatPeso(item.amount)}` },
    { key: 'effectiveAt', label: 'Effective', render: (item) => formatDateTime(item.effectiveAt) },
    { key: 'status', label: 'Status', render: (item) => <StatusBadge status={item.status} /> },
    { key: 'actions', label: 'Actions', render: (item) => <div className="admin-action-row"><button className="admin-action-button" type="button" disabled={!canEdit} title={!canEdit ? 'This role can view but not edit fee configurations' : undefined} onClick={() => openEditor(item)}>Edit</button>{(ADMIN_FEE_STATUS_TRANSITIONS[item.status] || []).map((status) => <button key={status} className="admin-action-button" type="button" disabled={!canActivate} title={!canActivate ? 'Fee activation permission is required' : undefined} onClick={() => setPendingAction({ type: 'status', configuration: item, status, title: `${status} fee configuration`, confirmLabel: `${status} configuration` })}>{status}</button>)}</div> },
  ];

  const historyRows = configurations.flatMap((configuration) => configuration.versions.map((version, index) => ({
    id: `${configuration.id}-${index}`,
    name: configuration.name,
    who: version.who,
    when: version.when,
    oldValue: version.oldValue || '—',
    newValue: version.newValue,
    reason: version.reason,
  }))).sort((a, b) => new Date(b.when) - new Date(a.when));
  const historyColumns = [
    { key: 'name', label: 'Configuration' },
    { key: 'who', label: 'Changed by' },
    { key: 'when', label: 'When', render: (row) => formatDateTime(row.when) },
    { key: 'oldValue', label: 'Old value' },
    { key: 'newValue', label: 'New value' },
    { key: 'reason', label: 'Reason' },
  ];

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Fees and Commissions" description="Configure prospective platform pricing, restaurant arrangements, and fee previews." actions={canEdit && activeTab !== 'History' ? <button className="admin-action-button" type="button" onClick={() => { const next = createDraft(activeTab); setDraft(next); setPreviewConfigId(next.id); }}>Create draft</button> : null} />
        <p className="admin-shell-note">Historical transaction safety: a fee or commission change never recalculates a placed or completed order. Each order keeps its original fee breakdown snapshot.</p>
        <Tabs items={TABS} value={activeTab} onChange={(tab) => { setActiveTab(tab); setDraft(null); }} label="Fee configuration sections" />
        {activeTab === 'History'
          ? <DataTable columns={historyColumns} rows={historyRows} tableSearch={globalQuery} defaultOrder={[[0, 'desc']]} emptyTitle="No fee version history" emptyDescription="Configuration changes will appear here with actor, timestamp, values, and reason." />
          : <DataTable columns={columns} rows={currentRows} tableSearch={globalQuery} emptyTitle={`No ${activeTab.toLowerCase()} configurations`} emptyDescription="Create a draft configuration to begin. Drafts are not applied to historical orders." />}
        {renderEditor()}
        {activeTab !== 'History' && (
          <section className="admin-record-panel">
            <h2>Fee preview simulator</h2>
            <p>Compare the currently active pricing with the selected or edited proposal. Preview values do not change saved order snapshots.</p>
            <div className="admin-finance-form-grid">
              <label className="admin-filter-control">Sample order<select value={previewOrderId} onChange={(event) => { const order = ADMIN_MOCK_DATA.orders.find((item) => item.id === event.target.value); setPreviewOrderId(event.target.value); setPreviewInput((previous) => ({ ...previous, subtotal: getOrderBreakdown(event.target.value).restaurantSales, restaurantId: order.restaurantIds[0] })); }}>{ADMIN_MOCK_DATA.orders.map((order) => <option key={order.id} value={order.id}>{order.id} · {order.customerName}</option>)}</select></label>
              <label className="admin-filter-control">Restaurant<select value={previewInput.restaurantId} onChange={(event) => setPreviewInput((previous) => ({ ...previous, restaurantId: event.target.value }))}>{ADMIN_MOCK_DATA.restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</select></label>
              <label className="admin-filter-control">Restaurant subtotal<input type="number" min="0" step="0.01" value={previewInput.subtotal} onChange={(event) => setPreviewInput((previous) => ({ ...previous, subtotal: event.target.value }))} /></label>
              <label className="admin-filter-control">Distance (km)<input type="number" min="0" step="0.1" value={previewInput.distance} onChange={(event) => setPreviewInput((previous) => ({ ...previous, distance: event.target.value }))} /></label>
              <label className="admin-filter-control">Delivery zone<select value={previewInput.zone} onChange={(event) => setPreviewInput((previous) => ({ ...previous, zone: event.target.value }))}>{serviceAreas.flatMap((area) => area.zones.map((zone) => zone.name)).map((zone) => <option key={zone}>{zone}</option>)}</select></label>
              <label className="admin-filter-control">Order type<select value={previewInput.orderType} onChange={(event) => setPreviewInput((previous) => ({ ...previous, orderType: event.target.value }))}>{ORDER_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label className="admin-filter-control">Payment method<select value={previewInput.paymentMethod} onChange={(event) => setPreviewInput((previous) => ({ ...previous, paymentMethod: event.target.value }))}>{['Cash on Delivery (COD)', 'GCash', 'Maya', 'Credit Card'].map((method) => <option key={method}>{method}</option>)}</select></label>
              <label className="admin-filter-control">Promotional discount<input type="number" min="0" value={previewInput.discountAmount} onChange={(event) => setPreviewInput((previous) => ({ ...previous, discountAmount: event.target.value }))} /></label>
              <label className="admin-filter-control">Discount funding<select value={previewInput.promoFunding} onChange={(event) => setPreviewInput((previous) => ({ ...previous, promoFunding: event.target.value }))}><option>Platform</option><option>Restaurant</option><option>Shared</option></select></label>
              <label className="admin-filter-control"><span>Promo code applied</span><input type="checkbox" checked={previewInput.promo} onChange={(event) => setPreviewInput((previous) => ({ ...previous, promo: event.target.checked }))} /></label>
              <label className="admin-filter-control"><span>Scheduled delivery</span><input type="checkbox" checked={previewInput.scheduled} onChange={(event) => setPreviewInput((previous) => ({ ...previous, scheduled: event.target.checked }))} /></label>
              <label className="admin-filter-control">Proposal to preview<select value={previewConfigId} onChange={(event) => setPreviewConfigId(event.target.value)}><option value="">Current active configuration</option>{configurations.filter((item) => item.category === 'Delivery Fees' || item.category === 'Commission').map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></label>
    
            <div className="admin-finance-preview-grid">
              {[['Current', currentPreview], ['Proposed', proposedPreview]].map(([label, preview]) => <div className="admin-record-panel" key={label}><h3>{label}{label === 'Proposed' && previewDraft ? ` · ${previewDraft.name}` : ''}</h3><ul className="admin-detail-list"><li><strong>Customer delivery fee</strong>{formatPeso(preview.deliveryFee)}</li><li><strong>Service fees</strong>{formatPeso(preview.serviceFees)}</li><li><strong>Restaurant commission ({preview.commissionRate}%)</strong>{formatPeso(preview.commission)}</li><li><strong>Discount deduction · {preview.discountFunding}</strong>{formatPeso(preview.discount)}</li><li><strong>Platform earnings</strong>{formatPeso(preview.platformEarnings)}</li><li><strong>Restaurant payable</strong>{formatPeso(preview.restaurantPayable)}</li><li><strong>Customer total</strong>{formatPeso(preview.customerTotal)}</li></ul></div>)}
            </div>
            </div>
          </section>
    
    
        )}
        {activeTab === 'Commission' && <p className="admin-shell-note">Commission edits are permission-gated. View-only roles can inspect these records, but cannot edit or activate them.</p>}
        <ConfirmDialog
          open={Boolean(pendingAction)}
          title={pendingAction?.title}
          description="This fee change affects future transactions only. Existing order fee snapshots will not be recalculated."
          confirmLabel={pendingAction?.confirmLabel}
          requireReauthentication
          requireReason
          onClose={() => setPendingAction(null)}
          onConfirm={confirmChange}
        />

      </section>
    </AdminLayout>
  );
}

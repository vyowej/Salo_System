import { useState } from 'react';
import { Link } from 'react-router-dom';
import OwnerLayout from '../../../layouts/OwnerLayout';
import Button from '../../../components/common/Button';
import { DesignPreviewBanner, PreviewPageHeader, PreviewStatePanel } from './team/r7Preview';
import { BUSINESS_SUMMARY, SETTINGS_DEFAULTS, SETTINGS_TABS } from './team/settingsSamples';
import './team/r7Settings.css';

function ToggleRow({ label, description, checked, onChange }) {
  return <label className="r7-setting-toggle"><span><strong>{label}</strong>{description && <small>{description}</small>}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i aria-hidden="true" /></label>;
}

function SettingField({ label, children }) {
  return <label className="r7-setting-field"><span>{label}</span>{children}</label>;
}

export default function OwnerSettingsPage() {
  const [previewState, setPreviewState] = useState('Sample data');
  const [tab, setTab] = useState('Business');
  const [settings, setSettings] = useState(SETTINGS_DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState('');
  const update = (key, value) => { setSettings((current) => ({ ...current, [key]: value })); setDirty(true); };
  const updateNotification = (key, value) => { setSettings((current) => ({ ...current, notifications: { ...current.notifications, [key]: value } })); setDirty(true); };
  const discard = () => { setSettings(SETTINGS_DEFAULTS); setDirty(false); };
  const save = () => { setDirty(false); setToast('Design preview only — these settings were not saved.'); window.setTimeout(() => setToast(''), 2600); };

  return <OwnerLayout>
    <DesignPreviewBanner state={previewState} onStateChange={setPreviewState} />
    <PreviewPageHeader eyebrow="Restaurant preferences" title="Settings" detail="Review how restaurant preferences could be organized." />
    <PreviewStatePanel state={previewState} name="settings" onRetry={() => setPreviewState('Sample data')} />
    {previewState === 'Sample data' && <>
      <div className="r7-tabs r7-settings-tabs" role="tablist" aria-label="Settings category">{SETTINGS_TABS.map((item) => <button type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'is-selected' : ''} key={item} onClick={() => setTab(item)}>{item}</button>)}</div>
      <main className="r7-settings-panel">
        {tab === 'Business' && <section className="r7-settings-section"><div className="r7-settings-section-head"><div><p className="r7-eyebrow">BUSINESS AVAILABILITY</p><h2>{BUSINESS_SUMMARY.name}</h2><p>{BUSINESS_SUMMARY.address}</p></div><span className="r7-settings-avatar">SK</span></div><div className="r7-business-details"><span><small>Contact</small><strong>{BUSINESS_SUMMARY.phone}</strong></span><span><small>Delivery coverage</small><strong>{BUSINESS_SUMMARY.coverage}</strong></span></div><div className="r7-settings-toggles"><ToggleRow label="Accepting delivery orders" checked={settings.delivery} onChange={(value) => update('delivery', value)} /><ToggleRow label="Accepting pickup orders" checked={settings.pickup} onChange={(value) => update('pickup', value)} /><ToggleRow label="Accepting dine-in guests" checked={settings.dineIn} onChange={(value) => update('dineIn', value)} /></div><div className="r7-settings-links"><Link to="/owner/profile">Edit business profile, hours and delivery coverage →</Link><p>Business hours and service areas are managed in Business Profile rather than duplicated here.</p></div></section>}

        {tab === 'Orders' && <section className="r7-settings-section"><p className="r7-eyebrow">ORDER PREFERENCES</p><h2>Fulfillment and preparation</h2><div className="r7-settings-toggles"><ToggleRow label="Delivery" description="Customers may place delivery orders." checked={settings.delivery} onChange={(value) => update('delivery', value)} /><ToggleRow label="Pickup" description="Customers may collect their orders." checked={settings.pickup} onChange={(value) => update('pickup', value)} /><ToggleRow label="Dine-in" description="Customers may order for dine-in." checked={settings.dineIn} onChange={(value) => update('dineIn', value)} /><ToggleRow label="Scheduled ordering" description="Allow customers to select an eligible future order time." checked={settings.scheduledOrders} onChange={(value) => update('scheduledOrders', value)} /><ToggleRow label="Priority ordering" description="Visual preference only; no priority business policy is implied." checked={settings.priorityOrders} onChange={(value) => update('priorityOrders', value)} /></div><div className="r7-form-grid"><SettingField label="Preparation time estimate"><select value={settings.preparationTime} onChange={(event) => update('preparationTime', event.target.value)}><option>15 minutes</option><option>30 minutes</option><option>45 minutes</option><option>60 minutes</option></select></SettingField><SettingField label="Inventory deduction mode"><select value={settings.deductionMode} onChange={(event) => update('deductionMode', event.target.value)}><option value="manual">Manual</option><option value="on_completion">On order completion</option></select></SettingField></div><p className="r7-settings-helper">Inventory deduction options are shown for preview only. Actual policy remains undecided and is not changed here.</p></section>}

        {tab === 'Reservations' && <section className="r7-settings-section"><p className="r7-eyebrow">RESERVATION PREFERENCES</p><h2>Availability and booking details</h2><ToggleRow label="Accepting reservations" checked={settings.acceptingReservations} onChange={(value) => update('acceptingReservations', value)} /><div className="r7-form-grid"><SettingField label="Schedule"><select value={settings.reservationSchedule} onChange={(event) => update('reservationSchedule', event.target.value)}><option>Use business operating hours</option><option>Custom reservation hours</option></select></SettingField><SettingField label="Time slots"><select value={settings.reservationTimeSlots} onChange={(event) => update('reservationTimeSlots', event.target.value)}><option>Every 15 minutes</option><option>Every 30 minutes</option><option>Every 60 minutes</option></select></SettingField><SettingField label="Reservation duration"><select value={settings.reservationDuration} onChange={(event) => update('reservationDuration', event.target.value)}><option value="60">60 minutes</option><option value="90">90 minutes</option><option value="120">120 minutes</option></select></SettingField><SettingField label="Reservation fee (₱)"><input type="number" min="0" value={settings.reservationFee} onChange={(event) => update('reservationFee', event.target.value)} /></SettingField><SettingField label="Payment option"><select value={settings.paymentMethod} onChange={(event) => update('paymentMethod', event.target.value)}><option>Online payment</option><option>Pay at restaurant</option><option>No fee</option></select></SettingField><SettingField label="Table assignment preference"><select value={settings.tablePreference} onChange={(event) => update('tablePreference', event.target.value)}><option>Auto-suggest available table</option><option>Staff assigns table</option><option>Customer requests an area</option></select></SettingField></div><SettingField label="Guest instructions"><textarea rows="4" value={settings.instructions} onChange={(event) => update('instructions', event.target.value)} /></SettingField><p className="r7-settings-helper">Schedule details are sample controls. Business operating hours are edited from Business Profile.</p></section>}

        {tab === 'Notifications' && <section className="r7-settings-section"><p className="r7-eyebrow">NOTIFICATION PREFERENCES</p><h2>Keep the team informed</h2><p className="r7-settings-intro">Choose which event types would generate a restaurant notification.</p><div className="r7-settings-toggles">{Object.entries(settings.notifications).map(([label, checked]) => <ToggleRow key={label} label={label} description={`Preview notification preference for ${label.toLowerCase()}.`} checked={checked} onChange={(value) => updateNotification(label, value)} />)}</div></section>}

        {tab === 'Payments' && <section className="r7-settings-section"><p className="r7-eyebrow">PAYOUT SUMMARY</p><h2>Payment details</h2><p className="r7-settings-intro">Sensitive payout details are never entered in this preview.</p><article className="r7-payout-summary"><span className="r7-payout-icon" aria-hidden="true">₱</span><span><strong>{SETTINGS_DEFAULTS.paymentMethod}</strong><small>Account ending •••• 4821 · Sample masked placeholder</small></span><span className="r7-connected-label">Connected</span></article><div className="r7-protected-note"><strong>Protected payment interface</strong><p>Payout methods and credentials are managed through a protected interface. No card or bank information is requested on this page.</p><button type="button" className="r7-secondary-button" onClick={() => setToast('Design preview only — protected payment management is not connected.')}>Manage payment method</button></div><p className="r7-settings-helper">This masked account ending is fictional sample text, not a real account number.</p></section>}
      </main>
      <div className={`r7-save-bar ${dirty ? 'is-dirty' : ''}`} role="status"><span>{dirty ? 'Unsaved preview changes' : 'No unsaved changes'} <small>Changes are local to this page and are never persisted.</small></span><div><Button variant="outline" onClick={discard} disabled={!dirty}>Discard</Button><Button onClick={save} disabled={!dirty}>Save preview</Button></div></div>
    </>}
    {toast && <div className="r7-toast" role="status">{toast}</div>}
  </OwnerLayout>;
}

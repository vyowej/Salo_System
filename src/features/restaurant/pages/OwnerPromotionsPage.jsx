import { useMemo, useState } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import Button from '../../../components/common/Button';
import { DesignPreviewBanner, PreviewDialog, PreviewPageHeader, PreviewStatePanel, StatusBadge } from './team/r7Preview';
import { PROMOTION_CATEGORY_SAMPLES, PROMOTION_FILTERS, PROMOTION_ITEM_SAMPLES, PROMOTION_SAMPLES } from './team/promotionsSamples';
import './team/r7Promotions.css';

const blankPromotion = {
  name: '', description: '', type: 'Percent', value: '', start: '', end: '',
  minimum: '', limit: '', items: [], categories: [], imageName: '',
};

function PromotionForm({ promotion, onClose, onToast }) {
  const [values, setValues] = useState(promotion ? {
    name: promotion.name, description: promotion.description, type: promotion.type,
    value: String(promotion.value), start: '', end: '', minimum: String(promotion.minimum),
    limit: String(promotion.limit), items: promotion.items, categories: promotion.categories, imageName: '',
  } : blankPromotion);
  const update = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const toggleList = (key, value) => update(key, values[key].includes(value) ? values[key].filter((item) => item !== value) : [...values[key], value]);

  return (
    <div className="r7-promo-form">
      <label className="r7-field">Promotion name<input value={values.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. Weekday Merienda" /></label>
      <label className="r7-field">Description<textarea value={values.description} onChange={(event) => update('description', event.target.value)} rows="2" placeholder="A short customer-facing description" /></label>
      <div className="r7-form-grid">
        <label className="r7-field">Discount type<select value={values.type} onChange={(event) => update('type', event.target.value)}><option>Percent</option><option>Fixed amount</option></select></label>
        <label className="r7-field">Discount value<input type="number" min="1" value={values.value} onChange={(event) => update('value', event.target.value)} placeholder={values.type === 'Percent' ? '15' : '100'} /></label>
        <label className="r7-field">Start date<input type="date" value={values.start} onChange={(event) => update('start', event.target.value)} /></label>
        <label className="r7-field">End date<input type="date" value={values.end} onChange={(event) => update('end', event.target.value)} /></label>
        <label className="r7-field">Minimum purchase (₱)<input type="number" min="0" value={values.minimum} onChange={(event) => update('minimum', event.target.value)} placeholder="250" /></label>
        <label className="r7-field">Usage limit<input type="number" min="1" value={values.limit} onChange={(event) => update('limit', event.target.value)} placeholder="150" /></label>
      </div>
      <fieldset className="r7-choice-field"><legend>Eligible items</legend><div className="r7-check-grid">{PROMOTION_ITEM_SAMPLES.map((item) => <label key={item}><input type="checkbox" checked={values.items.includes(item)} onChange={() => toggleList('items', item)} />{item}</label>)}</div></fieldset>
      <fieldset className="r7-choice-field"><legend>Eligible categories</legend><div className="r7-check-grid">{PROMOTION_CATEGORY_SAMPLES.map((item) => <label key={item}><input type="checkbox" checked={values.categories.includes(item)} onChange={() => toggleList('categories', item)} />{item}</label>)}</div></fieldset>
      <label className="r7-upload-look">Promotion image <span>Optional · JPG, PNG or WebP</span><span className="r7-upload-drop">＋<strong>{values.imageName || 'Choose an image or drop it here'}</strong><small>Design preview only — no file is uploaded</small><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => update('imageName', event.target.files?.[0]?.name || '')} aria-label="Choose a promotion preview image" /></span></label>
      <section className="r7-customer-preview" aria-label="Customer promotion preview"><span className="r7-eyebrow">CUSTOMER PREVIEW</span><span className="r7-promo-discount">{values.type === 'Percent' ? `${values.value || '15'}% OFF` : `₱${values.value || '100'} OFF`}</span><strong>{values.name || 'Your promotion name'}</strong><p>{values.description || 'Your promotion description will appear here.'}</p><small>{values.items.length ? values.items.join(' · ') : 'Selected items and categories'}</small></section>
      <div className="r7-dialog-actions"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => { onClose(); onToast('Design preview only — this promotion was not saved.'); }}>Save preview</Button></div>
    </div>
  );
}

export default function OwnerPromotionsPage() {
  const [previewState, setPreviewState] = useState('Sample data');
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState('');
  const [activeOverrides, setActiveOverrides] = useState({});
  const filtered = useMemo(() => PROMOTION_SAMPLES.filter((item) => {
    const status = activeOverrides[item.id] || item.status;
    return (filter === 'All' || status === filter)
      && `${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase());
  }), [filter, search, activeOverrides]);
  const showToast = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2600); };
  const openForm = (promotion = null) => { setEditing(promotion); setOpen(true); };

  return <OwnerLayout>
    <DesignPreviewBanner state={previewState} onStateChange={setPreviewState} />
    <PreviewPageHeader eyebrow="Restaurant growth" title="Promotions" detail="Preview offers and how they could appear to your customers." action={<Button onClick={() => openForm()} leftIcon={<span aria-hidden="true">＋</span>}>Create promotion</Button>} />
    <PreviewStatePanel state={previewState} name="promotions" onRetry={() => setPreviewState('Sample data')} />
    {previewState === 'Sample data' && <>
      <div className="r7-promo-toolbar"><div className="r7-tabs" role="tablist" aria-label="Filter promotions">{PROMOTION_FILTERS.map((item) => <button type="button" role="tab" aria-selected={filter === item} className={filter === item ? 'is-selected' : ''} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div><label className="r7-search"><span className="sr-only">Search promotions</span><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search promotions" /></label></div>
      {filtered.length ? <div className="r7-promotion-grid">{filtered.map((promotion) => {
        const status = activeOverrides[promotion.id] || promotion.status;
        const unavailable = status === 'Expired' || status === 'Inactive';
        return <article className={`r7-promotion-card ${unavailable ? 'is-unavailable' : ''}`} key={promotion.id}>
          <div className="r7-promo-card-top"><div className="r7-promo-art" aria-hidden="true">{promotion.type === 'Percent' ? '%' : '₱'}</div><StatusBadge status={status} /></div>
          <div className="r7-promo-card-content"><p className="r7-eyebrow">{promotion.type === 'Percent' ? `${promotion.value}% discount` : `₱${promotion.value} discount`}</p><h2>{promotion.name}</h2><p>{promotion.description}</p><div className="r7-promo-dates"><span>Starts <strong>{promotion.start}</strong></span><span>Ends <strong>{promotion.end}</strong></span></div>
            <div className="r7-usage-label"><span>Usage</span><strong>{promotion.usage} / {promotion.limit}</strong></div><div className="r7-usage-track" role="progressbar" aria-label={`${promotion.name} usage`} aria-valuenow={promotion.usage} aria-valuemin="0" aria-valuemax={promotion.limit}><span style={{ width: `${Math.min(100, promotion.usage / promotion.limit * 100)}%` }} /></div>
            <div className="r7-promo-performance"><span>Attributed sales <strong>{promotion.performance}</strong></span><span>Minimum <strong>₱{promotion.minimum}</strong></span></div>
          </div>
          <footer className="r7-promo-card-footer"><label className="r7-inline-toggle"><input type="checkbox" checked={!unavailable && status === 'Active'} onChange={(event) => { const next = event.target.checked ? 'Active' : 'Inactive'; setActiveOverrides((current) => ({ ...current, [promotion.id]: next })); }} aria-label={`${status === 'Active' ? 'Deactivate' : 'Activate'} ${promotion.name}`} /><span className="r7-switch" /><span>{status === 'Active' ? 'Active' : 'Inactive'}</span></label><div><button type="button" className="r7-link-button" onClick={() => openForm(promotion)}>Edit preview</button><button type="button" className="r7-link-button" onClick={() => showToast('Design preview only — performance details are sample data.')}>View details</button></div></footer>
        </article>;
      })}</div> : <div className="r7-state-panel r7-empty-state"><span aria-hidden="true">✦</span><h2>No matching promotions</h2><p>Try a different filter or search phrase.</p></div>}
      <p className="r7-expired-note">Expired and inactive promotions appear muted and are unavailable to customers.</p>
    </>}
    <PreviewDialog open={open} onClose={() => setOpen(false)} title={editing ? 'Edit promotion preview' : 'Create promotion preview'}><PromotionForm key={editing?.id || 'new'} promotion={editing} onClose={() => setOpen(false)} onToast={showToast} /></PreviewDialog>
    {toast && <div className="r7-toast" role="status">{toast}</div>}
  </OwnerLayout>;
}

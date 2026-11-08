import { useCallback, useEffect, useMemo, useState } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import ImageUploader from '../../../components/common/ImageUploader';
import RestaurantImage from '../../customer/components/RestaurantImage';
import { EmptyState, ErrorState, LoadingSpinner } from '../../../components/feedback';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import {
  MENU_AVAILABILITY,
  getMenuCustomerPrice,
  normalizeMenuCategories,
  normalizeMenuItem,
  validateMenuItem,
} from '../menu/menuData';

const EMPTY_ITEM = {
  name: '',
  description: '',
  price: '',
  discountedPrice: '',
  category: '',
  availability: 'available',
  photo: null,
  preparationInfo: '',
  dietaryInfo: [],
  addOns: [],
};
const AVAILABILITY_LABELS = {
  available: 'Available',
  sold_out: 'Sold out',
  temporarily_unavailable: 'Temporarily unavailable',
  hidden: 'Hidden from customers',
};
const CONTROL_STYLE = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--input-bg)',
  color: 'var(--text-primary)',
  font: 'inherit',
};

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function addOnGroup() {
  return { id: createId('addon'), name: '', minSelection: 0, maxSelection: 1, isAvailable: true, options: [{ name: '', price: 0, isAvailable: true }] };
}

function Field({ label, children, error }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
      <span>{label}</span>
      {children}
      {error && <span className="form-error" role="alert">{error}</span>}
    </label>
  );
}

export default function OwnerMenuPage() {
  const access = useRestaurantAccess();
  const { selectedRestaurantId } = access;
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(EMPTY_ITEM);
  const [formErrors, setFormErrors] = useState({});
  const [deleteId, setDeleteId] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [deleteCategory, setDeleteCategory] = useState(null);
  const [replacementCategoryId, setReplacementCategoryId] = useState('');

  const loadMenu = useCallback(() => {
    setLoading(true);
    setError('');
    try {
      const items = ownerService.getMenuItems(selectedRestaurantId).map(normalizeMenuItem);
      setMenuItems(items);
      setCategories(normalizeMenuCategories({
        categories: ownerService.getMenuCategories(selectedRestaurantId),
      }));
      setSelectedCategory('All');
    } catch (loadError) {
      setError(loadError.message || 'Unable to load menu data.');
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const filteredItems = useMemo(() => menuItems.filter((item) => {
    const categoryMatches = selectedCategory === 'All' || item.category === selectedCategory;
    const text = `${item.name} ${item.description || ''} ${(item.dietaryInfo || []).join(' ')}`.toLowerCase();
    const searchMatches = text.includes(searchQuery.trim().toLowerCase());
    const availabilityMatches = availabilityFilter === 'all' || item.availability === availabilityFilter;
    const tracked = item.stockQuantity !== null && item.stockQuantity !== undefined
      && item.stockQuantity !== '' && Number.isFinite(Number(item.stockQuantity));
    const stockMatches = stockFilter === 'all'
      || (stockFilter === 'untracked' && !tracked)
      || (stockFilter === 'in-stock' && tracked && Number(item.stockQuantity) > 0)
      || (stockFilter === 'out-of-stock' && tracked && Number(item.stockQuantity) <= 0);
    return categoryMatches && searchMatches && availabilityMatches && stockMatches;
  }), [availabilityFilter, menuItems, searchQuery, selectedCategory, stockFilter]);

  function openAddItem() {
    if (!categories.length) {
      setError('Create a menu category before adding an item.');
      return;
    }
    setEditingItem(null);
    setFormData({ ...EMPTY_ITEM, category: categories[0].name });
    setFormErrors({});
    setModalOpen(true);
  }

  function openEditItem(item) {
    setEditingItem(item);
    setFormData({
      ...EMPTY_ITEM,
      ...item,
      price: String(item.price),
      discountedPrice: item.discountedPrice === '' ? '' : String(item.discountedPrice ?? ''),
      dietaryInfo: [...(item.dietaryInfo || [])],
      addOns: structuredClone(item.addOns || []),
    });
    setFormErrors({});
    setModalOpen(true);
  }

  function canEditForm() {
    return access.canAccess(['menu.items.edit'])
      || access.canAccess(['menu.pricing.manage'])
      || access.canAccess(['menu.photos.manage'])
      || access.canAccess(['menu.availability.manage'])
      || access.canAccess(['menu.addons.manage']);
  }

  async function handleSaveItem(event) {
    event.preventDefault();
    setError('');
    const canManagePricing = access.canAccess(['menu.pricing.manage']);
    const nextItem = { ...formData };
    if (editingItem) {
      if (!canManagePricing) {
        nextItem.price = editingItem.price;
        nextItem.discountedPrice = editingItem.discountedPrice ?? '';
      }
      if (!access.canAccess(['menu.availability.manage'])) nextItem.availability = editingItem.availability;
      if (!access.canAccess(['menu.photos.manage'])) nextItem.photo = editingItem.photo || null;
      if (!access.canAccess(['menu.addons.manage'])) nextItem.addOns = editingItem.addOns || [];
    }
    const validationErrors = validateMenuItem(nextItem, { canManagePricing: canManagePricing || !editingItem });
    if (Object.keys(validationErrors).length) {
      setFormErrors(validationErrors);
      return;
    }
    if (editingItem && !canEditForm()) {
      setError('You do not have permission to edit this menu item.');
      return;
    }
    if (!editingItem && !access.canAccess(['menu.items.create', 'menu.pricing.manage'])) {
      setError('Creating a menu item requires both item creation and pricing permissions.');
      return;
    }

    const beforePhoto = editingItem?.photo;
    setSaving(true);
    try {
      const payload = (!editingItem || access.canAccess(['menu.items.edit'])) ? {
        name: nextItem.name.trim(),
        description: nextItem.description.trim(),
        category: nextItem.category,
        preparationInfo: nextItem.preparationInfo.trim(),
        dietaryInfo: nextItem.dietaryInfo,
      } : {};
      if (!editingItem || canManagePricing) {
        payload.price = Number(nextItem.price);
        payload.discountedPrice = nextItem.discountedPrice === '' ? null : Number(nextItem.discountedPrice);
      }
      if (!editingItem || access.canAccess(['menu.availability.manage'])) payload.availability = nextItem.availability;
      if (!editingItem || access.canAccess(['menu.photos.manage'])) payload.photo = nextItem.photo;
      if (!editingItem || access.canAccess(['menu.addons.manage'])) payload.addOns = nextItem.addOns;

      if (editingItem) {
        ownerService.updateMenuItem(editingItem.id, payload, selectedRestaurantId);
      } else {
        ownerService.addMenuItem({ ...payload, isAvailable: payload.availability === 'available' }, selectedRestaurantId);
      }
      setModalOpen(false);
      loadMenu();
      if (beforePhoto?.id && beforePhoto.id !== nextItem.photo?.id) {
        try {
          await ownerService.removeImage(beforePhoto);
        } catch (cleanupError) {
          setError(`Menu item saved, but its previous photo could not be removed: ${cleanupError.message}`);
        }
      }
    } catch (saveError) {
      setError(saveError.message || 'Unable to save the menu item.');
    } finally {
      setSaving(false);
    }
  }

  async function closeItemModal() {
    const stagedPhoto = formData.photo;
    if (stagedPhoto?.id && stagedPhoto.id !== editingItem?.photo?.id) {
      try {
        await ownerService.removeImage(stagedPhoto);
      } catch (cleanupError) {
        setError(`Unable to remove the unsaved menu photo: ${cleanupError.message}`);
      }
    }
    setModalOpen(false);
  }

  function handlePhotoChange(photo) {
    const previousPhoto = formData.photo;
    setFormData((current) => ({ ...current, photo }));
    if (previousPhoto?.id && previousPhoto.id !== editingItem?.photo?.id && previousPhoto.id !== photo?.id) {
      ownerService.removeImage(previousPhoto).catch((cleanupError) => {
        setError(`Unable to remove the replaced draft photo: ${cleanupError.message}`);
      });
    }
  }

  function updateAvailability(item, availability) {
    if (!access.canAccess(['menu.availability.manage'])) {
      setError('You do not have permission to change availability.');
      return;
    }
    try {
      ownerService.updateMenuItem(item.id, { availability }, selectedRestaurantId);
      loadMenu();
    } catch (updateError) {
      setError(updateError.message || 'Unable to update availability.');
    }
  }

  async function removeMenuItem(id) {
    if (!access.canAccess(['menu.items.delete'])) {
      setError('You do not have permission to remove menu items.');
      return;
    }
    const item = menuItems.find((entry) => entry.id === id);
    try {
      ownerService.deleteMenuItem(id, selectedRestaurantId);
      setDeleteId(null);
      loadMenu();
      if (item?.photo?.id) {
        try {
          await ownerService.removeImage(item.photo);
        } catch (cleanupError) {
          setError(`Menu item removed, but its photo could not be removed: ${cleanupError.message}`);
        }
      }
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to remove the menu item.');
    }
  }

  function saveCategories(nextCategories, categoryChanges = []) {
    if (!access.canAccess(['menu.categories.manage'])) {
      setError('You do not have permission to manage menu categories.');
      return;
    }
    try {
      const saved = ownerService.saveMenuCategories(nextCategories, selectedRestaurantId, categoryChanges);
      setCategories(normalizeMenuCategories({ categories: saved }));
      if (selectedCategory !== 'All' && !saved.some((category) => category.name === selectedCategory)) {
        setSelectedCategory('All');
      }
      setError('');
      return true;
    } catch (saveError) {
      setError(saveError.message || 'Unable to save menu categories.');
      return false;
    }
  }

  function submitCategory(event) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) {
      setError('Enter a category name.');
      return;
    }
    if (categories.some((category) => category.name.toLowerCase() === name.toLowerCase()
      && category.id !== editingCategoryId)) {
      setError('A category with that name already exists.');
      return;
    }
    const existingIndex = categories.findIndex((category) => category.id === editingCategoryId);
    const next = [...categories];
    let categoryChanges = [];
    if (existingIndex >= 0) {
      const previousName = next[existingIndex].name;
      if (previousName !== name) categoryChanges = [{ from: previousName, to: name }];
      next[existingIndex] = { ...next[existingIndex], name };
    }
    else next.push({ id: createId('category'), name, visible: true, sortOrder: next.length });
    if (saveCategories(next, categoryChanges)) {
      setCategoryName('');
      setEditingCategoryId(null);
      loadMenu();
    }
  }

  function confirmDeleteCategory() {
    if (!deleteCategory) return;
    const itemsUsingCategory = menuItems.filter((item) => item.category === deleteCategory.name);
    if (itemsUsingCategory.length && !replacementCategoryId) {
      setError('Choose another category for the menu items before removing this category.');
      return;
    }
    try {
      const changes = itemsUsingCategory.length
        ? [{ from: deleteCategory.name, to: categories.find((category) => category.id === replacementCategoryId).name }]
        : [];
      if (!saveCategories(categories.filter((category) => category.id !== deleteCategory.id), changes)) return;
      setDeleteCategory(null);
      setReplacementCategoryId('');
      loadMenu();
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to remove the category.');
    }
  }

  function updateAddOnGroup(groupIndex, patch) {
    setFormData((current) => ({
      ...current,
      addOns: current.addOns.map((group, index) => index === groupIndex ? { ...group, ...patch } : group),
    }));
  }

  function updateAddOnOption(groupIndex, optionIndex, patch) {
    setFormData((current) => ({
      ...current,
      addOns: current.addOns.map((group, index) => index === groupIndex
        ? { ...group, options: group.options.map((option, optionPosition) => optionPosition === optionIndex ? { ...option, ...patch } : option) }
        : group),
    }));
  }

  if (loading) return <OwnerLayout><LoadingSpinner size="lg" label="Loading menu..." /></OwnerLayout>;
  if (error && menuItems.length === 0 && categories.length === 0) {
    return <OwnerLayout><ErrorState description={error} onRetry={loadMenu} /></OwnerLayout>;
  }

  return (
    <OwnerLayout>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Menu Catalog · Demo data</span>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}>Menu Management</h1>
          <p className="page-subtitle">Organize categories, manage item details and control customer availability.</p>
        </div>
        {access.canAccess(['menu.items.create', 'menu.pricing.manage']) && (
          <Button variant="primary" size="md" onClick={openAddItem}>+ Add New Item</Button>
        )}
      </header>

      {error && <div className="form-error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      <section style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--font-size-md)' }}>Menu categories</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', margin: '4px 0 0' }}>Hidden categories and their items do not appear on the customer menu.</p>
          </div>
        </div>
        {categories.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No categories yet. Add one before creating menu items.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {categories.map((category, index) => (
            <div key={category.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border-secondary)', paddingTop: 8 }}>
              <span style={{ flex: 1, minWidth: 140, fontWeight: 600, color: category.visible ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {category.name}{!category.visible && ' · Hidden'}
              </span>
              {access.canAccess(['menu.categories.manage']) && <>
                <Button variant="outline" size="sm" disabled={index === 0} onClick={() => saveCategories(categories.map((entry, order) => order === index ? categories[index - 1] : order === index - 1 ? categories[index] : entry))}>Move up</Button>
                <Button variant="outline" size="sm" disabled={index === categories.length - 1} onClick={() => saveCategories(categories.map((entry, order) => order === index ? categories[index + 1] : order === index + 1 ? categories[index] : entry))}>Move down</Button>
                <Button variant="outline" size="sm" onClick={() => saveCategories(categories.map((entry) => entry.id === category.id ? { ...entry, visible: !entry.visible } : entry))}>{category.visible ? 'Hide' : 'Show'}</Button>
                <Button variant="outline" size="sm" onClick={() => { setEditingCategoryId(category.id); setCategoryName(category.name); }}>Rename</Button>
                <Button variant="danger-outline" size="sm" onClick={() => { setDeleteCategory(category); setReplacementCategoryId(categories.find((entry) => entry.id !== category.id)?.id || ''); }}>Remove</Button>
              </>}
            </div>
          ))}
        </div>
        {access.canAccess(['menu.categories.manage']) && (
          <form onSubmit={submitCategory} style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <input aria-label="Category name" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="New category name" style={{ ...CONTROL_STYLE, flex: 1, minWidth: 200 }} />
            <Button type="submit" variant="primary" size="sm">{editingCategoryId ? 'Save category' : 'Add category'}</Button>
            {editingCategoryId && <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingCategoryId(null); setCategoryName(''); }}>Cancel</Button>}
          </form>
        )}
      </section>

      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        <input aria-label="Search menu" type="search" placeholder="Search dish, ingredients, or dietary info..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} style={{ ...CONTROL_STYLE, flex: 1, minWidth: 220, maxWidth: 380 }} />
        <select aria-label="Filter by availability" value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)} style={{ ...CONTROL_STYLE, width: 'auto', minWidth: 170 }}>
          <option value="all">All availability</option>
          {MENU_AVAILABILITY.map((status) => <option key={status} value={status}>{AVAILABILITY_LABELS[status]}</option>)}
        </select>
        <select aria-label="Filter by stock" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} style={{ ...CONTROL_STYLE, width: 'auto', minWidth: 150 }}>
          <option value="all">All stock</option>
          <option value="untracked">Not tracked</option>
          <option value="in-stock">In stock</option>
          <option value="out-of-stock">Out of stock</option>
        </select>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', maxWidth: '100%' }}>
          {['All', ...categories.map((category) => category.name)].map((name) => (
            <button key={name} type="button" onClick={() => setSelectedCategory(name)} aria-pressed={selectedCategory === name} style={{
              padding: '7px 14px', borderRadius: 'var(--radius-full)', border: selectedCategory === name ? '1px solid var(--accent)' : '1px solid var(--border-primary)',
              background: selectedCategory === name ? 'var(--accent)' : 'var(--surface-primary)', color: selectedCategory === name ? '#fff' : 'var(--text-primary)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{name}</button>
          ))}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <EmptyState title={menuItems.length ? 'No menu items match these filters' : 'No menu items yet'} description={menuItems.length ? 'Try another category or clear the search and filters.' : 'Create a category, then add a menu item.'} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 290px), 1fr))', gap: 'var(--space-5)' }}>
          {filteredItems.map((item) => (
            <article key={item.id} style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 14, opacity: item.availability === 'hidden' ? 0.7 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                {item.photo ? (
                  <RestaurantImage image={item.photo} alt={item.photo.alt || item.name} style={{ width: 64, height: 64, borderRadius: 'var(--radius-lg)', flex: '0 0 64px' }} />
                ) : <div aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 'var(--radius-lg)', display: 'grid', placeItems: 'center', background: 'var(--bg-secondary)', fontSize: 30, flex: '0 0 64px' }}>{item.image || '🍲'}</div>}
                <Badge variant={item.availability === 'available' ? 'success' : item.availability === 'hidden' ? 'default' : 'warning'} size="sm">{AVAILABILITY_LABELS[item.availability]}</Badge>
              </div>
              <div style={{ minHeight: 100 }}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 700 }}>{item.category}</span>
                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0' }}>{item.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', lineHeight: 1.5, margin: 0 }}>{item.description}</p>
                {item.dietaryInfo.length > 0 && <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: '6px 0' }}>{item.dietaryInfo.join(' · ')}</p>}
              </div>
              <div style={{ borderTop: '1px solid var(--border-secondary)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div>
                  {item.discountedPrice && <del style={{ color: 'var(--text-muted)', fontSize: 12 }}>₱{item.price.toLocaleString('en-PH')}</del>}
                  <div style={{ fontWeight: 700, color: 'var(--accent)' }}>₱{getMenuCustomerPrice(item).toLocaleString('en-PH')}</div>
                        <small style={{ color: 'var(--text-muted)' }}>{item.stockQuantity !== null && item.stockQuantity !== undefined && item.stockQuantity !== '' && Number.isFinite(Number(item.stockQuantity)) ? `${item.stockQuantity} in stock` : 'Stock not tracked'}</small>
                </div>
                {access.canAccess(['menu.availability.manage']) && (
                  <select aria-label={`Availability for ${item.name}`} value={item.availability} onChange={(event) => updateAvailability(item, event.target.value)} style={{ ...CONTROL_STYLE, width: 'auto', maxWidth: 170, padding: '7px 8px', fontSize: 12 }}>
                    {MENU_AVAILABILITY.map((status) => <option key={status} value={status}>{AVAILABILITY_LABELS[status]}</option>)}
                  </select>
                )}
              </div>
              {deleteId === item.id ? (
                <div role="alertdialog" aria-label={`Remove ${item.name}?`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, fontSize: 12 }}>Remove this item?</span>
                  <Button variant="danger" size="sm" onClick={() => removeMenuItem(item.id)}>Remove</Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(null)}>Cancel</Button>
                </div>
              ) : (canEditForm() || access.canAccess(['menu.items.delete'])) && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {canEditForm() && <Button variant="outline" size="sm" onClick={() => openEditItem(item)}>Edit item</Button>}
                  {access.canAccess(['menu.items.delete']) && <Button variant="ghost" size="sm" onClick={() => setDeleteId(item.id)}>Remove</Button>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => !saving && closeItemModal()} title={editingItem ? 'Edit menu item' : 'Add menu item'} size="lg" footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <Button variant="ghost" onClick={closeItemModal} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={handleSaveItem} loading={saving}>{editingItem ? 'Save changes' : 'Add to menu'}</Button>
        </div>
      }>
        <form onSubmit={handleSaveItem} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {formErrors.name && <p className="form-error" role="alert">{formErrors.name}</p>}
          {(!editingItem || access.canAccess(['menu.items.edit'])) && <Field label="Item name">
            <input required value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} style={CONTROL_STYLE} />
          </Field>}
          {(!editingItem || access.canAccess(['menu.items.edit'])) && <Field label="Description">
            <textarea rows={3} value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} style={CONTROL_STYLE} />
          </Field>}
          {(!editingItem || access.canAccess(['menu.items.edit'])) && <Field label="Category" error={formErrors.category}>
            <select required value={formData.category} onChange={(event) => setFormData({ ...formData, category: event.target.value })} style={CONTROL_STYLE}>
              {categories.filter((category) => category.visible || category.name === formData.category).map((category) => <option key={category.id} value={category.name}>{category.name}{category.visible ? '' : ' (hidden)'}</option>)}
            </select>
          </Field>}
          {access.canAccess(['menu.pricing.manage']) && <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Field label="Regular price (₱)" error={formErrors.price}>
                <input type="number" min="0.01" step="0.01" required value={formData.price} onChange={(event) => setFormData({ ...formData, price: event.target.value })} style={CONTROL_STYLE} />
              </Field>
              <Field label="Discounted price (optional)" error={formErrors.discountedPrice}>
                <input type="number" min="0.01" step="0.01" value={formData.discountedPrice} onChange={(event) => setFormData({ ...formData, discountedPrice: event.target.value })} style={CONTROL_STYLE} />
              </Field>
            </div>
          </>}
          {access.canAccess(['menu.availability.manage']) && <Field label="Availability" error={formErrors.availability}>
            <select value={formData.availability} onChange={(event) => setFormData({ ...formData, availability: event.target.value })} style={CONTROL_STYLE}>
              {MENU_AVAILABILITY.map((status) => <option key={status} value={status}>{AVAILABILITY_LABELS[status]}</option>)}
            </select>
          </Field>}
          {access.canAccess(['menu.photos.manage']) && <ImageUploader id="menu-item-photo" label="Menu item photo" value={formData.photo} onChange={handlePhotoChange} deferCleanup />}
          {(!editingItem || access.canAccess(['menu.items.edit'])) && <Field label="Preparation information">
            <input value={formData.preparationInfo} onChange={(event) => setFormData({ ...formData, preparationInfo: event.target.value })} placeholder="Optional preparation or serving notes" style={CONTROL_STYLE} />
          </Field>}
          {(!editingItem || access.canAccess(['menu.items.edit'])) && <Field label="Dietary information (comma separated)">
            <input value={formData.dietaryInfo.join(', ')} onChange={(event) => setFormData({ ...formData, dietaryInfo: event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean) })} placeholder="e.g. Vegetarian, Contains dairy" style={CONTROL_STYLE} />
          </Field>}
          {access.canAccess(['menu.addons.manage']) && (
            <section style={{ borderTop: '1px solid var(--border-secondary)', paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontSize: 'var(--font-size-md)' }}>Add-on groups</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => setFormData({ ...formData, addOns: [...formData.addOns, addOnGroup()] })}>Add group</Button>
              </div>
              {formData.addOns.map((group, groupIndex) => (
                <fieldset key={group.id || groupIndex} style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', padding: 12, margin: '12px 0' }}>
                  <legend>Add-on group {groupIndex + 1}</legend>
                  {formErrors[`addOnGroup${groupIndex}`] && <p className="form-error" role="alert">{formErrors[`addOnGroup${groupIndex}`]}</p>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, alignItems: 'end' }}>
                    <Field label="Group name"><input value={group.name} onChange={(event) => updateAddOnGroup(groupIndex, { name: event.target.value })} style={CONTROL_STYLE} /></Field>
                    <Field label="Selection">
                      <select value={Number(group.minSelection) > 0 ? 'required' : 'optional'} onChange={(event) => updateAddOnGroup(groupIndex, { minSelection: event.target.value === 'required' ? Math.max(1, Number(group.minSelection) || 0) : 0 })} style={CONTROL_STYLE}>
                        <option value="required">Required</option>
                        <option value="optional">Optional</option>
                      </select>
                    </Field>
                    <Field label="Min"><input type="number" min="0" value={group.minSelection} onChange={(event) => updateAddOnGroup(groupIndex, { minSelection: Number(event.target.value) })} style={CONTROL_STYLE} /></Field>
                    <Field label="Max"><input type="number" min="1" value={group.maxSelection} onChange={(event) => updateAddOnGroup(groupIndex, { maxSelection: Number(event.target.value) })} style={CONTROL_STYLE} /></Field>
                    <Button type="button" variant="danger-outline" size="sm" onClick={() => setFormData({ ...formData, addOns: formData.addOns.filter((_, index) => index !== groupIndex) })}>Remove</Button>
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 'var(--font-size-xs)' }}>
                    <input type="checkbox" checked={group.isAvailable !== false} onChange={(event) => updateAddOnGroup(groupIndex, { isAvailable: event.target.checked })} />
                    Group available to customers
                  </label>
                  {group.options.map((option, optionIndex) => (
                    <div key={`${group.id || groupIndex}-${optionIndex}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, alignItems: 'end', marginTop: 8 }}>
                      <Field label="Option name"><input value={option.name} onChange={(event) => updateAddOnOption(groupIndex, optionIndex, { name: event.target.value })} style={CONTROL_STYLE} /></Field>
                      <Field label="Extra price (₱)"><input type="number" min="0" step="0.01" value={option.price} onChange={(event) => updateAddOnOption(groupIndex, optionIndex, { price: event.target.value })} style={CONTROL_STYLE} /></Field>
                      <label style={{ fontSize: 12 }}><input type="checkbox" checked={option.isAvailable !== false} onChange={(event) => updateAddOnOption(groupIndex, optionIndex, { isAvailable: event.target.checked })} /> Available</label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => updateAddOnGroup(groupIndex, { options: group.options.filter((_, index) => index !== optionIndex) })}>Remove option</Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => updateAddOnGroup(groupIndex, { options: [...group.options, { name: '', price: 0, isAvailable: true }] })} style={{ marginTop: 8 }}>Add option</Button>
                </fieldset>
              ))}
              {formData.addOns.length > 0 && (
                <div role="region" aria-label="Customer add-on preview" style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                  <strong style={{ fontSize: 'var(--font-size-sm)' }}>Customer customization preview</strong>
                  {formData.addOns.filter((group) => group.isAvailable !== false).map((group, groupIndex) => (
                    <div key={group.id || groupIndex} style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, fontWeight: 600 }}>
                        <span>{group.name || 'Unnamed group'}</span>
                        <span>{Number(group.minSelection) > 0 ? `Choose at least ${group.minSelection}` : 'Optional'} · Max {group.maxSelection}</span>
                      </div>
                      {group.options.map((option, optionIndex) => (
                        <div key={`${option.name}-${optionIndex}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '4px 0', color: option.isAvailable === false ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                          <span>{option.name || 'Unnamed option'}{option.isAvailable === false && ' · Unavailable'}</span>
                          <span>{Number(option.price) > 0 ? `+₱${Number(option.price).toLocaleString('en-PH')}` : 'Free'}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </form>
      </Modal>

      <Modal open={Boolean(deleteCategory)} onClose={() => setDeleteCategory(null)} title="Remove menu category" size="sm" footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
          <Button variant="ghost" onClick={() => setDeleteCategory(null)}>Cancel</Button>
          <Button variant="danger" onClick={confirmDeleteCategory}>Remove category</Button>
        </div>
      }>
        <p>Remove “{deleteCategory?.name}” from the menu?</p>
        {menuItems.some((item) => item.category === deleteCategory?.name) && (
          <Field label="Move its menu items to">
            <select value={replacementCategoryId} onChange={(event) => setReplacementCategoryId(event.target.value)} style={CONTROL_STYLE}>
              {categories.filter((category) => category.id !== deleteCategory?.id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </Field>
        )}
      </Modal>
    </OwnerLayout>
  );
}

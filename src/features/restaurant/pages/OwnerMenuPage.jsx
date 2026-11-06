import { useState, useEffect } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import { Input, Textarea, Select } from '../../../components/forms';

export default function OwnerMenuPage() {
  const [menuItems, setMenuItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: 'Best Sellers',
    isAvailable: true,
    image: '🍲',
  });

  // Delete confirmation
  const [deleteId, setDeleteId] = useState(null);

  function loadMenu() {
    setMenuItems(ownerService.getMenuItems());
  }

  useEffect(() => {
    loadMenu();
  }, []);

  // Categories list
  const categories = ['All', ...new Set(menuItems.map((item) => item.category))];

  // Filtered items
  const filteredItems = menuItems.filter((item) => {
    const matchCat = selectedCategory === 'All' || item.category === selectedCategory;
    const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  function handleOpenAdd() {
    setEditingItem(null);
    setFormData({
      name: '',
      description: '',
      price: '',
      category: categories[1] || 'Best Sellers',
      isAvailable: true,
      image: '🍗',
    });
    setModalOpen(true);
  }

  function handleOpenEdit(item) {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      isAvailable: item.isAvailable,
      image: item.image || '🍲',
    });
    setModalOpen(true);
  }

  function handleSave(e) {
    e.preventDefault();
    if (!formData.name.trim() || !formData.price) return;

    if (editingItem) {
      ownerService.updateMenuItem(editingItem.id, {
        ...formData,
        price: parseFloat(formData.price),
      });
    } else {
      ownerService.addMenuItem({
        ...formData,
        price: parseFloat(formData.price),
      });
    }
    setModalOpen(false);
    loadMenu();
  }

  function handleToggleAvailability(item) {
    ownerService.updateMenuItem(item.id, { isAvailable: !item.isAvailable });
    loadMenu();
  }

  function handleDelete(id) {
    ownerService.deleteMenuItem(id);
    setDeleteId(null);
    loadMenu();
  }

  return (
    <OwnerLayout>
      {/* ── Page Header ────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--accent)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Menu Catalog
          </span>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}>
            Menu Management
          </h1>
          <p className="page-subtitle">
            Add, edit, and control the live availability of your kitchen's dishes
          </p>
        </div>

        <Button variant="primary" size="md" onClick={handleOpenAdd}>
          + Add New Item
        </Button>
      </div>

      {/* ── Search & Filter Controls ─────────────────────── */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-lg)',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          minWidth: 260,
          maxWidth: 400,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', marginRight: 10 }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search dish or ingredient..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              width: '100%',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingBottom: 4 }}>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                border: selectedCategory === cat ? '1px solid var(--accent)' : '1px solid var(--border-primary)',
                background: selectedCategory === cat ? 'var(--accent)' : 'var(--surface-primary)',
                color: selectedCategory === cat ? '#fff' : 'var(--text-primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all var(--transition-fast)',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Menu Items Grid ──────────────────────────────── */}
      {filteredItems.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-12) var(--space-4)',
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          color: 'var(--text-muted)',
        }}>
          <p style={{ fontSize: 32, marginBottom: 8 }}>🍲</p>
          <p style={{ fontWeight: 600, fontSize: 'var(--font-size-md)', color: 'var(--text-primary)' }}>No dishes found</p>
          <p style={{ fontSize: 'var(--font-size-sm)', marginTop: 4 }}>Try clearing your search or add a new dish to your menu.</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 'var(--space-5)',
        }}>
          {filteredItems.map((item) => (
            <div
              key={item.id}
              style={{
                background: 'var(--surface-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: 'var(--shadow-sm)',
                opacity: item.isAvailable ? 1 : 0.65,
                transition: 'border-color var(--transition-fast), transform var(--transition-fast)',
              }}
            >
              <div>
                {/* Header: Emoji & Category */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--bg-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                  }}>
                    {item.image || '🍲'}
                  </div>

                  <Badge variant={item.isAvailable ? 'success' : 'default'} size="sm" dot>
                    {item.isAvailable ? 'Available' : 'Unavailable'}
                  </Badge>
                </div>

                <div style={{ marginBottom: 'var(--space-1)' }}>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 700 }}>
                    {item.category}
                  </span>
                  <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                    {item.name}
                  </h3>
                </div>

                <p style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                  marginBottom: 'var(--space-4)',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {item.description}
                </p>
              </div>

              <div>
                {/* Price & Toggle */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: 'var(--space-3)',
                  borderTop: '1px solid var(--border-secondary)',
                  marginBottom: 'var(--space-3)',
                }}>
                  <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--accent)' }}>
                    ₱{item.price.toLocaleString('en-PH')}
                  </span>

                  {/* Availability Toggle Switch */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                      {item.isAvailable ? 'Active' : 'Paused'}
                    </span>
                    <input
                      type="checkbox"
                      checked={item.isAvailable}
                      onChange={() => handleToggleAvailability(item)}
                      style={{ display: 'none' }}
                    />
                    <div style={{
                      width: 36,
                      height: 20,
                      borderRadius: 12,
                      background: item.isAvailable ? 'var(--salo-green)' : 'var(--border-primary)',
                      position: 'relative',
                      transition: 'background var(--transition-fast)',
                    }}>
                      <div style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: '#fff',
                        position: 'absolute',
                        top: 2,
                        left: item.isAvailable ? 18 : 2,
                        transition: 'left var(--transition-fast)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </div>
                  </label>
                </div>

                {/* Action Buttons */}
                {deleteId === item.id ? (
                  <div style={{
                    padding: 'var(--space-2)',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                  }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--salo-error)', marginBottom: 6 }}>
                      Confirm remove this dish?
                    </p>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(item.id)}>
                        Delete
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                    <Button variant="outline" size="sm" onClick={() => handleOpenEdit(item)}>
                      Edit Dish
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteId(item.id)} style={{ color: 'var(--text-muted)' }}>
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingItem ? 'Edit Dish' : 'Add New Dish'}
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', width: '100%' }}>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave}>
              {editingItem ? 'Save Changes' : 'Add to Menu'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 'var(--space-3)' }}>
            <Input
              id="dish-image"
              label="Icon"
              value={formData.image}
              onChange={(e) => setFormData({ ...formData, image: e.target.value })}
              placeholder="🍗"
            />
            <Input
              id="dish-name"
              label="Dish Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Inasal na Manok"
              required
            />
          </div>

          <Textarea
            id="dish-description"
            label="Description"
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Describe ingredients, cooking method, and flavors..."
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Input
              id="dish-price"
              label="Price (₱)"
              type="number"
              min="0"
              step="1"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              placeholder="195"
              required
            />

            <Select
              id="dish-category"
              label="Category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              options={[
                { value: 'Best Sellers', label: 'Best Sellers' },
                { value: 'Grilled Mains', label: 'Grilled Mains' },
                { value: 'Beverages', label: 'Beverages' },
                { value: 'Soups & Bowls', label: 'Soups & Bowls' },
                { value: 'Desserts', label: 'Desserts' },
              ]}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 4 }}>
            <input
              type="checkbox"
              checked={formData.isAvailable}
              onChange={(e) => setFormData({ ...formData, isAvailable: e.target.checked })}
            />
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
              Available for live customer orders
            </span>
          </label>
        </form>
      </Modal>
    </OwnerLayout>
  );
}

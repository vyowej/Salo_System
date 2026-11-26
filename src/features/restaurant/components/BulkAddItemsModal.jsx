import { useEffect, useState } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import { MAX_BULK_MENU_ROWS, validateBulkItemRows } from '../menu/bulkMenuUtils';

function createEmptyItemRow() {
  return {
    id: `item-row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    price: '',
    description: '',
    photoFile: null,
  };
}

export default function BulkAddItemsModal({
  open,
  onClose,
  categories = [],
  onSaveAll,
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [rows, setRows] = useState([createEmptyItemRow()]);
  const [rowErrors, setRowErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && !selectedCategoryId && categories.length > 0) {
      setSelectedCategoryId(String(categories[0].id));
    }
  }, [open, selectedCategoryId, categories]);

  const handleClose = () => {
    if (saving) return;
    setRows([createEmptyItemRow()]);
    setRowErrors({});
    setFormError('');
    setStatusNote('');
    onClose?.();
  };

  const addRow = () => {
    if (rows.length >= MAX_BULK_MENU_ROWS) {
      setFormError(`Maximum ${MAX_BULK_MENU_ROWS} items per batch.`);
      return;
    }
    setRows((prev) => [...prev, createEmptyItemRow()]);
  };

  const removeRow = (index) => {
    if (rows.length <= 1) {
      setRows([createEmptyItemRow()]);
      setRowErrors({});
      return;
    }
    setRows((prev) => prev.filter((_, idx) => idx !== index));
    setRowErrors({});
  };

  const submitBatch = async ({ keepOpenForNextCategory = false } = {}) => {
    if (saving) return;
    if (!selectedCategoryId) {
      setFormError('Please choose a category first.');
      return;
    }

    const validation = validateBulkItemRows(rows);
    if (!validation.valid) {
      setRowErrors(validation.errorsByIndex);
      setFormError('Please fix the highlighted item rows before saving.');
      return;
    }

    setSaving(true);
    setRowErrors({});
    setFormError('');
    setStatusNote('');
    try {
      const result = await onSaveAll(Number(selectedCategoryId), rows);
      const photoWarnings = Array.isArray(result?.photo_errors) ? result.photo_errors : [];

      if (keepOpenForNextCategory) {
        setRows([createEmptyItemRow()]);
        setStatusNote(
          photoWarnings.length > 0
            ? `Saved ${rows.length} item(s), but ${photoWarnings.length} photo(s) failed to upload. Choose the next category below.`
            : `Saved ${rows.length} item(s). Choose another category to continue adding.`,
        );
      } else if (photoWarnings.length > 0) {
        setRows([createEmptyItemRow()]);
        setStatusNote(`Saved ${rows.length} item(s), but ${photoWarnings.length} photo(s) failed to upload.`);
      } else {
        setRows([createEmptyItemRow()]);
        onClose?.();
      }
    } catch (err) {
      setFormError(err?.message || 'Unable to save menu items.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add multiple menu items"
      size="xl"
      footer={(
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 10, flexWrap: 'wrap' }}>
          <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={saving || rows.length >= MAX_BULK_MENU_ROWS}>
            + Add another item
          </Button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="button" variant="ghost" onClick={handleClose} disabled={saving}>Cancel</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => submitBatch({ keepOpenForNextCategory: true })}
              disabled={saving || !selectedCategoryId}
            >
              Add to another category
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => submitBatch({ keepOpenForNextCategory: false })}
              loading={saving}
              disabled={saving || !selectedCategoryId}
            >
              {saving ? 'Saving All...' : 'Save All'}
            </Button>
          </div>
        </div>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 320 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Category</span>
          <select
            aria-label="Bulk items category"
            value={selectedCategoryId}
            disabled={saving}
            onChange={(e) => {
              setSelectedCategoryId(e.target.value);
              setFormError('');
            }}
            style={{
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid var(--border-primary)',
              background: 'var(--input-bg)',
              color: 'var(--text-primary)',
            }}
          >
            {categories.map((cat) => (
              <option key={cat.id} value={String(cat.id)}>
                {cat.name}{cat.visible ? '' : ' (hidden)'}
              </option>
            ))}
          </select>
        </label>

        {formError && <p className="form-error" role="alert" style={{ margin: 0 }}>{formError}</p>}
        {statusNote && (
          <p role="status" style={{ margin: 0, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-secondary)', fontSize: 13 }}>
            {statusNote}
          </p>
        )}

        <div style={{ overflowX: 'auto', maxHeight: 380 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-primary)' }}>
                <th style={{ padding: '6px 8px' }}>Item name *</th>
                <th style={{ padding: '6px 8px', width: 120 }}>Price (₱) *</th>
                <th style={{ padding: '6px 8px' }}>Description</th>
                <th style={{ padding: '6px 8px', width: 170 }}>Photo (optional)</th>
                <th style={{ padding: '6px 8px', width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const err = rowErrors[idx] || {};
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border-secondary)', verticalAlign: 'top' }}>
                    <td style={{ padding: '8px' }}>
                      <input
                        aria-label={`Item ${idx + 1} name`}
                        value={row.name}
                        disabled={saving}
                        placeholder="e.g. Chicken Sisig"
                        onChange={(e) => {
                          const v = e.target.value;
                          setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, name: v } : r)));
                        }}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 6,
                          border: err.name ? '1px solid #dc2626' : '1px solid var(--border-primary)',
                        }}
                      />
                      {err.name && <span className="form-error" style={{ fontSize: 11 }}>{err.name}</span>}
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        aria-label={`Item ${idx + 1} price`}
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={row.price}
                        disabled={saving}
                        placeholder="0.00"
                        onChange={(e) => {
                          const v = e.target.value;
                          setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, price: v } : r)));
                        }}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 6,
                          border: err.price ? '1px solid #dc2626' : '1px solid var(--border-primary)',
                        }}
                      />
                      {err.price && <span className="form-error" style={{ fontSize: 11 }}>{err.price}</span>}
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        aria-label={`Item ${idx + 1} description`}
                        value={row.description}
                        disabled={saving}
                        placeholder="Optional short description"
                        onChange={(e) => {
                          const v = e.target.value;
                          setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, description: v } : r)));
                        }}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--border-primary)',
                        }}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        aria-label={`Item ${idx + 1} photo`}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={saving}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, photoFile: file } : r)));
                        }}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(idx)} disabled={saving}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

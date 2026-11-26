import { useRef, useState } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import {
  MAX_BULK_MENU_ROWS,
  parseBulkCategoryPaste,
  validateBulkCategoryRows,
} from '../menu/bulkMenuUtils';

function createEmptyRow() {
  return { id: `cat-row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: '' };
}

export default function BulkAddCategoriesModal({
  open,
  onClose,
  existingCategories = [],
  onSaveAll,
}) {
  const [rows, setRows] = useState([createEmptyRow()]);
  const [rowErrors, setRowErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRefs = useRef([]);

  const handleClose = () => {
    if (saving) return;
    setRows([createEmptyRow()]);
    setRowErrors({});
    setFormError('');
    onClose?.();
  };

  const addRow = (focusNew = true) => {
    if (rows.length >= MAX_BULK_MENU_ROWS) {
      setFormError(`You can add up to ${MAX_BULK_MENU_ROWS} categories at once.`);
      return;
    }
    const nextIdx = rows.length;
    setRows((prev) => [...prev, createEmptyRow()]);
    if (focusNew) {
      setTimeout(() => inputRefs.current[nextIdx]?.focus(), 0);
    }
  };

  const removeRow = (index) => {
    if (rows.length <= 1) {
      setRows([createEmptyRow()]);
      setRowErrors({});
      return;
    }
    setRows((prev) => prev.filter((_, idx) => idx !== index));
    setRowErrors({});
    setFormError('');
  };

  const handlePaste = (index, event) => {
    const pasted = event.clipboardData?.getData('text') || '';
    const parsed = parseBulkCategoryPaste(pasted);
    if (parsed.length <= 1) return;

    event.preventDefault();
    setRows((prev) => {
      const before = prev.slice(0, index);
      const after = prev.slice(index + 1);
      const inserted = parsed.map((name) => ({ ...createEmptyRow(), name }));
      return [...before, ...inserted, ...after].slice(0, MAX_BULK_MENU_ROWS);
    });
    setRowErrors({});
    setFormError('');
  };

  const handleSubmit = async (event) => {
    event?.preventDefault();
    if (saving) return;

    const validation = validateBulkCategoryRows(rows, existingCategories);
    if (!validation.valid) {
      setRowErrors(validation.errorsByIndex);
      setFormError('Please fix the highlighted category rows before saving.');
      return;
    }

    setSaving(true);
    setRowErrors({});
    setFormError('');
    try {
      await onSaveAll(rows.map((r) => ({ category_name: r.name.trim() })));
      setRows([createEmptyRow()]);
      onClose?.();
    } catch (err) {
      const backendErrors = {};
      if (err?.errors && typeof err.errors === 'object') {
        Object.entries(err.errors).forEach(([key, msgs]) => {
          const match = key.match(/^categories\.(\d+)\.category_name$/);
          if (match) {
            backendErrors[Number(match[1])] = Array.isArray(msgs) ? msgs[0] : String(msgs);
          }
        });
      }
      setRowErrors(backendErrors);
      setFormError(err?.message || 'Unable to save categories.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add multiple menu categories"
      size="md"
      footer={(
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 10 }}>
          <Button type="button" variant="outline" size="sm" onClick={() => addRow(true)} disabled={saving || rows.length >= MAX_BULK_MENU_ROWS}>
            + Add another
          </Button>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="button" variant="ghost" onClick={handleClose} disabled={saving}>Cancel</Button>
            <Button type="button" variant="primary" onClick={handleSubmit} loading={saving} disabled={saving}>
              {saving ? 'Saving All...' : 'Save All'}
            </Button>
          </div>
        </div>
      )}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          Enter one category per row, press <strong>Enter</strong> to add another, or paste comma/line-separated names.
        </p>

        {formError && <p className="form-error" role="alert" style={{ margin: 0 }}>{formError}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
          {rows.map((row, idx) => (
            <div key={row.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 22 }}>{idx + 1}.</span>
                <input
                  ref={(el) => { inputRefs.current[idx] = el; }}
                  aria-label={`Category ${idx + 1}`}
                  value={row.name}
                  disabled={saving}
                  placeholder="e.g. Rice Bowls"
                  onChange={(e) => {
                    const val = e.target.value;
                    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, name: val } : r)));
                    if (rowErrors[idx]) {
                      setRowErrors((prev) => {
                        const next = { ...prev };
                        delete next[idx];
                        return next;
                      });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addRow(true);
                    }
                  }}
                  onPaste={(e) => handlePaste(idx, e)}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: rowErrors[idx] ? '1px solid #dc2626' : '1px solid var(--border-primary)',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                  }}
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(idx)} disabled={saving} aria-label={`Remove category row ${idx + 1}`}>
                  Remove
                </Button>
              </div>
              {rowErrors[idx] && (
                <span className="form-error" role="alert" style={{ marginLeft: 30, fontSize: 12 }}>
                  {rowErrors[idx]}
                </span>
              )}
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}

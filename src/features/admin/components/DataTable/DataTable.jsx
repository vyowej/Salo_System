/**
 * SALO Admin Shared DataTable Wrapper (DataTables.net + React)
 *
 * Props:
 * - columns: Array<{ key, data?, title|label, render?, sortValue?, filterValue?, orderable?, searchable?, className?, align?, responsivePriority?, exportable? }>
 * - data / rows: Array of row objects
 * - rowKey: Unique key field (default: 'id')
 * - tableSearch: Controlled search string (typically from AdminSearchContext)
 * - showLocalSearch: Boolean to render a local search input (for multi-table pages)
 * - localSearchPlaceholder: Placeholder for the local search input
 * - filters: Array<{ key, label, columnKey?, options: Array<string|{label,value}>, value, onChange }>
 * - onResetFilters: Callback when "Reset" is clicked in the filter bar
 * - rowActions: (row) => Array<{ label, onClick, disabled?, reason?, danger?, hidden? }>
 * - onRowClick: (row) => void (ignores clicks on interactive buttons/links/actions)
 * - toolbar: ReactNode slot rendered in the top toolbar (e.g. "Add" buttons)
 * - pageLength: Initial page size (10 | 25 | 50, default 10)
 * - defaultOrder: DataTables order tuple array (e.g. [[0, 'asc']])
 * - paging: Boolean (default true)
 * - ordering: Boolean (default true)
 * - info: Boolean (default true)
 * - selectable: Boolean (default false)
 * - emptyTitle / emptyMessage / emptyDescription: Empty state strings
 * - loading: Boolean (renders StateView loading skeleton)
 * - error: String | Error (renders StateView error with optional onRetry)
 * - onRetry: Callback for StateView error retry button
 * - exportFileName: String (enables CSV export button if canExport is true)
 * - canExport: Boolean (default false; gate CSV export by admin permission)
 * - serverSide: Boolean (enables server-side processing mode)
 * - onServerFetch: ({ page, pageLength, order, search, filters }) => Promise<{ data, recordsTotal, recordsFiltered }>
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import DTReact from './setup';
import StateView from '../StateView';
import './admin-datatable.css';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getColumnKey(col) {
  return col.data ?? col.key;
}

function getCellRawValue(row, col) {
  const key = getColumnKey(col);
  if (typeof key === 'function') return key(row);
  if (!key || !row) return '';
  return row[key] ?? '';
}

export default function DataTable({
  columns = [],
  data,
  rows,
  rowKey = 'id',
  tableSearch = '',
  showLocalSearch = false,
  localSearchPlaceholder = 'Filter this table…',
  filters = [],
  onResetFilters,
  rowActions,
  onRowClick,
  toolbar,
  pageLength = 10,
  defaultOrder,
  paging = true,
  ordering = true,
  info = true,
  selectable = false,
  emptyTitle,
  emptyMessage,
  emptyDescription,
  loading = false,
  error = null,
  onRetry,
  exportFileName,
  canExport = false,
  serverSide = false,
  onServerFetch,
}) {
  const dtRef = useRef(null);
  const [localSearch, setLocalSearch] = useState('');
  const tableRows = useMemo(() => (Array.isArray(data) ? data : (Array.isArray(rows) ? rows : [])), [data, rows]);

  const hasActionsCol = typeof rowActions === 'function';

  const normalizedColumns = useMemo(() => {
    const base = columns.map((col, index) => {
      const colKey = getColumnKey(col);
      const isRight = col.align === 'right' || (col.className || '').includes('dt-right');
      const classNames = [col.className || '', isRight ? 'dt-right' : ''].filter(Boolean).join(' ');
      return {
        ...col,
        _index: index,
        _colKey: colKey,
        title: col.title || col.label || '',
        orderable: col.orderable !== undefined ? col.orderable : true,
        searchable: col.searchable !== undefined ? col.searchable : true,
        className: classNames || undefined,
      };
    });

    if (hasActionsCol) {
      base.push({
        _index: base.length,
        _colKey: '__actions__',
        _isActions: true,
        title: 'Actions',
        orderable: false,
        searchable: false,
        responsivePriority: 1,
        className: 'dt-actions-col dt-no-export',
      });
    }
    return base;
  }, [columns, hasActionsCol]);

  const dtColumns = useMemo(() => (
    normalizedColumns.map((col) => ({
      title: col.title,
      name: typeof col._colKey === 'string' ? col._colKey : `col-${col._index}`,
      orderable: col.orderable,
      searchable: col.searchable,
      className: col.className,
      responsivePriority: col.responsivePriority,
      data: (row, type) => {
        if (col._isActions) return '';
        const raw = getCellRawValue(row, col);
        if (type === 'sort' && typeof col.sortValue === 'function') {
          return col.sortValue(row);
        }
        if ((type === 'filter' || type === 'search') && typeof col.filterValue === 'function') {
          return col.filterValue(row);
        }
        if ((type === 'filter' || type === 'search') && typeof col.sortValue === 'function') {
          return col.sortValue(row);
        }
        return raw;
      },
    }))
  ), [normalizedColumns]);

  const slots = useMemo(() => {
    const map = {};
    normalizedColumns.forEach((col, index) => {
      if (col._isActions) {
        map[index] = (_cellData, row) => {
          const actions = (rowActions(row) || []).filter((action) => !action.hidden);
          return (
            <div className="admin-dt-actions" onClick={(event) => event.stopPropagation()}>
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className={`admin-dt-action-btn ${action.danger ? 'is-danger' : ''}`}
                  disabled={Boolean(action.disabled)}
                  title={action.disabled && action.reason ? action.reason : action.label}
                  onClick={(event) => {
                    event.stopPropagation();
                    action.onClick?.(row);
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          );
        };
      } else if (typeof col.render === 'function') {
        map[index] = (_cellData, row) => col.render(row);
      } else {
        map[index] = (cellData) => {
          const text = cellData === null || cellData === undefined || cellData === '' ? '—' : String(cellData);
          if (text.length > 36) {
            return <span className="admin-dt-truncate" title={text}>{text}</span>;
          }
          return text;
        };
      }
    });
    return map;
  }, [normalizedColumns, rowActions]);

  const effectiveSearch = [tableSearch, showLocalSearch ? localSearch : '']
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' ');

  // Adjust column widths after mount (important when rendered inside modals/tabs)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const dt = dtRef.current?.dt();
      if (dt) {
        dt.columns.adjust();
      }
    }, 30);
    return () => window.clearTimeout(timer);
  }, [tableRows]);

  // Sync topbar/local search with DataTables search API
  useEffect(() => {
    const dt = dtRef.current?.dt();
    if (!dt) return;
    if (dt.search() !== effectiveSearch) {
      dt.search(effectiveSearch).draw(false);
    }
  }, [effectiveSearch, tableRows]);

  // Sync declarative column filters with DataTables column().search()
  useEffect(() => {
    const dt = dtRef.current?.dt();
    if (!dt || !filters.length) return;
    let changed = false;
    filters.forEach((filter) => {
      if (!filter.columnKey) return;
      const colIndex = normalizedColumns.findIndex((c) => c._colKey === filter.columnKey || c.key === filter.columnKey);
      if (colIndex === -1) return;
      const target = filter.value ? `^${escapeRegex(filter.value)}$` : '';
      const column = dt.column(colIndex);
      if (column.search() !== target) {
        column.search(target, true, false);
        changed = true;
      }
    });
    if (changed) dt.draw(false);
  }, [filters, normalizedColumns]);

  const dtOptions = useMemo(() => {
    const showButtons = Boolean(exportFileName && canExport);
    return {
      paging,
      ordering,
      info,
      searching: true,
      responsive: true,
      fixedHeader: false,
      select: selectable ? { style: 'single' } : false,
      pageLength,
      lengthMenu: [10, 25, 50],
      order: defaultOrder || [],
      rowId: rowKey,
      layout: {
        topStart: paging ? 'pageLength' : null,
        topEnd: showButtons ? 'buttons' : null,
        bottomStart: info ? 'info' : null,
        bottomEnd: paging ? 'paging' : null,
      },
      buttons: showButtons
        ? [
            {
              extend: 'csvHtml5',
              text: 'Export CSV',
              title: exportFileName,
              exportOptions: {
                columns: ':not(.dt-no-export)',
              },
            },
          ]
        : [],
      language: {
        info: 'Showing _START_ to _END_ of _TOTAL_',
        infoEmpty: 'Showing 0 to 0 of 0',
        infoFiltered: '(filtered from _MAX_ total)',
        lengthMenu: '_MENU_ per page',
        emptyTable: emptyDescription || emptyMessage || 'No matching records',
        zeroRecords: 'No matching records',
      },
      ...(serverSide && typeof onServerFetch === 'function'
        ? {
            serverSide: true,
            processing: true,
            ajax: async (dtParams, callback) => {
              const page = Math.floor((dtParams.start || 0) / (dtParams.length || pageLength)) + 1;
              const result = await onServerFetch({
                page,
                pageLength: dtParams.length || pageLength,
                order: dtParams.order || [],
                search: dtParams.search?.value || '',
                filters,
              });
              callback({
                draw: dtParams.draw,
                data: result?.data || [],
                recordsTotal: result?.recordsTotal ?? 0,
                recordsFiltered: result?.recordsFiltered ?? 0,
              });
            },
          }
        : {}),
    };
  }, [
    paging,
    ordering,
    info,
    selectable,
    pageLength,
    defaultOrder,
    rowKey,
    exportFileName,
    canExport,
    emptyDescription,
    emptyMessage,
    serverSide,
    onServerFetch,
    filters,
  ]);

  if (loading) {
    return <StateView state="loading" title={emptyTitle || 'records'} />;
  }

  if (error) {
    return (
      <StateView
        state="error"
        title={emptyTitle || 'records'}
        description={typeof error === 'string' ? error : error.message}
        retry={onRetry}
      />
    );
  }

  const hasActiveFilters = Boolean(localSearch || filters.some((f) => Boolean(f.value)));
  const showToolbar = Boolean(toolbar || showLocalSearch || filters.length > 0);

  if (!serverSide && !tableRows.length && !hasActiveFilters && !effectiveSearch) {
    return (
      <div className="admin-dt-card">
        {showToolbar && (
          <div className="admin-dt-toolbar">
            <div className="admin-dt-toolbar__left">{toolbar}</div>
          </div>
        )}
        <StateView
          state="empty"
          title={emptyTitle}
          description={emptyDescription || emptyMessage}
        />
      </div>
    );
  }

  const handleTableClick = (event) => {
    if (typeof onRowClick !== 'function') return;
    const interactive = event.target.closest('button, a, input, select, .admin-dt-actions, .dtr-control');
    if (interactive) return;
    const tr = event.target.closest('tbody tr');
    if (!tr || tr.classList.contains('child')) return;
    const dt = dtRef.current?.dt();
    if (!dt) return;
    const rowData = dt.row(tr).data();
    if (rowData) onRowClick(rowData);
  };

  return (
    <div className="admin-dt-card">
      {showToolbar && (
        <div className="admin-dt-toolbar">
          <div className="admin-dt-toolbar__left">
            {showLocalSearch && (
              <input
                type="search"
                className="admin-dt-local-search"
                value={localSearch}
                onChange={(event) => setLocalSearch(event.target.value)}
                placeholder={localSearchPlaceholder}
                aria-label={localSearchPlaceholder}
              />
            )}
            {filters.map((filter) => (
              <label key={filter.key} className="admin-dt-filter-chip">
                <span>{filter.label}</span>
                <select
                  value={filter.value || ''}
                  onChange={(event) => filter.onChange?.(event.target.value)}
                >
                  <option value="">All</option>
                  {(filter.options || []).map((opt) => {
                    const val = typeof opt === 'string' ? opt : opt.value;
                    const lbl = typeof opt === 'string' ? opt : opt.label;
                    return <option key={val} value={val}>{lbl}</option>;
                  })}
                </select>
              </label>
            ))}
            {hasActiveFilters && (
              <button
                type="button"
                className="admin-dt-reset-btn"
                onClick={() => {
                  setLocalSearch('');
                  onResetFilters?.();
                }}
              >
                Reset
              </button>
            )}
          </div>
          {toolbar && <div className="admin-dt-toolbar__right">{toolbar}</div>}
        </div>
      )}

      <div className="admin-dt-scroll" onClick={handleTableClick}>
        <DTReact
          ref={dtRef}
          data={tableRows}
          columns={dtColumns}
          options={dtOptions}
          slots={slots}
          className={`display compact ${onRowClick ? 'is-clickable' : ''}`}
        />
      </div>
    </div>
  );
}

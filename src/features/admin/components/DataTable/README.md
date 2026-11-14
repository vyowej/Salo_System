# Admin Shared DataTable Wrapper

All SALO Admin tables and chart-backing tables render through `DataTable` (`datatables.net-react` + `datatables.net-dt`).

## Files
- `setup.js` — Registers `datatables.net-dt` and extensions (`responsive`, `fixedheader`, `buttons` CSV-only, `select`). Imported only here so non-admin bundles remain unaffected.
- `DataTable.jsx` — React wrapper supporting client-side (default) and optional `serverSide` modes, `AdminSearchContext` integration, declarative `filters`, `rowActions`, `slots`-based React cell rendering, and `StateView` states.
- `admin-datatable.css` — Theme-token overrides (no raw hex) for compact 40–44px rows, sticky headers, pagination, responsive child rows, and horizontal table-container scrolling.

## Key Props
- `columns`: `[{ key, title, render?, sortValue?, filterValue?, orderable?, searchable?, align?, responsivePriority? }]`
- `data` / `rows`: Array of row objects
- `tableSearch`: Controlled query string (wired from `useAdminPageSearch`)
- `showLocalSearch`: Enable a local search input when a page renders multiple tables
- `filters`: `[{ key, label, columnKey?, options, value, onChange }]` + `onResetFilters`
- `rowActions`: `(row) => [{ label, onClick, disabled?, reason?, danger?, hidden? }]`
- `onRowClick`: `(row) => void`
- `exportFileName` + `canExport`: Enables CSV export button when permitted
- `serverSide` + `onServerFetch`: Optional server-side pagination/sort/search adapter

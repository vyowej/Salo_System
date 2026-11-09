import EmptyState from './EmptyState';
import './AdminComponents.css';

export default function DataTable({ columns, rows, rowKey = 'id', emptyTitle, emptyDescription }) {
  if (!rows?.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="admin-data-table-wrap">
      <table className="admin-data-table">
        <thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row[rowKey] ?? index}>
              {columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : row[column.key] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

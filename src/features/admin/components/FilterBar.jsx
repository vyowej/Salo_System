import './AdminComponents.css';

export default function FilterBar({ search, onSearchChange, searchLabel = 'Search records', children }) {
  return (
    <div className="admin-filter-bar">
      {onSearchChange && (
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label={searchLabel}
          placeholder={searchLabel}
        />
      )}
      {children}
    </div>
  );
}

import { useMemo } from 'react';

/**
 * useMenuSearch
 * Filters a flat array of menu items by a search query (case-insensitive name match).
 * When the query is empty or blank, returns the original array unchanged.
 *
 * @param {Array}  items  - Full flat menu item array (already normalised)
 * @param {string} query  - User-typed search string
 * @returns {Array} Filtered menu items
 */
export function useMenuSearch(items, query) {
  return useMemo(() => {
    const trimmed = (query || '').trim().toLowerCase();
    if (!trimmed) return items;
    return (items || []).filter((item) =>
      item.name?.toLowerCase().includes(trimmed)
    );
  }, [items, query]);
}

export default useMenuSearch;

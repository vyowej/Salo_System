import { useContext, useEffect, useRef } from 'react';
import AdminSearchContext from './adminSearchStore';

export function useAdminSearch() {
  const ctx = useContext(AdminSearchContext);
  if (!ctx) {
    return {
      query: '',
      rawQuery: '',
      setQuery: () => {},
      clearQuery: () => {},
      config: null,
      registerSearch: () => {},
      unregisterSearch: () => {},
    };
  }
  return ctx;
}

export function useAdminPageSearch(config) {
  const ctx = useAdminSearch();
  const { registerSearch, unregisterSearch } = ctx;
  const onSearchRef = useRef(config?.onSearch);

  useEffect(() => {
    onSearchRef.current = config?.onSearch;
  }, [config?.onSearch]);

  const hasConfig = Boolean(config);
  const scopeLabel = config?.scopeLabel || '';
  const placeholder = config?.placeholder || '';
  const disabled = Boolean(config?.disabled);
  const fieldsKey = Array.isArray(config?.searchableFields) ? config.searchableFields.join('|') : '';

  useEffect(() => {
    if (!hasConfig) {
      unregisterSearch();
      return undefined;
    }
    registerSearch({
      scopeLabel,
      placeholder,
      disabled,
      searchableFields: fieldsKey ? fieldsKey.split('|') : [],
      onSearch: (q) => onSearchRef.current?.(q),
    });
    return () => {
      unregisterSearch();
    };
  }, [hasConfig, scopeLabel, placeholder, disabled, fieldsKey, registerSearch, unregisterSearch]);

  return ctx;
}

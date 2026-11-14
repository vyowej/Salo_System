import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AdminSearchContext from './adminSearchStore';

export function AdminSearchProvider({ children }) {
  const { pathname } = useLocation();
  const [rawQuery, setRawQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [config, setConfig] = useState(null);
  const onSearchRef = useRef(null);

  useEffect(() => {
    setRawQuery('');
    setDebouncedQuery('');
  }, [pathname]);

  useEffect(() => {
    if (rawQuery === '') {
      setDebouncedQuery('');
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setDebouncedQuery(rawQuery);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [rawQuery]);

  useEffect(() => {
    if (typeof onSearchRef.current === 'function') {
      onSearchRef.current(debouncedQuery);
    }
  }, [debouncedQuery]);

  const registerSearch = useCallback((nextConfig) => {
    onSearchRef.current = nextConfig?.onSearch || null;
    setConfig(nextConfig || null);
  }, []);

  const unregisterSearch = useCallback(() => {
    onSearchRef.current = null;
    setConfig(null);
  }, []);

  const clearQuery = useCallback(() => {
    setRawQuery('');
    setDebouncedQuery('');
  }, []);

  const value = useMemo(() => ({
    query: debouncedQuery,
    rawQuery,
    setQuery: setRawQuery,
    clearQuery,
    config,
    registerSearch,
    unregisterSearch,
  }), [debouncedQuery, rawQuery, clearQuery, config, registerSearch, unregisterSearch]);

  return (
    <AdminSearchContext.Provider value={value}>
      {children}
    </AdminSearchContext.Provider>
  );
}

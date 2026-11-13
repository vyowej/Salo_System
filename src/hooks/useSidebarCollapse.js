import { useCallback, useState } from 'react';

/**
 * Shared sidebar collapse state hook persisted in localStorage.
 * Defaults to collapsed (72px icon rail) when no preference is saved.
 */
export function useSidebarCollapse(storageKey, defaultCollapsed = true) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored === null ? defaultCollapsed : stored === 'true';
    } catch {
      return defaultCollapsed;
    }
  });

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        /* Ignore storage errors */
      }
      return next;
    });
  }, [storageKey]);

  return [collapsed, toggleCollapsed];
}

export default useSidebarCollapse;

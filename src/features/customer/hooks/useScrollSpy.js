import { useState, useEffect, useRef } from 'react';

/**
 * useScrollSpy
 * Watches a list of section elements (by id) and returns the id of the section
 * currently in view.  Uses IntersectionObserver so it is cheap and accurate.
 *
 * @param {string[]} sectionIds  - Ordered list of section element ids to watch
 * @param {object}  [options]
 * @param {string}  [options.rootMargin]  - IntersectionObserver rootMargin (default: '-20% 0px -70% 0px')
 * @returns {string|null} The id of the currently visible section
 */
export function useScrollSpy(sectionIds, { rootMargin = '-20% 0px -70% 0px' } = {}) {
  const [activeId, setActiveId] = useState(sectionIds[0] ?? null);
  // Keep a ref so the observer callback always sees the latest ids without
  // recreating the observer on every render.
  const idsRef = useRef(sectionIds);

  useEffect(() => {
    idsRef.current = sectionIds;
  });

  useEffect(() => {
    if (!sectionIds.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin }
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIds.join(','), rootMargin]);

  return activeId;
}

export default useScrollSpy;

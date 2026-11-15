import { useEffect, useId, useRef, useState } from 'react';

/**
 * Searchable combobox input for Philippine administrative locations.
 * Replaces traditional <select> dropdowns with live type-ahead suggestions.
 */
export default function SearchableLocationInput({
  label,
  required = false,
  value = '',
  placeholder = 'Type to search…',
  disabled = false,
  error = '',
  hint = '',
  fetchSuggestions,
  onSelect,
  onChangeText,
}) {
  const inputId = useId();
  const listId = useId();
  const wrapRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const handleOutside = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (!open || disabled || typeof fetchSuggestions !== 'function') {
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await fetchSuggestions(value);
        if (!cancelled) {
          setSuggestions(Array.isArray(results) ? results : []);
          setActiveIndex(-1);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, value, disabled, fetchSuggestions]);

  const handleChoose = (item) => {
    const chosenName = typeof item === 'string' ? item : item?.name || '';
    onSelect?.(chosenName, item);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(suggestions.length - 1, prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0 && suggestions[activeIndex]) {
      e.preventDefault();
      handleChoose(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="salo-ph-field" ref={wrapRef}>
      <label className="salo-ph-label" htmlFor={inputId}>
        {label}
        {required && <span className="salo-ph-required">*</span>}
      </label>
      <div className="salo-ph-input-wrap">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className={`salo-ph-input ${error ? 'is-error' : ''}`}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChangeText?.(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {value && !disabled && (
          <button
            type="button"
            className="salo-ph-clear-btn"
            aria-label={`Clear ${label}`}
            onClick={() => {
              onChangeText?.('');
              onSelect?.('', null);
              setOpen(true);
            }}
          >
            ✕
          </button>
        )}
      </div>

      {open && !disabled && (
        <ul id={listId} role="listbox" className="salo-ph-suggestions">
          {loading ? (
            <li className="salo-ph-suggestion-empty">Searching…</li>
          ) : suggestions.length === 0 ? (
            <li className="salo-ph-suggestion-empty">
              No matching suggestions. You can keep typing to enter manually.
            </li>
          ) : (
            suggestions.map((item, idx) => {
              const name = typeof item === 'string' ? item : item.name;
              return (
                <li key={`${name}-${idx}`} role="option" aria-selected={idx === activeIndex}>
                  <button
                    type="button"
                    className={`salo-ph-suggestion-item ${idx === activeIndex ? 'is-active' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleChoose(item);
                    }}
                  >
                    <span>{name}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}

      {error ? (
        <span className="salo-ph-error">{error}</span>
      ) : hint ? (
        <span className="salo-ph-hint">{hint}</span>
      ) : null}
    </div>
  );
}

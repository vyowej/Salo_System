import { createContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const ThemeContext = createContext(null);
const PUBLIC_LIGHT_ROUTES = new Set(['/', '/login', '/register']);

/** Reads theme preference: manual override → system → default light */
function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('salo-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Apply theme to <html> immediately (no flash) */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);
  const location = useLocation();

  // Apply on mount + every change
  useEffect(() => {
    applyTheme(PUBLIC_LIGHT_ROUTES.has(location.pathname) ? 'light' : theme);
    localStorage.setItem('salo-theme', theme);
  }, [theme, location.pathname]);

  // Listen to OS preference changes (only when no manual override)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      const stored = localStorage.getItem('salo-theme');
      if (!stored) {
        const next = e.matches ? 'dark' : 'light';
        setThemeState(next);
      }
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const setTheme = (next) => {
    if (next !== 'light' && next !== 'dark') return;
    setThemeState(next);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export default ThemeContext;

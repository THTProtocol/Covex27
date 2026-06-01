import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {}, setTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('covex-theme');
      if (stored === 'light' || stored === 'dark') return stored;
      return 'dark'; // default: cypherpunk dark
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('covex-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

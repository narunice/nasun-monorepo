/**
 * ThemeProvider - Context provider for dark/light theme management
 */

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'dark' | 'light';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'baram-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem(STORAGE_KEY) as Theme) || 'light';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('light');

  useEffect(() => {
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const resolved = theme === 'system'
        ? (systemDark.matches ? 'dark' : 'light')
        : theme;
      setResolvedTheme(resolved);

      if (resolved === 'light') {
        root.classList.add('light');
        root.classList.remove('dark');
      } else {
        root.classList.remove('light');
        root.classList.add('dark');
      }
    };

    applyTheme();
    localStorage.setItem(STORAGE_KEY, theme);

    if (theme === 'system') {
      systemDark.addEventListener('change', applyTheme);
      return () => systemDark.removeEventListener('change', applyTheme);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

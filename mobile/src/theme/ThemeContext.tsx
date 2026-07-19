import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  THEME_STORAGE_KEY,
  ThemeColors,
  ThemeName,
  colorsForTheme,
  parseStoredTheme,
} from './tokens';

type ThemeContextValue = {
  theme: ThemeName;
  colors: ThemeColors;
  isDark: boolean;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (!cancelled) {
          setThemeState(parseStoredTheme(stored));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      colors: colorsForTheme(theme),
      isDark: theme === 'dark',
      setTheme,
      toggleTheme,
      ready,
    }),
    [theme, setTheme, toggleTheme, ready]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

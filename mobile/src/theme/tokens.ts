export type ThemeName = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  header: string;
  headerText: string;
  headerMuted: string;
  primary: string;
  primaryMuted: string;
  tabBar: string;
  tabActive: string;
  tabInactive: string;
  dangerBg: string;
  dangerText: string;
  errorBannerBg: string;
  errorBannerText: string;
  badgeBg: string;
  badgeText: string;
  scoreHigh: string;
  scoreMed: string;
  scoreLow: string;
  shadow: string;
  warningBannerBg: string;
  warningBannerText: string;
  success: string;
  warning: string;
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, full: 999 } as const;
export const typography = {
  hero: { fontSize: 22, fontWeight: '800' as const },
  title: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  cta: { fontSize: 16, fontWeight: '800' as const },
} as const;
export const touchTarget = { min: 44 } as const;

export const THEME_STORAGE_KEY = 'gruahub-theme';

export const lightColors: ThemeColors = {
  background: '#f3f4f6',
  surface: '#ffffff',
  text: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  border: '#e5e7eb',
  header: '#1e40af',
  headerText: '#ffffff',
  headerMuted: '#bfdbfe',
  primary: '#2563eb',
  primaryMuted: '#93c5fd',
  tabBar: '#ffffff',
  tabActive: '#2563eb',
  tabInactive: '#9ca3af',
  dangerBg: '#fee2e2',
  dangerText: '#dc2626',
  errorBannerBg: '#fef2f2',
  errorBannerText: '#b91c1c',
  badgeBg: '#e0e7ff',
  badgeText: '#3730a3',
  scoreHigh: '#16a34a',
  scoreMed: '#d97706',
  scoreLow: '#6b7280',
  shadow: '#000000',
  warningBannerBg: '#fef3c7',
  warningBannerText: '#92400e',
  success: '#16a34a',
  warning: '#d97706',
};

export const darkColors: ThemeColors = {
  background: '#0f172a',
  surface: '#1e293b',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  border: '#334155',
  header: '#1e3a8a',
  headerText: '#ffffff',
  headerMuted: '#93c5fd',
  primary: '#3b82f6',
  primaryMuted: '#1e40af',
  tabBar: '#1e293b',
  tabActive: '#60a5fa',
  tabInactive: '#64748b',
  dangerBg: '#450a0a',
  dangerText: '#f87171',
  errorBannerBg: '#450a0a',
  errorBannerText: '#fca5a5',
  badgeBg: '#312e81',
  badgeText: '#c7d2fe',
  scoreHigh: '#4ade80',
  scoreMed: '#fbbf24',
  scoreLow: '#94a3b8',
  shadow: '#000000',
  warningBannerBg: '#78350f',
  warningBannerText: '#fde68a',
  success: '#4ade80',
  warning: '#fbbf24',
};

export function colorsForTheme(theme: ThemeName): ThemeColors {
  return theme === 'dark' ? darkColors : lightColors;
}

export function parseStoredTheme(value: string | null): ThemeName {
  if (value === 'dark' || value === 'light') return value;
  return 'light';
}

'use client';

import { useTheme } from '@/lib/theme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="w-full mb-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg
                 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors
                 focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      aria-pressed={isDark}
    >
      <span>{isDark ? 'Tema claro' : 'Tema escuro'}</span>
      <span aria-hidden="true">{isDark ? '☀️' : '🌙'}</span>
    </button>
  );
}

'use client';

import { useTheme } from '@/lib/theme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="mb-1 flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      aria-pressed={isDark}
    >
      <span>{isDark ? 'Tema claro' : 'Tema escuro'}</span>
      <span
        className={`inline-flex h-5 w-9 items-center rounded-full border border-white/15 px-0.5 transition ${
          isDark ? 'bg-cyan-500/30' : 'bg-white/10'
        }`}
        aria-hidden="true"
      >
        <span
          className={`h-3.5 w-3.5 rounded-full bg-white transition ${
            isDark ? 'translate-x-3.5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}

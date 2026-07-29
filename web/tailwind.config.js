/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        mist: 'var(--mist)',
        brand: {
          DEFAULT: 'var(--brand)',
          strong: 'var(--brand-strong)',
        },
        signal: 'var(--signal)',
        warn: 'var(--warn)',
        danger: 'var(--danger)',
        surface: 'var(--surface)',
        line: 'var(--line)',
      },
      fontFamily: {
        display: ['var(--font-syne)', 'ui-sans-serif', 'sans-serif'],
        body: ['var(--font-figtree)', 'ui-sans-serif', 'sans-serif'],
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        brand: '0 12px 32px var(--brand-glow)',
      },
    },
  },
  plugins: [],
};

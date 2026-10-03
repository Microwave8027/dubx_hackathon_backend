const rgb = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surfaces and text swap with the theme via CSS variables (see src/index.css).
        bg: rgb('bg'),
        surface: rgb('surface'),
        raised: rgb('raised'),
        line: rgb('line'),
        ink: rgb('ink'),
        muted: rgb('muted'),
        // Status system: idle slate, working blue, needs-you amber, done green, error red.
        status: {
          idle: rgb('status-idle'),
          working: rgb('status-working'),
          needs: rgb('status-needs'),
          done: rgb('status-done'),
          error: rgb('status-error'),
        },
        accent: rgb('accent'),
        'accent-ink': rgb('accent-ink'),
        'on-accent': rgb('on-accent'),
      },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
      borderRadius: { card: '14px' },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      screens: { mid: '800px', wide: '1200px' },
      keyframes: { pulseSoft: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.55' } } },
      animation: { 'pulse-soft': 'pulseSoft 2s ease-in-out infinite' },
    },
  },
  plugins: [],
};

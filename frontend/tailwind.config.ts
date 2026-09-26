import type { Config } from 'tailwindcss'

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          charcoal: '#2C2C2C',
          maroon: '#853953',
          plum: '#612D53',
          surface: '#F3F4F4',
        },
        bg: token('bg'),
        surface: token('surface'),
        panel: token('panel'),
        border: token('border'),
        'border-strong': token('border-strong'),
        fg: token('fg'),
        muted: token('muted'),
        subtle: token('subtle'),
        accent: token('accent'),
        'accent-hover': token('accent-hover'),
        'accent-soft': token('accent-soft'),
        emphasis: token('emphasis'),
        success: token('success'),
        'success-soft': token('success-soft'),
        warning: token('warning'),
        'warning-soft': token('warning-soft'),
        danger: token('danger'),
        'danger-soft': token('danger-soft'),
        info: token('info'),
        'info-soft': token('info-soft'),
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        focus: '0 0 0 3px rgb(var(--accent) / 0.18)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'overlay-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'overlay-out': { from: { opacity: '1' }, to: { opacity: '0' } },
        'dialog-in': {
          from: { opacity: '0', transform: 'translate(-50%, -48%) scale(0.97)' },
          to: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
        },
        'dialog-out': {
          from: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
          to: { opacity: '0', transform: 'translate(-50%, -48%) scale(0.97)' },
        },
        'sheet-in': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        'sheet-out': { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-100%)' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pop-out': { from: { opacity: '1' }, to: { opacity: '0' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'overlay-in': 'overlay-in 160ms ease-out',
        'overlay-out': 'overlay-out 120ms ease-in',
        'dialog-in': 'dialog-in 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        'dialog-out': 'dialog-out 120ms ease-in',
        'sheet-in': 'sheet-in 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'sheet-out': 'sheet-out 160ms ease-in',
        'pop-in': 'pop-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pop-out': 'pop-out 100ms ease-in',
      },
    },
  },
  plugins: [],
} satisfies Config

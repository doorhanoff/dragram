import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito Variable', 'Nunito', 'system-ui', 'sans-serif'],
      },
      colors: {
        accent:   { DEFAULT: 'var(--accent)', light: 'var(--surface2)', text: 'var(--accent2)' },
        accent2:  'var(--accent2)',
        onAccent: 'var(--on-accent)',
        sidebar:  'var(--sidebar)',
        surface:  'var(--surface)',
        surface2: 'var(--surface2)',
        bg:       'var(--bg)',
        border:   'var(--border)',
        primary:  'var(--text)',
        muted:    'var(--muted)',
        online:   '#3E8E5A',
        badge:    'var(--badge)',
        bubbleIn: { DEFAULT: 'var(--bubble-in)', text: 'var(--bubble-in-text)' },
        nav:      'var(--nav)',
      },
      fontSize: {
        '2xs': ['0.5625rem', { lineHeight: '0.75rem' }],
        xs:    ['0.625rem',  { lineHeight: '0.875rem' }],
        sm:    ['0.6875rem', { lineHeight: '1rem' }],
        base:  ['0.75rem',   { lineHeight: '1.125rem' }],
        md:    ['0.8125rem', { lineHeight: '1.25rem' }],
        lg:    ['0.875rem',  { lineHeight: '1.375rem' }],
        xl:    ['0.9375rem', { lineHeight: '1.375rem' }],
      },
      borderRadius: {
        icon: '12px',
        msg:  '22px',
        'msg-in':  '22px 22px 22px 7px',
        'msg-out': '22px 22px 7px 22px',
        card: '24px',
      },
      boxShadow: {
        soft: '0 4px 16px -8px var(--shadow)',
        pop:  '0 12px 28px -10px var(--shadow)',
      },
    },
  },
  plugins: [],
} satisfies Config

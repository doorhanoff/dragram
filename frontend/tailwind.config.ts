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
        online:   'var(--online)',
        danger:   'var(--danger)',
        badge:    'var(--badge)',
        bubbleIn: { DEFAULT: 'var(--bubble-in)', text: 'var(--bubble-in-text)' },
        nav:      'var(--nav)',
      },
      /* Шкала была сдвинута на два шага вниз: текст сообщений 14 px, подписи
         вкладок 9 px. В Telegram и WhatsApp сообщение — 16–17 px, подписи
         вкладок — 12 px. Ниже 12 px не опускаемся нигде.

         2xl и 3xl раньше НЕ переопределялись и оставались стандартными
         (24 и 30 px) — отсюда и брался разрыв: «Чаты» набрано 30 px, а имя
         человека под ним 14 px. Теперь заголовки тоже в шкале. */
      fontSize: {
        '2xs': ['0.75rem',   { lineHeight: '1rem' }],      // 12 — подписи вкладок
        xs:    ['0.75rem',   { lineHeight: '1rem' }],      // 12 — минимум в интерфейсе
        sm:    ['0.8125rem', { lineHeight: '1.125rem' }],  // 13
        base:  ['0.875rem',  { lineHeight: '1.25rem' }],   // 14
        md:    ['0.9375rem', { lineHeight: '1.375rem' }],  // 15 — превью, пояснения
        lg:    ['1rem',      { lineHeight: '1.5rem' }],    // 16 — сообщения, имена
        xl:    ['1.0625rem', { lineHeight: '1.5rem' }],    // 17
        '2xl': ['1.375rem',  { lineHeight: '1.75rem' }],   // 22
        '3xl': ['1.5rem',    { lineHeight: '1.875rem' }],  // 24 — заголовки разделов
      },
      /* Два начертания вместо пяти вперемешку. Разметку не переписываем:
         достаточно свести semibold/bold/extrabold/black к двум значениям —
         обычному 500 и выделенному 700. */
      fontWeight: {
        normal:    '500',
        medium:    '500',
        semibold:  '500',
        bold:      '700',
        extrabold: '700',
        black:     '700',
      },
      /* Два радиуса: 16 px для контролов, 24 px для карточек. */
      borderRadius: {
        lg:   '16px',
        xl:   '16px',
        '2xl':'16px',
        '3xl':'24px',
        icon: '16px',
        msg:  '20px',
        'msg-in':  '20px 20px 20px 6px',
        'msg-out': '20px 20px 6px 20px',
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

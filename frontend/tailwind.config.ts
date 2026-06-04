import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        accent:  {
          DEFAULT: '#5B5EF4',
          light:   '#EDEDFF',
          text:    '#3730A3',
        },
        sidebar: '#16162A',
        surface: '#FFFFFF',
        bg:      '#F7F7F9',
        border:  '#E8E8EE',
        primary: '#1C1C2E',
        muted:   '#A0A0B0',
        online:  '#22C55E',
      },
      fontSize: {
        '2xs': ['9px',  { lineHeight: '12px' }],
        xs:    ['10px', { lineHeight: '14px' }],
        sm:    ['11px', { lineHeight: '16px' }],
        base:  ['12px', { lineHeight: '18px' }],
        md:    ['13px', { lineHeight: '20px' }],
        lg:    ['14px', { lineHeight: '22px' }],
        xl:    ['15px', { lineHeight: '22px' }],
      },
      borderRadius: {
        icon: '10px',
        msg:  '14px',
        'msg-in':  '14px 14px 14px 3px',
        'msg-out': '14px 14px 3px 14px',
      },
    },
  },
  plugins: [],
} satisfies Config

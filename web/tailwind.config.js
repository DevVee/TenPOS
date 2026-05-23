/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#E5484D',
          dark:    '#C93B40',
          light:   '#F16063',
          pale:    '#FEF2F2',
        },
        surface: {
          DEFAULT: '#F5F7FA',
          card:    '#FFFFFF',
          sidebar: '#111318',
        },
        border: {
          DEFAULT: '#E5E7EB',
          strong:  '#D1D5DB',
          subtle:  '#F3F4F6',
        },
        text: {
          primary:   '#111827',
          secondary: '#6B7280',
          muted:     '#9CA3AF',
          inverse:   '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '1.4' }],
        xs:    ['12px', { lineHeight: '1.5' }],
        sm:    ['13px', { lineHeight: '1.5' }],
        base:  ['14px', { lineHeight: '1.6' }],
        md:    ['15px', { lineHeight: '1.5' }],
        lg:    ['16px', { lineHeight: '1.5' }],
        xl:    ['18px', { lineHeight: '1.4' }],
        '2xl': ['20px', { lineHeight: '1.4' }],
        '3xl': ['24px', { lineHeight: '1.3' }],
        '4xl': ['28px', { lineHeight: '1.2' }],
        '5xl': ['32px', { lineHeight: '1.15' }],
        kpi:   ['44px', { lineHeight: '1.05' }],
      },
      spacing: {
        4.5: '18px',
        13:  '52px',
        18:  '72px',
      },
      borderRadius: {
        DEFAULT: '8px',
        sm:  '6px',
        md:  '8px',
        lg:  '10px',
        xl:  '12px',
        '2xl': '12px',   // cap at 12px per spec
      },
      boxShadow: {
        card:     '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        panel:    '0 2px 6px 0 rgb(0 0 0 / 0.07)',
        lift:     '0 4px 12px 0 rgb(0 0 0 / 0.09)',
        brand:    '0 4px 14px -2px rgba(229, 72, 77, 0.25)',
        modal:    '0 20px 60px -10px rgb(0 0 0 / 0.3)',
        sidebar:  '4px 0 20px 0 rgb(0 0 0 / 0.12)',
      },
      transitionDuration: {
        150: '150ms',
        200: '200ms',
      },
    },
  },
  plugins: [],
}

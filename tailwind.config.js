/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Polycopy 2.0 - Industrial Block brand colors
        'poly': {
          yellow: '#FDB022',
          'yellow-hover': '#E5A01F',
          black: '#0F0F0F',
          cream: '#F9F8F1',
          paper: '#FFFFFF',
          indigo: '#4F46E5',
          teal: '#0D9488',
          coral: '#E07A5F',
        },
        // Data colors
        'profit-green': '#10B981',
        'loss-red': '#EF4444',
        'info-blue': '#3B82F6',
        'neutral-grey': '#9CA3AF',
        // Legacy aliases for backward compatibility
        'brand': {
          'yellow': '#FDB022',
          'yellow-hover': '#F59E0B',
          'black': '#0F0F0F',
          'profit': '#10B981',
          'loss': '#EF4444',
          'info': '#3B82F6',
        },
        'brand-yellow': '#FDB022',
        'brand-yellow-hover': '#F59E0B',
        'polycopy-yellow': '#FDB022',
        'polycopy-yellow-hover': '#E5A020',
        'neutral-black': '#0F0F0F',
        'neutral-white': '#FFFFFF',
      },
      fontFamily: {
        sans: ['var(--font-space-grotesk)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
        body: ['var(--font-dm-sans)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Industrial Block typography scale
        'display-xl': ['64px', { lineHeight: '1.1', fontWeight: '700' }],
        'display-lg': ['48px', { lineHeight: '1.1', fontWeight: '700' }],
        'display': ['48px', { lineHeight: '1.2', fontWeight: '700' }],
        'h1': ['36px', { lineHeight: '1.25', fontWeight: '700' }],
        'h2': ['30px', { lineHeight: '1.3', fontWeight: '700' }],
        'h3': ['24px', { lineHeight: '1.35', fontWeight: '600' }],
        'h4': ['20px', { lineHeight: '1.4', fontWeight: '600' }],
        'body-xl': ['20px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-lg': ['18px', { lineHeight: '1.6', fontWeight: '400' }],
        'body': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '1.4', fontWeight: '500' }],
        'micro': ['10px', { lineHeight: '1.3', fontWeight: '500' }],
      },
      letterSpacing: {
        industrial: '0.2em',
        wide: '0.1em',
        subtle: '0.05em',
      },
      boxShadow: {
        sm: '0 1px 3px rgba(0, 0, 0, 0.08)',
        md: '0 4px 12px rgba(0, 0, 0, 0.12)',
        lg: '0 8px 24px rgba(0, 0, 0, 0.16)',
      },
    },
  },
  plugins: [],
}


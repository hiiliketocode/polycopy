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
        // Brand color palette
        'brand': {
          'yellow': '#FDB022',
          'yellow-hover': '#F59E0B',
          'black': '#0F0F0F',
          'profit': '#10B981',
          'loss': '#EF4444',
          'info': '#3B82F6',
        },
        // Legacy aliases for backward compatibility
        'brand-yellow': '#FDB022',
        'brand-yellow-hover': '#F59E0B',
        // Polycopy brand colors (for landing page)
        'polycopy-yellow': '#FDB022',
        'polycopy-yellow-hover': '#E5A020',
        'neutral-black': '#0F0F0F',
        'neutral-white': '#FFFFFF',
        'profit-green': '#10B981',
        'loss-red': '#EF4444',
        'info-blue': '#3B82F6',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Brand typography scale
        'display': ['48px', { lineHeight: '1.2', fontWeight: '700' }],
        'h1': ['36px', { lineHeight: '1.25', fontWeight: '700' }],
        'h2': ['30px', { lineHeight: '1.3', fontWeight: '700' }],
        'h3': ['24px', { lineHeight: '1.35', fontWeight: '600' }],
        'h4': ['20px', { lineHeight: '1.4', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '1.6', fontWeight: '400' }],
        'body': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '1.4', fontWeight: '500' }],
      },
    },
  },
  plugins: [],
}


/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'ui-sans-serif', 'sans-serif'],
        body: ['"DM Sans"', 'ui-sans-serif', 'sans-serif'],
      },
      colors: {
        canvas: '#F6F4EF',
        ink: { DEFAULT: '#0F1B33', soft: '#44506A', faint: '#7A8499' },
        line: '#E3DFD5',
        focus: '#3B5B8C',
        sev: { low: '#B7791F', mid: '#C2410C', high: '#B91C1C' },
      },
    },
  },
  plugins: [],
}

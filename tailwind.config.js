/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F3F4F0', // fondo
        ink: '#15201A', // texto
        value: '#15744A', // hay valor
        marginal: '#B7791F', // marginal
        novalue: '#A32D22', // sin valor
        line: '#DDE2DA', // bordes
        betano: '#D9480F', // naranja de la marca Betano (ligeramente oscurecido para leerse bien sobre fondo claro)
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
      minHeight: { touch: '2.75rem' }, // 44 px
      minWidth: { touch: '2.75rem' },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
// Todos los colores salen de variables CSS (src/style.css) para que el modo claro y el oscuro compartan nombres.
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      colors: {
        // Superficies y texto
        canvas: c('canvas'), // fondo de la página
        surface: c('surface'), // tarjetas
        sunken: c('sunken'), // zonas hundidas dentro de una tarjeta
        ink: c('ink'), // texto
        line: c('line'), // bordes

        // Identidad: azules y cian
        primary: c('primary'), // #0077b6 · acciones, estados activos
        brand: c('brand'), // texto/íconos de marca legibles sobre el fondo actual
        accent: c('accent'), // #00b4d8 · acentos e indicadores
        mist: c('mist'), // #90e0ef · detalles
        tint: c('tint'), // #caf0f8 · fondos suaves

        // Señales de resultado (se conservan: un semáforo necesita verde, ámbar y rojo)
        value: c('pos'), // hay valor / ganancia
        marginal: c('warn'), // marginal
        novalue: c('neg'), // sin valor / pérdida
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

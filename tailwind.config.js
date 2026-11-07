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
      // Escala única de la app: todo sale de variables CSS (src/style.css) que cambian con la densidad y el ancho de pantalla.
      fontSize: {
        cap: ['var(--fs-cap)', 'var(--lh-cap)'], // rótulos secundarios: nunca menos de 12 px
        xs: ['var(--fs-xs)', 'var(--lh-xs)'], // datos: 14 px en móvil
        sm: ['var(--fs-sm)', 'var(--lh-sm)'], // texto principal: 15 px en móvil
        title: ['clamp(0.9375rem, 0.9rem + 0.15vw, 1rem)', '1.25rem'], // títulos de tarjeta
      },
      spacing: {
        pad: 'var(--pad)', // relleno de tarjetas
        'pad-sm': 'var(--pad-sm)', // relleno de filas y bloques internos
        stack: 'var(--gap)', // separación entre bloques
        'stack-sm': 'var(--gap-sm)', // separación dentro de un bloque
        'page-x': 'var(--page-x)', // margen lateral de la página
        'page-y': 'var(--page-y)', // margen vertical de la página
      },
      borderRadius: { card: 'var(--radius)', ctl: 'var(--radius-sm)' },
      minHeight: { touch: 'var(--touch)' }, // alto mínimo de controles: 44 px cómodo; 40 px (móvil) o 36 px (escritorio) compacto
      minWidth: { touch: 'var(--touch)' },
      height: { touch: 'var(--touch)' },
      maxWidth: { page: '110rem' },
    },
  },
  plugins: [],
};

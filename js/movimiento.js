(() => {
  'use strict';

  /* ---------------------------------------------------------------
     1. Condiciones para animar
     --------------------------------------------------------------- */
  if (!window.gsap || !window.ScrollTrigger) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  gsap.registerPlugin(ScrollTrigger);
  document.documentElement.classList.add('con-gsap');

  /* ---------------------------------------------------------------
     2. Revelado de texto palabra por palabra (scrub)
     --------------------------------------------------------------- */
  document.querySelectorAll('[data-revelar-texto]').forEach((parrafo) => {
    const palabras = parrafo.textContent.trim().split(/\s+/);
    parrafo.textContent = '';
    palabras.forEach((palabra, i) => {
      const span = document.createElement('span');
      span.className = 'palabra';
      span.textContent = palabra;
      parrafo.appendChild(span);
      if (i < palabras.length - 1) parrafo.appendChild(document.createTextNode(' '));
    });

    gsap.fromTo(parrafo.querySelectorAll('.palabra'),
      { opacity: 0.12 },
      {
        opacity: 1,
        ease: 'none',          // scrub: la posición del scroll es la que manda
        stagger: 0.08,
        scrollTrigger: {
          trigger: parrafo,
          start: 'top 82%',
          end: 'bottom 48%',
          scrub: 0.6,          // pequeño suavizado para que no se sienta rígido
        },
      });
  });

  /* ---------------------------------------------------------------
     3. Tarjetas que se apilan
     --------------------------------------------------------------- */
  const cartas = gsap.utils.toArray('[data-pila] .pila__carta');
  cartas.forEach((carta, i) => {
    const siguiente = cartas[i + 1];
    if (!siguiente) return;

    // Capa oscura propia: se anima su opacidad (no un filtro, que es más costoso)
    const sombra = document.createElement('span');
    sombra.className = 'pila__sombra';
    sombra.setAttribute('aria-hidden', 'true');
    carta.appendChild(sombra);

    const linea = gsap.timeline({
      scrollTrigger: {
        trigger: siguiente,
        // La tarjeta se oscurece solo cuando la siguiente pasa a ser la activa (40 %)
        start: 'top 40%',
        end: 'top 18%',
        scrub: 0.6,
      },
    });
    // Solo se oscurece (sin escalar): todas las tarjetas mantienen el mismo tamaño
    linea.to(sombra, { opacity: 0.45, ease: 'none' }, 0);
  });

  /* ---------------------------------------------------------------
     4. Recalcular posiciones cuando cambia la altura de la página
        (la calculadora crece al generar la matriz o la tabla)
     --------------------------------------------------------------- */
  let pendiente = null;
  const refrescar = () => {
    cancelAnimationFrame(pendiente);
    pendiente = requestAnimationFrame(() => ScrollTrigger.refresh());
  };
  if ('ResizeObserver' in window) new ResizeObserver(refrescar).observe(document.body);
  window.addEventListener('load', refrescar);
})();

/* ---------------------------------------------------------------
   5. Tarjeta activa del procedimiento
      Se resalta (borde y halo) la tarjeta del paso que se está leyendo:
      la última cuya parte superior ya pasó la línea de lectura (40 % del
      alto de la ventana). No depende de GSAP: funciona también sin
      internet y con movimiento reducido (el cambio es solo de color).
   --------------------------------------------------------------- */
(() => {
  'use strict';

  const cartas = [...document.querySelectorAll('[data-pila] .pila__carta')];
  if (!cartas.length) return;

  let activa = null;
  let pendiente = null;

  const actualizar = () => {
    pendiente = null;
    const linea = window.innerHeight * 0.4;
    const seccion = cartas[0].parentElement.getBoundingClientRect();
    // Fuera de la sección no se resalta ninguna tarjeta
    let nueva = null;
    if (seccion.bottom > linea && seccion.top < window.innerHeight) {
      cartas.forEach((carta) => {
        if (carta.getBoundingClientRect().top <= linea) nueva = carta;
      });
      if (!nueva) nueva = cartas[0];
    }
    if (nueva === activa) return;
    activa?.classList.remove('pila__carta--activa');
    nueva?.classList.add('pila__carta--activa');
    activa = nueva;
    // Con una tarjeta activa, las demás se muestran apagadas
    cartas[0].parentElement.classList.toggle('pila--con-activa', nueva !== null);
  };

  const programar = () => {
    if (pendiente === null) pendiente = requestAnimationFrame(actualizar);
  };
  window.addEventListener('scroll', programar, { passive: true });
  window.addEventListener('resize', programar);
  actualizar();
})();

const Grafo = (() => {
  'use strict';

  /* ---------------------------------------------------------------
     1. Constantes y estado interno
     --------------------------------------------------------------- */
  const NS = 'http://www.w3.org/2000/svg';
  const ANCHO = 820;
  const ALTO = 580;
  const R_NODO = 22;           // radio de cada vértice
  const CURVATURA = 30;        // separación de aristas recíprocas
  const ESTADOS_FLECHA = ['base', 'arbol', 'evaluada', 'descartada', 'camino'];

  let svg, capaAristas, capaPesos, capaNodos;
  let posiciones = [];         // [{x, y}] por vértice
  let nombres = [];
  let aristas = [];            // [{i, j, peso, reciproca, path, peso: g}]
  let mapaAristas = new Map(); // "i-j" → arista
  let nodos = [];              // [{g, cuerpo, circulo, badge, badgeRect, badgeTexto, tag}]
  let alSeleccionar = null;    // callback al hacer clic en un vértice
  let arrastre = null;

  /* ---------------------------------------------------------------
     2. Utilidades SVG
     --------------------------------------------------------------- */
  function crear(etiqueta, atributos = {}, padre = null) {
    const nodo = document.createElementNS(NS, etiqueta);
    for (const [k, v] of Object.entries(atributos)) nodo.setAttribute(k, v);
    if (padre) padre.appendChild(nodo);
    return nodo;
  }

  /** Punto a "distancia" de "desde" en dirección a "hacia". */
  function acercar(desde, hacia, distancia) {
    const dx = hacia.x - desde.x;
    const dy = hacia.y - desde.y;
    const largo = Math.hypot(dx, dy) || 1;
    return { x: desde.x + (dx / largo) * distancia, y: desde.y + (dy / largo) * distancia };
  }

  /** Convierte coordenadas de pantalla a coordenadas del SVG. */
  function puntoSVG(evento) {
    const p = svg.createSVGPoint();
    p.x = evento.clientX;
    p.y = evento.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }

  const limitar = (valor, min, max) => Math.max(min, Math.min(max, valor));

  /* ---------------------------------------------------------------
     3. Inicialización: capas y marcadores de flecha
     --------------------------------------------------------------- */
  function init(elementoSVG, { onSeleccionar } = {}) {
    svg = elementoSVG;
    svg.setAttribute('viewBox', `0 0 ${ANCHO} ${ALTO}`);
    alSeleccionar = onSeleccionar || null;

    const defs = crear('defs', {}, svg);
    // Un marcador por estado para que la flecha tenga el color de la arista
    ESTADOS_FLECHA.forEach((estado) => {
      const marcador = crear('marker', {
        id: `flecha-${estado}`,
        viewBox: '0 0 10 10',
        refX: 9, refY: 5,
        markerWidth: 11, markerHeight: 11,
        markerUnits: 'userSpaceOnUse',
        orient: 'auto',
      }, defs);
      crear('path', { d: 'M0,1 L9.5,5 L0,9 L2.2,5 Z', class: `flecha flecha--${estado}` }, marcador);
    });

    capaAristas = crear('g', { class: 'capa-aristas' }, svg);
    capaPesos = crear('g', { class: 'capa-pesos' }, svg);
    capaNodos = crear('g', { class: 'capa-nodos' }, svg);
  }

  /* ---------------------------------------------------------------
     4. Distribución de los vértices: columnas de izquierda a derecha
        Igual que un grafo dibujado a mano: el primer vértice solo a la
        izquierda, el último solo a la derecha y los intermedios en
        columnas de 2 o 3, en orden alfabético de arriba hacia abajo.
        Como las aristas generadas van siempre hacia letras posteriores,
        las flechas avanzan de izquierda a derecha.
     --------------------------------------------------------------- */
  function distribucionPorColumnas(n, { ancho = ANCHO, alto = ALTO, margenX = 64, margenY = 86, ajusteY = 6 } = {}) {
    const medio = alto / 2 + ajusteY;
    const intermedios = n - 2;
    const filas = intermedios <= 6 ? 2 : 3;
    const columnasMedias = Math.ceil(intermedios / filas);
    const totalColumnas = columnasMedias + 2;
    const pasoX = (ancho - 2 * margenX) / (totalColumnas - 1);
    const pasoY = (alto - 2 * margenY) / (filas - 1);

    return Array.from({ length: n }, (_, v) => {
      if (v === 0) return { x: margenX, y: medio };
      if (v === n - 1) return { x: ancho - margenX, y: medio };
      const k = v - 1;
      const col = Math.floor(k / filas);
      const enColumna = Math.min(filas, intermedios - col * filas);
      const fila = k % filas;
      // Una columna incompleta se centra verticalmente
      const y = medio + (fila - (enColumna - 1) / 2) * pasoY;
      return { x: margenX + (col + 1) * pasoX, y };
    });
  }

  /**
   * Si el segmento p → q pasa encima de otro vértice, devuelve cuánto hay
   * que curvar la arista (con signo) para rodearlo; si no, 0.
   */
  function desvioPorObstaculo(a, p, q) {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const largo2 = dx * dx + dy * dy || 1;
    const largo = Math.sqrt(largo2);
    const holgura = R_NODO + 14;
    let desvio = 0;
    posiciones.forEach((o, v) => {
      if (v === a.i || v === a.j) return;
      const t = ((o.x - p.x) * dx + (o.y - p.y) * dy) / largo2;
      if (t <= 0.05 || t >= 0.95) return;
      const cruz = ((o.x - p.x) * dy - (o.y - p.y) * dx) / largo; // distancia con signo
      const dist = Math.abs(cruz);
      if (dist >= holgura) return;
      // La curva cuadrática se separa 2t(1−t)·c de la recta en el parámetro t
      const necesario = Math.min(160, (holgura - dist) / (2 * t * (1 - t)));
      if (necesario > Math.abs(desvio)) desvio = (cruz >= 0 ? 1 : -1) * necesario;
    });
    return desvio;
  }

  /* ---------------------------------------------------------------
     5. Dibujo completo del grafo a partir de la matriz
     --------------------------------------------------------------- */

  /**
   * @param {number[][]} matriz
   * @param {string[]} listaNombres
   * @param {{reiniciarPosiciones?: boolean}} opciones
   */
  function dibujar(matriz, listaNombres, { reiniciarPosiciones = false } = {}) {
    const n = matriz.length;
    nombres = listaNombres;
    if (reiniciarPosiciones || posiciones.length !== n) posiciones = distribucionPorColumnas(n);

    capaAristas.replaceChildren();
    capaPesos.replaceChildren();
    capaNodos.replaceChildren();
    aristas = [];
    mapaAristas = new Map();
    nodos = [];

    // 5.1 Aristas (una por cada celda con peso > 0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const peso = matriz[i][j];
        if (i === j || !(peso > 0)) continue;

        const path = crear('path', {
          class: 'arista',
          'marker-end': 'url(#flecha-base)',
          pathLength: 1,
        }, capaAristas);
        crear('title', {}, path).textContent = `${nombres[i]} → ${nombres[j]}: ${peso}`;

        const grupoPeso = crear('g', { class: 'peso' }, capaPesos);
        const texto = String(peso);
        const ancho = 12 + texto.length * 7.6;
        crear('rect', { x: -ancho / 2, y: -10.5, width: ancho, height: 21, rx: 10.5 }, grupoPeso);
        crear('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' }, grupoPeso).textContent = texto;

        const arista = { i, j, peso, reciproca: matriz[j][i] > 0, path, grupoPeso };
        aristas.push(arista);
        mapaAristas.set(`${i}-${j}`, arista);
      }
    }

    // 5.2 Vértices
    for (let v = 0; v < n; v++) {
      const g = crear('g', {
        class: 'nodo',
        tabindex: 0,
        role: 'button',
        'aria-label': `Vértice ${nombres[v]}`,
      }, capaNodos);
      const cuerpo = crear('g', { class: 'nodo__cuerpo' }, g);
      crear('circle', { class: 'nodo__anillo', r: R_NODO + 6 }, cuerpo);
      const circulo = crear('circle', { class: 'nodo__circulo', r: R_NODO }, cuerpo);
      crear('text', { class: 'nodo__nombre', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, cuerpo)
        .textContent = nombres[v];

      // Etiqueta [d, P] que aparece sobre el vértice durante la resolución
      const badge = crear('g', { class: 'nodo__badge', transform: `translate(0 ${-R_NODO - 17})` }, cuerpo);
      const badgeRect = crear('rect', { y: -11, height: 22, rx: 11 }, badge);
      const badgeTexto = crear('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' }, badge);

      // Texto "Origen" / "Destino"
      const tag = crear('text', { class: 'nodo__tag', y: R_NODO + 20, 'text-anchor': 'middle' }, cuerpo);

      eventosNodo(g, v);
      nodos.push({ g, cuerpo, circulo, badge, badgeRect, badgeTexto, tag });
    }

    actualizarGeometria();
  }

  /* ---------------------------------------------------------------
     6. Geometría: recalcula posiciones (al dibujar y al arrastrar)
     --------------------------------------------------------------- */
  function actualizarGeometria() {
    aristas.forEach((a) => {
      const p = posiciones[a.i];
      const q = posiciones[a.j];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const largo = Math.hypot(dx, dy) || 1;
      // Normal unitaria: las aristas recíprocas se curvan hacia lados opuestos
      // y las que pasarían encima de otro vértice se curvan para rodearlo
      const nx = -dy / largo;
      const ny = dx / largo;
      const obstaculo = desvioPorObstaculo(a, p, q);
      const curva = obstaculo + (a.reciproca ? CURVATURA : 0);
      const control = { x: (p.x + q.x) / 2 + nx * curva, y: (p.y + q.y) / 2 + ny * curva };

      const inicio = acercar(p, control, R_NODO + 1);
      const fin = acercar(q, control, R_NODO + 3);
      a.path.setAttribute('d', `M${inicio.x},${inicio.y} Q${control.x},${control.y} ${fin.x},${fin.y}`);

      // Punto medio de la curva cuadrática (t = 0.5) para el peso
      const mx = 0.25 * inicio.x + 0.5 * control.x + 0.25 * fin.x;
      const my = 0.25 * inicio.y + 0.5 * control.y + 0.25 * fin.y;
      a.grupoPeso.setAttribute('transform', `translate(${mx} ${my})`);
    });

    nodos.forEach((nodo, v) => {
      nodo.g.setAttribute('transform', `translate(${posiciones[v].x} ${posiciones[v].y})`);
    });
  }

  /** Vuelve a la distribución original en columnas. */
  function reorganizar() {
    posiciones = distribucionPorColumnas(posiciones.length);
    actualizarGeometria();
  }

  /* ---------------------------------------------------------------
     7. Interacción: clic para seleccionar, arrastrar para mover
     --------------------------------------------------------------- */
  function eventosNodo(g, v) {
    g.addEventListener('pointerdown', (e) => {
      // Un solo puntero a la vez: si se apoya otro dedo durante el arrastre,
      // se ignora (evita que el vértice "salte" a la posición del segundo dedo)
      if (e.button !== 0 || arrastre) return;
      const p = puntoSVG(e);
      arrastre = { v, puntero: e.pointerId, inicio: p, movido: false };
      g.setPointerCapture(e.pointerId);
      g.classList.add('nodo--arrastrando');
    });

    g.addEventListener('pointermove', (e) => {
      if (!arrastre || arrastre.v !== v || arrastre.puntero !== e.pointerId) return;
      const p = puntoSVG(e);
      if (!arrastre.movido && Math.hypot(p.x - arrastre.inicio.x, p.y - arrastre.inicio.y) < 4) return;
      arrastre.movido = true;
      posiciones[v] = {
        x: limitar(p.x, R_NODO + 4, ANCHO - R_NODO - 4),
        y: limitar(p.y, R_NODO + 34, ALTO - R_NODO - 26),
      };
      actualizarGeometria();
    });

    const soltar = (e) => {
      if (!arrastre || arrastre.v !== v || arrastre.puntero !== e.pointerId) return;
      const fueClic = !arrastre.movido;
      arrastre = null;
      g.classList.remove('nodo--arrastrando');
      if (fueClic && alSeleccionar) alSeleccionar(v);
    };
    g.addEventListener('pointerup', soltar);
    g.addEventListener('pointercancel', (e) => {
      if (arrastre?.puntero !== e.pointerId) return;
      arrastre = null;
      g.classList.remove('nodo--arrastrando');
    });

    // Accesibilidad: Enter o Espacio seleccionan el vértice
    g.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && alSeleccionar) {
        e.preventDefault();
        alSeleccionar(v);
      }
    });
  }

  /* ---------------------------------------------------------------
     8. Origen y destino
     --------------------------------------------------------------- */
  function marcarExtremos(origen, destino) {
    nodos.forEach((nodo, v) => {
      nodo.g.classList.toggle('nodo--origen', v === origen);
      nodo.g.classList.toggle('nodo--destino', v === destino);
      nodo.tag.textContent = v === origen ? 'Origen' : v === destino ? 'Destino' : '';
    });
  }

  /* ---------------------------------------------------------------
     9. Estado de una iteración de Dijkstra
     --------------------------------------------------------------- */
  const CLASES_NODO = ['nodo--etiquetado', 'nodo--fijo', 'nodo--actual', 'nodo--elegido', 'nodo--camino', 'nodo--inalcanzable'];
  const CLASES_ARISTA = ['arista--arbol', 'arista--evaluada', 'arista--descartada', 'arista--camino', 'arista--atenuada'];

  /**
   * @param {object} paso
   * @param {Set<number>} paso.fijos        vértices fijados
   * @param {Set<number>} paso.etiquetados  vértices con etiqueta vigente
   * @param {number|null} paso.actual       vértice cuyos adyacentes se etiquetan
   * @param {number|null} paso.elegido      vértice que se fija al final de la iteración
   * @param {string[]}    paso.badges       texto de la etiqueta de cada vértice ('' = oculta)
   * @param {Array}       paso.evaluadas    [{i, j, resultado}]
   * @param {Array}       paso.arbol        [[i, j]] aristas de predecesores vigentes
   * @param {Array}       paso.camino       [[i, j]] aristas del/los camino(s) mínimo(s)
   * @param {Set<number>} paso.enCamino     vértices del camino mínimo
   */
  function mostrarPaso(paso) {
    limpiarPaso();
    const hayCamino = paso.camino && paso.camino.length > 0;

    // 9.1 Vértices
    nodos.forEach((nodo, v) => {
      const cl = nodo.g.classList;
      if (paso.etiquetados?.has(v)) cl.add('nodo--etiquetado');
      if (paso.fijos?.has(v)) cl.add('nodo--fijo');
      if (paso.actual === v) cl.add('nodo--actual');
      if (paso.elegido === v) cl.add('nodo--elegido');
      if (paso.enCamino?.has(v)) cl.add('nodo--camino');
      if (paso.inalcanzables?.has(v)) cl.add('nodo--inalcanzable');

      const texto = paso.badges?.[v] || '';
      nodo.badge.classList.toggle('nodo__badge--visible', texto !== '');
      if (texto) {
        nodo.badgeTexto.textContent = texto;
        const ancho = 16 + texto.length * 7.2;
        nodo.badgeRect.setAttribute('x', -ancho / 2);
        nodo.badgeRect.setAttribute('width', ancho);
      }
    });

    // 9.2 Aristas: el estado de mayor prioridad define el color de la flecha
    const estadoFlecha = new Map();
    const marcar = (i, j, clase, flecha) => {
      const a = mapaAristas.get(`${i}-${j}`);
      if (!a) return;
      a.path.classList.add(clase);
      a.grupoPeso.classList.add(clase.replace('arista', 'peso'));
      estadoFlecha.set(a, flecha);
    };

    (paso.arbol || []).forEach(([i, j]) => marcar(i, j, 'arista--arbol', 'arbol'));
    (paso.evaluadas || []).forEach(({ i, j, resultado }) => {
      const descartada = resultado === 'descarta';
      marcar(i, j, descartada ? 'arista--descartada' : 'arista--evaluada', descartada ? 'descartada' : 'evaluada');
    });
    (paso.camino || []).forEach(([i, j]) => marcar(i, j, 'arista--camino', 'camino'));

    aristas.forEach((a) => {
      if (hayCamino && !a.path.classList.contains('arista--camino')) {
        a.path.classList.add('arista--atenuada');
        a.grupoPeso.classList.add('peso--atenuada');
      }
      a.path.setAttribute('marker-end', `url(#flecha-${estadoFlecha.get(a) || 'base'})`);
    });

    // Las aristas del camino se dibujan encima de las demás
    if (hayCamino) {
      aristas.filter((a) => a.path.classList.contains('arista--camino'))
        .forEach((a) => capaAristas.appendChild(a.path));
    }
  }

  /** Quita todas las marcas de la resolución (deja el grafo "limpio"). */
  function limpiarPaso() {
    nodos.forEach((nodo) => {
      nodo.g.classList.remove(...CLASES_NODO);
      nodo.badge.classList.remove('nodo__badge--visible');
    });
    aristas.forEach((a) => {
      a.path.classList.remove(...CLASES_ARISTA);
      a.grupoPeso.classList.remove(...CLASES_ARISTA.map((c) => c.replace('arista', 'peso')));
      a.path.setAttribute('marker-end', 'url(#flecha-base)');
    });
  }

  /* ---------------------------------------------------------------
     10. API pública del módulo
     --------------------------------------------------------------- */
  return { distribucionPorColumnas, init, dibujar, reorganizar, marcarExtremos, mostrarPaso, limpiarPaso };
})();

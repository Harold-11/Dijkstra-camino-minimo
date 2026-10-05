const Matriz = (() => {
  'use strict';

  /* ---------------------------------------------------------------
     1. Constantes del problema
     --------------------------------------------------------------- */
  const N_MIN = 5;        // mínimo de vértices exigido por el enunciado
  const N_MAX = 15;       // máximo de vértices exigido por el enunciado
  const PESO_MIN = 1;
  const PESO_MAX = 999;
  const ALCANCE = 3;      // generación aleatoria: cada vértice conecta solo con los 3 siguientes

  /* ---------------------------------------------------------------
     2. Nombres de los vértices (A, B, C, ...)
     --------------------------------------------------------------- */
  const nombre = (i) => String.fromCharCode(65 + i);
  const nombres = (n) => Array.from({ length: n }, (_, i) => nombre(i));

  /* ---------------------------------------------------------------
     3. Creación de matrices
     --------------------------------------------------------------- */

  /** Matriz n×n llena de ceros (grafo sin aristas). */
  const crearVacia = (n) => Array.from({ length: n }, () => Array(n).fill(0));

  /** Copia profunda de una matriz. */
  const clonar = (m) => m.map((fila) => fila.slice());

  /**
   * Cambia el tamaño de una matriz conservando los valores que coinciden.
   * Se usa cuando el usuario modifica n después de haber llenado la matriz.
   */
  function redimensionar(m, n) {
    const nueva = crearVacia(n);
    if (!m) return nueva;
    for (let i = 0; i < Math.min(n, m.length); i++) {
      for (let j = 0; j < Math.min(n, m.length); j++) {
        nueva[i][j] = i === j ? 0 : m[i][j];
      }
    }
    return nueva;
  }

  /* ---------------------------------------------------------------
     4. Generación automática (aleatoria)
     --------------------------------------------------------------- */

  const enteroAleatorio = (min, max) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  /**
   * Genera una matriz ponderada de un grafo DIRIGIDO y SIN CICLOS.
   *
   * Garantía de que no hay ciclos: solo se crean aristas i → j con i < j
   * (matriz triangular superior).
   * Como cualquier recorrido avanza siempre hacia vértices "posteriores",
   * es imposible volver a un vértice ya visitado.
   *
   * Aristas solo entre vértices CERCANOS: cada vértice conecta como máximo
   * con los ALCANCE siguientes (A con B, C o D; nunca A con H). Así, llegar
   * a un vértice lejano exige pasar por varios intermedios y el algoritmo
   * tiene que comparar etiquetas de verdad, en lugar de que casi siempre
   * gane una sola arista directa.
   *
   * @param {number} n                 número de vértices
   * @param {object} opciones
   * @param {number} opciones.densidad probabilidad (0–1) de que exista cada arista
   *                                   i → j entre vértices cercanos (i < j ≤ i + ALCANCE)
   * @param {number} opciones.min      peso mínimo
   * @param {number} opciones.max      peso máximo
   * @param {boolean} opciones.garantizarCamino
   *        si es true, todo vértice distinto de A recibe al menos una arista
   *        desde un vértice anterior cercano; así todos son alcanzables desde A.
   *        Además, todo vértice distinto del último tiene al menos una salida.
   */
  function generarAleatoria(n, { densidad = 0.5, min = 1, max = 20, garantizarCamino = true } = {}) {
    const m = crearVacia(n);
    const ultimoCercano = (i) => Math.min(n - 1, i + ALCANCE);

    // 1. Aristas aleatorias solo hacia vértices posteriores y cercanos
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j <= ultimoCercano(i); j++) {
        if (Math.random() < densidad) m[i][j] = enteroAleatorio(min, max);
      }
    }

    if (garantizarCamino) {
      // 2. Cada vértice j > 0 debe tener al menos una arista de entrada desde
      //    algún i cercano con i < j: por inducción, todos son alcanzables desde A.
      for (let j = 1; j < n; j++) {
        const desde = Math.max(0, j - ALCANCE);
        const tieneEntrada = m.some((fila, i) => i < j && fila[j] > 0);
        if (!tieneEntrada) m[enteroAleatorio(desde, j - 1)][j] = enteroAleatorio(min, max);
      }
      // 3. Cada vértice i < n − 1 debe tener al menos una arista de salida
      //    hacia algún j > i cercano (ningún vértice intermedio queda "sin salida").
      for (let i = 0; i < n - 1; i++) {
        const tieneSalida = m[i].some((w, j) => j > i && w > 0);
        if (!tieneSalida) m[i][enteroAleatorio(i + 1, ultimoCercano(i))] = enteroAleatorio(min, max);
      }
    }
    return m;
  }

  /**
   * Busca un ciclo dirigido (búsqueda en profundidad con tres colores).
   * @returns {number[]|null} vértices del ciclo (el primero se repite al
   *          final, p. ej. [0, 2, 3, 0]) o null si el grafo no tiene ciclos.
   */
  function buscarCiclo(m) {
    const n = m.length;
    const estado = Array(n).fill(0); // 0 = sin visitar, 1 = en la pila, 2 = terminado
    const pila = [];
    let ciclo = null;

    const visitar = (u) => {
      estado[u] = 1;
      pila.push(u);
      for (let v = 0; v < n && !ciclo; v++) {
        if (!(m[u][v] > 0)) continue;
        if (estado[v] === 1) ciclo = [...pila.slice(pila.indexOf(v)), v];
        else if (estado[v] === 0) visitar(v);
      }
      pila.pop();
      estado[u] = 2;
    };

    for (let i = 0; i < n && !ciclo; i++) if (estado[i] === 0) visitar(i);
    return ciclo;
  }

  /* ---------------------------------------------------------------
     5. Validación
     --------------------------------------------------------------- */

  /**
   * Valida el texto de una celda. Vacío, "0", "-" o "∞" significan "sin arista".
   * @returns {{ok: boolean, valor?: number, error?: string}}
   */
  function validarCelda(texto) {
    const t = String(texto ?? '').trim();
    if (t === '' || t === '-' || t === '–' || t === '∞' || /^inf$/i.test(t)) {
      return { ok: true, valor: 0 };
    }
    if (!/^\d+$/.test(t)) {
      return { ok: false, error: 'Solo se permiten enteros no negativos.' };
    }
    const valor = Number(t);
    if (valor > PESO_MAX) {
      return { ok: false, error: `El peso máximo permitido es ${PESO_MAX}.` };
    }
    return { ok: true, valor };
  }

  /** Cantidad de aristas (celdas con peso > 0). */
  const contarAristas = (m) =>
    m ? m.reduce((total, fila) => total + fila.filter((w) => w > 0).length, 0) : 0;

  /** Peso máximo presente en la matriz (para el mapa de calor del editor). */
  const pesoMaximo = (m) => Math.max(1, ...m.flat());

  /* ---------------------------------------------------------------
     6. Importar / exportar como texto
     --------------------------------------------------------------- */

  /**
   * Convierte un texto pegado (por ejemplo desde Excel o un PDF) en matriz.
   * Filas separadas por saltos de línea; valores por espacios, tabs, comas o ';'.
   * @returns {{matriz?: number[][], error?: string}}
   */
  function desdeTexto(texto) {
    const filas = String(texto)
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter((linea) => linea.length > 0)
      .map((linea) => linea.split(/[\s,;]+/));

    const n = filas.length;
    if (n < N_MIN || n > N_MAX) {
      return { error: `La matriz debe tener entre ${N_MIN} y ${N_MAX} filas (se encontraron ${n}).` };
    }

    const m = crearVacia(n);
    for (let i = 0; i < n; i++) {
      if (filas[i].length !== n) {
        return { error: `La fila ${i + 1} tiene ${filas[i].length} valores; se esperaban ${n} (matriz cuadrada).` };
      }
      for (let j = 0; j < n; j++) {
        const r = validarCelda(filas[i][j]);
        if (!r.ok) return { error: `Fila ${i + 1}, columna ${j + 1}: ${r.error}` };
        if (i === j && r.valor !== 0) {
          return { error: `La diagonal debe ser 0 (fila ${i + 1}, columna ${j + 1}).` };
        }
        m[i][j] = r.valor;
      }
    }
    return { matriz: m };
  }

  /** Matriz → texto separado por tabulaciones (se pega directo en Excel). */
  const aTexto = (m) => m.map((fila) => fila.join('\t')).join('\n');

  /* ---------------------------------------------------------------
     7. Ejemplo resuelto (camino mínimo de A a H)
        Respuesta esperada: distancia 8, rutas A-C-D-F-H y A-C-D-E-H
     --------------------------------------------------------------- */
  const EJEMPLO_CURSO = {
    origen: 0,   // A
    destino: 7,  // H
    matriz: [
      //A  B  C  D  E  F  G  H
      [0, 3, 1, 0, 0, 0, 0, 0], // A
      [0, 0, 0, 1, 0, 0, 5, 0], // B
      [0, 0, 0, 2, 0, 5, 0, 0], // C
      [0, 0, 0, 0, 4, 2, 0, 0], // D
      [0, 0, 0, 0, 0, 0, 2, 1], // E
      [0, 0, 0, 0, 0, 0, 0, 3], // F
      [0, 0, 0, 0, 0, 0, 0, 0], // G
      [0, 0, 0, 0, 0, 0, 0, 0], // H
    ],
  };

  /* ---------------------------------------------------------------
     8. Casos para practicar (carrusel). Resultados verificados:
        - Resuelto:     A → H = 8   (A-C-D-F-H y A-C-D-E-H)
        - Reparto:      A → F = 11  (A-C-F, ruta única)
        - Varias rutas: A → F = 6   (tres rutas mínimas)
        - Sin camino:   A → C = ∞   (C no tiene aristas de entrada)
        Las cuatro matrices son triangulares superiores: grafos sin ciclos.
     --------------------------------------------------------------- */
  const CASOS = [
    {
      titulo: 'Ejemplo resuelto',
      descripcion: 'Ruta de A a H. Hay empates al fijar y dos rutas de longitud 8.',
      resultado: 'Distancia 8 · 2 rutas',
      ...EJEMPLO_CURSO,
    },
    {
      titulo: 'Red de reparto',
      descripcion: 'Un almacén (A) y un cliente (F). La arista directa A → F cuesta 14, pero existe un desvío más barato.',
      resultado: 'Distancia 11 · ruta única',
      origen: 0,
      destino: 5,
      matriz: [
        [0, 7, 9, 0, 0, 14],
        [0, 0, 10, 15, 0, 0],
        [0, 0, 0, 11, 0, 2],
        [0, 0, 0, 0, 6, 0],
        [0, 0, 0, 0, 0, 9],
        [0, 0, 0, 0, 0, 0],
      ],
    },
    {
      titulo: 'Varias rutas mínimas',
      descripcion: 'Pesos pequeños y repetidos que generan empates: tres caminos distintos llegan a F con el mismo costo.',
      resultado: 'Distancia 6 · 3 rutas',
      origen: 0,
      destino: 5,
      matriz: [
        [0, 2, 2, 0, 0, 0],
        [0, 0, 0, 2, 0, 0],
        [0, 0, 0, 2, 3, 0],
        [0, 0, 0, 0, 0, 2],
        [0, 0, 0, 0, 0, 1],
        [0, 0, 0, 0, 0, 0],
      ],
    },
    {
      titulo: 'Destino inalcanzable',
      descripcion: 'C tiene aristas de salida pero ninguna de entrada: desde A nunca se le puede asignar una etiqueta.',
      resultado: 'Distancia ∞ · sin camino',
      origen: 0,
      destino: 2,
      matriz: [
        [0, 4, 0, 7, 0],
        [0, 0, 0, 2, 0],
        [0, 0, 0, 1, 3],
        [0, 0, 0, 0, 5],
        [0, 0, 0, 0, 0],
      ],
    },
  ];

  /* ---------------------------------------------------------------
     9. API pública del módulo
     --------------------------------------------------------------- */
  return {
    N_MIN, N_MAX, PESO_MIN, PESO_MAX,
    nombre, nombres,
    crearVacia, clonar, redimensionar,
    generarAleatoria, buscarCiclo,
    validarCelda, contarAristas, pesoMaximo,
    desdeTexto, aTexto,
    CASOS,
  };
})();

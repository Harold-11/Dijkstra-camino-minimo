(() => {
  'use strict';

  /* ===================================================================
     1. REFERENCIAS AL DOM
     =================================================================== */
  const $ = (selector, contexto = document) => contexto.querySelector(selector);
  const $$ = (selector, contexto = document) => [...contexto.querySelectorAll(selector)];

  const dom = {
    // Configuración
    nValor: $('#n-valor'),
    nMenos: $('#n-menos'),
    nMas: $('#n-mas'),
    nRango: $('#n-rango'),
    nRangoTexto: $('#n-rango-texto'),
    tabs: $('.tabs'),
    tabAuto: $('#tab-auto'),
    tabManual: $('#tab-manual'),
    panelAuto: $('#panel-auto'),
    panelManual: $('#panel-manual'),
    densidad: $('#densidad'),
    densidadValor: $('#densidad-valor'),
    pesoMin: $('#peso-min'),
    pesoMax: $('#peso-max'),
    garantizar: $('#garantizar'),
    btnGenerar: $('#btn-generar'),
    btnVacia: $('#btn-vacia'),
    textoMatriz: $('#texto-matriz'),
    btnImportar: $('#btn-importar'),
    // Matriz
    cardMatriz: $('#card-matriz'),
    matrizVacia: $('#matriz-vacia'),
    matrizContenedor: $('#matriz-contenedor'),
    matrizGrid: $('#matriz-grid'),
    matrizInfo: $('#matriz-info'),
    matrizError: $('#matriz-error'),
    btnLimpiar: $('#btn-limpiar'),
    btnCopiar: $('#btn-copiar'),
    // Grafo
    cardGrafo: $('#card-grafo'),
    grafoSvg: $('#grafo-svg'),
    grafoVacio: $('#grafo-vacio'),
    selOrigen: $('#sel-origen'),
    selDestino: $('#sel-destino'),
    btnResolver: $('#btn-resolver'),
    btnReorganizar: $('#btn-reorganizar'),
    // Solución
    solVacia: $('#sol-vacia'),
    solContenido: $('#sol-contenido'),
    progresoTexto: $('#progreso-texto'),
    progresoContador: $('#progreso-contador'),
    progresoBarra: $('#progreso-barra'),
    btnInicio: $('#btn-inicio'),
    btnAnterior: $('#btn-anterior'),
    btnPlay: $('#btn-play'),
    btnSiguiente: $('#btn-siguiente'),
    btnFinal: $('#btn-final'),
    velocidad: $('#velocidad'),
    narracion: $('#narracion'),
    resultado: $('#resultado'),
    // Tabla
    tablaVacia: $('#tabla-vacia'),
    tablaScroll: $('#tabla-scroll'),
    tabla: $('#tabla-etiquetas'),
    // Otros
    toasts: $('#toasts'),
  };

  /* ===================================================================
     2. ESTADO GLOBAL DE LA APLICACIÓN
     =================================================================== */
  const estado = {
    n: 8,
    matriz: null,                 // number[][] | null
    nombres: Matriz.nombres(8),
    celdasInvalidas: new Set(),   // "i-j" de celdas con error
    origen: null,
    destino: null,
    resultado: null,              // salida de Dijkstra.resolver
    caminos: [],                  // todos los caminos mínimos al destino
    paso: 0,                      // paso actual del reproductor
    totalPasos: 0,                // iteraciones + 1 (paso de resultado)
    temporizador: null,           // reproducción automática
    ciclo: null,                  // ciclo encontrado en la matriz (o null)
    celdasCiclo: new Map(),       // "i-j" → ciclo que cerraría el peso escrito (no aceptado)
  };

  /* ===================================================================
     3. UTILIDADES
     =================================================================== */
  const N = (v) => estado.nombres[v];
  const DIGITOS_SUB = '₀₁₂₃₄₅₆₇₈₉';
  const subindice = (k) => String(k).replace(/\d/g, (d) => DIGITOS_SUB[d]);

  /** "A", "A y B", "A, B y C" */
  function enumerar(lista) {
    if (lista.length <= 1) return lista.join('');
    return `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`;
  }

  /** HTML de una etiqueta [d, P]k con estilo. */
  function etiquetaHTML(valor, pred, iter, clase = '') {
    const p = pred === null || pred === undefined ? '–' : N(pred);
    return `<span class="etq ${clase ? `etq--${clase}` : ''}">[${valor}, ${p}]${subindice(iter)}</span>`;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /**
   * Notificación flotante temporal.
   * El temporizador se pausa mientras el cursor está encima o la pestaña
   * está oculta: así nunca desaparece un aviso que el usuario no vio.
   */
  function toast(mensaje, tipo = 'info', duracion = 3200) {
    const trazo = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    const iconos = {
      info: trazo('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
      ok: trazo('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>'),
      error: trazo('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>'),
    };
    const el = document.createElement('div');
    el.className = `toast toast--${tipo}`;
    el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    el.innerHTML = `<span class="toast__icono" aria-hidden="true">${iconos[tipo] || ''}</span><span></span>`;
    el.lastElementChild.textContent = mensaje;
    dom.toasts.appendChild(el);

    let restante = duracion;
    let inicio = 0;
    let temporizador = null;
    const cerrar = () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      el.remove();
    };
    const reanudar = () => {
      if (temporizador || document.hidden) return;
      inicio = Date.now();
      temporizador = setTimeout(cerrar, restante);
    };
    const pausar = () => {
      if (!temporizador) return;
      clearTimeout(temporizador);
      temporizador = null;
      restante -= Date.now() - inicio;
    };
    function alCambiarVisibilidad() { document.hidden ? pausar() : reanudar(); }

    el.addEventListener('pointerenter', pausar);
    el.addEventListener('pointerleave', reanudar);
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    reanudar();
  }

  /** Actualiza el relleno de color de un <input type="range">. */
  function pintarRango(rango) {
    const pct = ((rango.value - rango.min) / (rango.max - rango.min)) * 100;
    rango.style.setProperty('--pct', `${pct}%`);
  }

  function irA(elemento) {
    elemento.scrollIntoView({ block: 'start' });
  }

  /* ===================================================================
     4. CONFIGURACIÓN: número de vértices y modo de construcción
     =================================================================== */

  /** Solo actualiza los controles visuales de n (no toca la matriz). */
  function mostrarN(n) {
    estado.n = n;
    estado.nombres = Matriz.nombres(n);
    dom.nValor.value = n;
    dom.nRango.value = n;
    pintarRango(dom.nRango);
    dom.nRangoTexto.textContent = `A – ${Matriz.nombre(n - 1)}`;
    dom.nMenos.disabled = n <= Matriz.N_MIN;
    dom.nMas.disabled = n >= Matriz.N_MAX;
  }

  /** Cambia n; si ya existe una matriz la redimensiona conservando valores. */
  function cambiarN(valor) {
    let n = parseInt(valor, 10);
    if (Number.isNaN(n)) n = estado.n;
    if (n < Matriz.N_MIN || n > Matriz.N_MAX) {
      toast(`n debe estar entre ${Matriz.N_MIN} y ${Matriz.N_MAX}.`, 'error');
      n = Math.max(Matriz.N_MIN, Math.min(Matriz.N_MAX, n));
    }
    if (n === estado.n && estado.matriz?.length === n) { mostrarN(n); return; }
    mostrarN(n);

    if (estado.matriz) {
      estado.matriz = Matriz.redimensionar(estado.matriz, n);
      limpiarErroresCeldas();
      if (estado.origen !== null && estado.origen >= n) estado.origen = null;
      if (estado.destino !== null && estado.destino >= n) estado.destino = null;
      invalidarSolucion();
      renderMatriz();
      dibujarGrafo({ reiniciar: true });
      actualizarSelects();
      actualizarTodo();
    }
  }

  dom.nMenos.addEventListener('click', () => cambiarN(estado.n - 1));
  dom.nMas.addEventListener('click', () => cambiarN(estado.n + 1));
  dom.nRango.addEventListener('input', () => cambiarN(dom.nRango.value));
  dom.nValor.addEventListener('change', () => cambiarN(dom.nValor.value));
  dom.nValor.addEventListener('keydown', (e) => { if (e.key === 'Enter') cambiarN(dom.nValor.value); });

  /* --- Pestañas: automática / manual --- */
  function activarPestana(modo) {
    const esAuto = modo === 'auto';
    dom.tabs.dataset.activa = modo;
    dom.tabAuto.setAttribute('aria-selected', esAuto);
    dom.tabManual.setAttribute('aria-selected', !esAuto);
    dom.tabAuto.tabIndex = esAuto ? 0 : -1;
    dom.tabManual.tabIndex = esAuto ? -1 : 0;
    dom.panelAuto.hidden = !esAuto;
    dom.panelManual.hidden = esAuto;
  }
  dom.tabAuto.addEventListener('click', () => activarPestana('auto'));
  dom.tabManual.addEventListener('click', () => activarPestana('manual'));
  dom.tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const siguiente = dom.tabs.dataset.activa === 'manual' ? 'auto' : 'manual';
    activarPestana(siguiente);
    (siguiente === 'auto' ? dom.tabAuto : dom.tabManual).focus();
  });

  /* --- Generación automática --- */
  dom.densidad.addEventListener('input', () => {
    dom.densidadValor.textContent = `${dom.densidad.value} %`;
    pintarRango(dom.densidad);
  });

  dom.btnGenerar.addEventListener('click', () => {
    const min = parseInt(dom.pesoMin.value, 10);
    const max = parseInt(dom.pesoMax.value, 10);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < Matriz.PESO_MIN || max > Matriz.PESO_MAX) {
      toast(`Los pesos deben ser enteros entre ${Matriz.PESO_MIN} y ${Matriz.PESO_MAX}.`, 'error');
      return;
    }
    if (min > max) {
      toast('El peso mínimo no puede ser mayor que el máximo.', 'error');
      return;
    }
    const m = Matriz.generarAleatoria(estado.n, {
      densidad: Number(dom.densidad.value) / 100,
      min, max,
      garantizarCamino: dom.garantizar.checked,
    });
    cargarMatriz(m);
    toast(`Matriz ${estado.n}×${estado.n} generada con ${Matriz.contarAristas(m)} aristas.`, 'ok');
  });

  /* --- Ingreso manual --- */
  dom.btnVacia.addEventListener('click', () => {
    cargarMatriz(Matriz.crearVacia(estado.n));
    toast('Matriz vacía creada. Escribe los pesos en la tabla.', 'info');
    const primera = $('.celda:not(:disabled)', dom.matrizGrid);
    if (primera) setTimeout(() => primera.focus({ preventScroll: true }), 350);
  });

  dom.btnImportar.addEventListener('click', () => {
    const r = Matriz.desdeTexto(dom.textoMatriz.value);
    if (r.error) { toast(r.error, 'error', 4500); return; }
    // Una matriz pegada con ciclo no se acepta (mismo criterio que al escribir)
    const ciclo = Matriz.buscarCiclo(r.matriz);
    if (ciclo) {
      const nombres = Matriz.nombres(r.matriz.length);
      toast(`La matriz pegada contiene el ciclo ${ciclo.map((v) => nombres[v]).join(' → ')}. ` +
        'Cambia alguno de esos pesos por 0 e impórtala de nuevo.', 'error', 6000);
      return;
    }
    mostrarN(r.matriz.length);
    cargarMatriz(r.matriz);
    toast(`Matriz ${r.matriz.length}×${r.matriz.length} importada correctamente.`, 'ok');
  });

  /* --- Ejemplo resuelto y casos para practicar --- */
  function cargarCaso(caso) {
    mostrarN(caso.matriz.length);
    cargarMatriz(Matriz.clonar(caso.matriz), { origen: caso.origen, destino: caso.destino });
    toast(`${caso.titulo} cargado (${N(caso.origen)} → ${N(caso.destino)}). Pulsa “Resolver con Dijkstra”.`, 'ok', 4200);
  }

  /** Punto único para establecer una matriz nueva. */
  function cargarMatriz(m, { origen = null, destino = null } = {}) {
    estado.matriz = m;
    limpiarErroresCeldas();
    estado.origen = origen;
    estado.destino = destino;
    invalidarSolucion();
    renderMatriz();
    dibujarGrafo({ reiniciar: true });
    actualizarSelects();
    actualizarTodo();

    // En pantallas angostas se lleva al usuario a la matriz
    if (window.innerWidth <= 1024) irA(dom.cardMatriz);
  }

  /* ===================================================================
     5. EDITOR DE LA MATRIZ
     =================================================================== */
  function renderMatriz() {
    const m = estado.matriz;
    dom.matrizVacia.hidden = !!m;
    dom.matrizContenedor.hidden = !m;
    dom.matrizError.hidden = true;
    if (!m) return;

    const n = m.length;
    const grid = dom.matrizGrid;
    grid.style.setProperty('--cols', n + 1);

    const frag = document.createDocumentFragment();
    const crearCab = (texto, clases) => {
      const div = document.createElement('div');
      div.className = `matriz__cab ${clases}`;
      div.innerHTML = texto;
      frag.appendChild(div);
      return div;
    };

    // Esquina y cabecera de columnas ("hacia")
    crearCab('de↓<br>a→', 'matriz__cab--esquina').setAttribute('aria-hidden', 'true');
    for (let j = 0; j < n; j++) crearCab(N(j), '').dataset.col = j;

    // Filas ("desde")
    for (let i = 0; i < n; i++) {
      crearCab(N(i), 'matriz__cab--fila').dataset.fila = i;
      for (let j = 0; j < n; j++) {
        const celda = document.createElement('input');
        celda.className = 'celda';
        celda.type = 'text';
        celda.inputMode = 'numeric';
        celda.autocomplete = 'off';
        celda.maxLength = 3;
        celda.dataset.i = i;
        celda.dataset.j = j;
        if (i === j) {
          celda.disabled = true;
          celda.placeholder = '—';
          celda.setAttribute('aria-label', `Diagonal ${N(i)}: sin lazo`);
        } else {
          celda.value = m[i][j] > 0 ? m[i][j] : '';
          celda.placeholder = '·';
          celda.setAttribute('aria-label', `Peso de ${N(i)} hacia ${N(j)}`);
        }
        frag.appendChild(celda);
      }
    }
    grid.replaceChildren(frag);
    pintarCalor();
    actualizarInfoMatriz();
  }

  /** Intensidad de color de cada celda según su peso (mapa de calor). */
  function pintarCalor() {
    const max = Matriz.pesoMaximo(estado.matriz);
    $$('.celda:not(:disabled)', dom.matrizGrid).forEach((c) => {
      const w = estado.matriz[c.dataset.i][c.dataset.j];
      c.style.setProperty('--w', (w / max).toFixed(3));
      c.classList.toggle('celda--vacia', !(w > 0));
    });
  }

  function actualizarInfoMatriz() {
    if (!estado.matriz) { dom.matrizInfo.hidden = true; return; }
    const n = estado.matriz.length;
    const k = Matriz.contarAristas(estado.matriz);
    dom.matrizInfo.hidden = false;
    dom.matrizInfo.textContent = `${n}×${n} · ${k} arista${k === 1 ? '' : 's'}`;
  }

  function mostrarErrorMatriz() {
    if (estado.celdasInvalidas.size === 0) { dom.matrizError.hidden = true; return; }
    const [primera] = estado.celdasInvalidas;
    const [i, j] = primera.split('-').map(Number);
    dom.matrizError.hidden = false;
    dom.matrizError.textContent =
      `Celda ${N(i)} → ${N(j)}: solo enteros de 0 a ${Matriz.PESO_MAX}. ` +
      (estado.celdasInvalidas.size > 1 ? `(${estado.celdasInvalidas.size} celdas con error)` : '');
  }

  // Tras editar: redibujar el grafo
  const alEditarMatriz = debounce(() => {
    dibujarGrafo();
    actualizarTodo();
  }, 180);

  /**
   * Devuelve el ciclo que se formaría al poner el peso `valor` en la celda
   * (i, j), o null si la arista i → j no cierra ningún ciclo.
   * No modifica la matriz: prueba el valor y lo restaura.
   */
  function cicloAlAgregar(i, j, valor) {
    const previo = estado.matriz[i][j];
    estado.matriz[i][j] = valor;
    const ciclo = Matriz.buscarCiclo(estado.matriz);
    estado.matriz[i][j] = previo;
    return ciclo;
  }

  /** Vuelve a probar las celdas rojas: si ya no cierran ciclo, se aceptan. */
  function revalidarCeldasCiclo() {
    for (const clave of [...estado.celdasCiclo.keys()]) {
      const [i, j] = clave.split('-').map(Number);
      const celda = $(`.celda[data-i="${i}"][data-j="${j}"]`, dom.matrizGrid);
      const r = Matriz.validarCelda(celda?.value);
      if (!celda || !r.ok) continue;
      const ciclo = r.valor > 0 ? cicloAlAgregar(i, j, r.valor) : null;
      if (ciclo) {
        estado.celdasCiclo.set(clave, ciclo);
      } else {
        estado.matriz[i][j] = r.valor;
        estado.celdasCiclo.delete(clave);
        celda.classList.remove('celda--ciclo');
      }
    }
  }

  /** Borra todas las marcas de error de las celdas (matriz nueva o vaciada). */
  function limpiarErroresCeldas() {
    estado.celdasInvalidas.clear();
    estado.celdasCiclo.clear();
  }

  // 5.1 Escritura en las celdas (delegación de eventos)
  dom.matrizGrid.addEventListener('input', (e) => {
    const celda = e.target;
    if (!celda.classList.contains('celda')) return;
    const i = Number(celda.dataset.i);
    const j = Number(celda.dataset.j);
    const clave = `${i}-${j}`;
    const r = Matriz.validarCelda(celda.value);

    // Se escribe con teclado: el estado cambia al instante
    if (!r.ok) {
      estado.celdasInvalidas.add(clave);
      celda.classList.add('celda--error');
    } else {
      estado.celdasInvalidas.delete(clave);
      celda.classList.remove('celda--error');
      // ¿El peso escrito crearía una arista que cierra un ciclo? Entonces
      // NO se acepta: la matriz conserva 0 en esa celda y la celda queda en rojo.
      const ciclo = r.valor > 0 ? cicloAlAgregar(i, j, r.valor) : null;
      if (ciclo) {
        estado.matriz[i][j] = 0;
        estado.celdasCiclo.set(clave, ciclo);
        celda.classList.add('celda--ciclo');
      } else {
        estado.celdasCiclo.delete(clave);
        celda.classList.remove('celda--ciclo');
        estado.matriz[i][j] = r.valor;
        // Si se borró una arista, alguna celda roja puede haber dejado de cerrar ciclo
        if (r.valor === 0) revalidarCeldasCiclo();
      }
      pintarCalor();
    }
    mostrarErrorMatriz();
    revisarCiclo();            // mensaje y botón en rojo al instante
    actualizarBotonResolver();
    actualizarInfoMatriz();
    invalidarSolucion();
    alEditarMatriz();
  });

  // 5.2 Resaltar la fila y columna de la celda con foco
  dom.matrizGrid.addEventListener('focusin', (e) => {
    const c = e.target;
    if (!c.classList.contains('celda')) return;
    $$('.matriz__cab.resaltada', dom.matrizGrid).forEach((h) => h.classList.remove('resaltada'));
    $(`[data-fila="${c.dataset.i}"]`, dom.matrizGrid)?.classList.add('resaltada');
    $(`[data-col="${c.dataset.j}"]`, dom.matrizGrid)?.classList.add('resaltada');
    c.select();
  });
  dom.matrizGrid.addEventListener('focusout', () => {
    $$('.matriz__cab.resaltada', dom.matrizGrid).forEach((h) => h.classList.remove('resaltada'));
  });

  // 5.3 Navegación con teclado (flechas y Enter)
  dom.matrizGrid.addEventListener('keydown', (e) => {
    const c = e.target;
    if (!c.classList.contains('celda')) return;
    const n = estado.matriz.length;
    let i = Number(c.dataset.i);
    let j = Number(c.dataset.j);
    const inicio = c.selectionStart === 0 && c.selectionEnd === 0;
    const fin = c.selectionStart === c.value.length;
    const todo = c.selectionStart === 0 && c.selectionEnd === c.value.length;

    const mover = () => {
      e.preventDefault();
      // saltar la diagonal deshabilitada
      if (i === j) j = e.key === 'ArrowLeft' ? j - 1 : j + 1;
      if (j >= n) { j = 0; i = (i + 1) % n; if (i === j) j++; }
      if (j < 0) { j = n - 1; i = (i - 1 + n) % n; if (i === j) j--; }
      $(`.celda[data-i="${i}"][data-j="${j}"]`, dom.matrizGrid)?.focus();
    };

    switch (e.key) {
      case 'ArrowUp': i = (i - 1 + n) % n; mover(); break;
      case 'ArrowDown': i = (i + 1) % n; mover(); break;
      case 'ArrowLeft': if (inicio || todo) { j--; mover(); } break;
      case 'ArrowRight': if (fin || todo) { j++; mover(); } break;
      case 'Enter': j++; mover(); break;
      default: break;
    }
  });

  // 5.4 Acciones de la matriz
  dom.btnLimpiar.addEventListener('click', () => {
    if (!estado.matriz) return;
    estado.matriz = Matriz.crearVacia(estado.matriz.length);
    limpiarErroresCeldas();
    invalidarSolucion();
    renderMatriz(true);
    dibujarGrafo();
    actualizarTodo();
    toast('Matriz vaciada.', 'info');
  });

  dom.btnCopiar.addEventListener('click', async () => {
    if (!estado.matriz) return;
    try {
      await navigator.clipboard.writeText(Matriz.aTexto(estado.matriz));
      toast('Matriz copiada. Puedes pegarla en Excel o en el informe.', 'ok');
    } catch (e) {
      dom.textoMatriz.value = Matriz.aTexto(estado.matriz);
      activarPestana('manual');
      $('.pegar').open = true;
      toast('No se pudo usar el portapapeles: la matriz quedó en el cuadro de texto.', 'info', 4500);
    }
  });

  /* ===================================================================
     6. GRAFO Y SELECCIÓN DE ORIGEN / DESTINO
     =================================================================== */
  function dibujarGrafo({ reiniciar = false } = {}) {
    const hay = !!estado.matriz;
    dom.grafoVacio.hidden = hay;
    dom.grafoSvg.style.visibility = hay ? 'visible' : 'hidden';
    dom.btnReorganizar.disabled = !hay;
    if (!hay) return;
    Grafo.dibujar(estado.matriz, estado.nombres, { reiniciarPosiciones: reiniciar });
    Grafo.marcarExtremos(estado.origen, estado.destino);
  }

  function actualizarSelects() {
    const hay = !!estado.matriz;
    [dom.selOrigen, dom.selDestino].forEach((sel) => {
      sel.disabled = !hay;
      sel.replaceChildren(new Option('—', ''));
      if (hay) estado.nombres.forEach((nombre, v) => sel.add(new Option(nombre, v)));
    });
    dom.selOrigen.value = estado.origen ?? '';
    dom.selDestino.value = estado.destino ?? '';
  }

  function alCambiarExtremos() {
    dom.selOrigen.value = estado.origen ?? '';
    dom.selDestino.value = estado.destino ?? '';
    invalidarSolucion();
    Grafo.marcarExtremos(estado.origen, estado.destino);
    actualizarTodo();
  }

  dom.selOrigen.addEventListener('change', () => {
    estado.origen = dom.selOrigen.value === '' ? null : Number(dom.selOrigen.value);
    if (estado.origen !== null && estado.origen === estado.destino) {
      estado.destino = null;
      toast('El origen y el destino deben ser distintos.', 'error');
    }
    alCambiarExtremos();
  });

  dom.selDestino.addEventListener('change', () => {
    estado.destino = dom.selDestino.value === '' ? null : Number(dom.selDestino.value);
    if (estado.destino !== null && estado.destino === estado.origen) {
      estado.destino = null;
      toast('El origen y el destino deben ser distintos.', 'error');
    }
    alCambiarExtremos();
  });

  /** Clic en un vértice: primero origen, luego destino. */
  function alSeleccionarVertice(v) {
    if (estado.origen === null || estado.destino !== null) {
      estado.origen = v;
      estado.destino = null;
      toast(`Origen: ${N(v)}. Ahora toca el vértice destino.`, 'info', 2200);
    } else if (v === estado.origen) {
      estado.origen = null;
    } else {
      estado.destino = v;
      toast(`Destino: ${N(v)}. ¡Listo para resolver!`, 'ok', 2200);
    }
    alCambiarExtremos();
  }

  dom.btnReorganizar.addEventListener('click', () => Grafo.reorganizar());

  function actualizarBotonResolver() {
    const listo = !!estado.matriz &&
      estado.origen !== null && estado.destino !== null &&
      estado.origen !== estado.destino &&
      estado.celdasInvalidas.size === 0 &&
      estado.celdasCiclo.size === 0 &&
      !estado.ciclo;
    dom.btnResolver.disabled = !listo;

    // Botón en rojo mientras haya un peso que genera ciclo
    const hayCiclo = estado.celdasCiclo.size > 0 || !!estado.ciclo;
    dom.btnResolver.classList.toggle('btn--peligro', hayCiclo);
    $('.btn__texto', dom.btnResolver).textContent = hayCiclo
      ? 'Ingresa otro número: genera un ciclo'
      : 'Resolver con Dijkstra';
  }

  /* ===================================================================
     7. RESOLUCIÓN Y REPRODUCTOR PASO A PASO
     =================================================================== */
  dom.btnResolver.addEventListener('click', resolver);

  function resolver() {
    if (dom.btnResolver.disabled) return;
    detener();
    const res = Dijkstra.resolver(estado.matriz, estado.origen);
    estado.resultado = res;
    estado.caminos = Dijkstra.caminos(res, estado.destino);
    estado.totalPasos = res.iteraciones.length + 1; // + paso final "Resultado"

    dom.solVacia.hidden = true;
    dom.solContenido.hidden = false;
    dom.tablaVacia.hidden = true;
    dom.tablaScroll.hidden = false;

    irAPaso(0);
    actualizarTodo();
    irA(dom.cardGrafo);
  }

  /** Borra la solución (se llama cuando cambian los datos). */
  function invalidarSolucion() {
    if (!estado.resultado) return;
    detener();
    estado.resultado = null;
    estado.caminos = [];
    dom.solVacia.hidden = false;
    dom.solContenido.hidden = true;
    dom.tablaVacia.hidden = false;
    dom.tablaScroll.hidden = true;
    Grafo.limpiarPaso();
  }

  /** Muestra el paso p del desarrollo (0 = iteración 0, último = resultado). */
  function irAPaso(p) {
    estado.paso = Math.max(0, Math.min(estado.totalPasos - 1, p));
    renderPaso();
  }

  /* --- Reproducción automática --- */
  function reproducir() {
    if (!estado.resultado) return;
    if (estado.paso >= estado.totalPasos - 1) irAPaso(0);
    detener();
    dom.btnPlay.classList.add('reproduciendo');
    dom.btnPlay.setAttribute('aria-label', 'Pausar');
    estado.temporizador = setInterval(() => {
      if (estado.paso >= estado.totalPasos - 1) { detener(); return; }
      irAPaso(estado.paso + 1);
      if (estado.paso >= estado.totalPasos - 1) detener();
    }, Number(dom.velocidad.value));
  }

  function detener() {
    clearInterval(estado.temporizador);
    estado.temporizador = null;
    dom.btnPlay.classList.remove('reproduciendo');
    dom.btnPlay.setAttribute('aria-label', 'Reproducir');
  }

  const alternarReproduccion = () => (estado.temporizador ? detener() : reproducir());

  dom.btnPlay.addEventListener('click', alternarReproduccion);
  dom.btnInicio.addEventListener('click', () => { detener(); irAPaso(0); });
  dom.btnAnterior.addEventListener('click', () => { detener(); irAPaso(estado.paso - 1); });
  dom.btnSiguiente.addEventListener('click', () => { detener(); irAPaso(estado.paso + 1); });
  dom.btnFinal.addEventListener('click', () => { detener(); irAPaso(estado.totalPasos - 1); });
  dom.velocidad.addEventListener('change', () => { if (estado.temporizador) reproducir(); });

  // Atajos de teclado: ← → Espacio Inicio Fin
  document.addEventListener('keydown', (e) => {
    if (!estado.resultado) return;
    const objetivo = e.target instanceof Element ? e.target : document.body;
    if (objetivo.closest('input, select, textarea, [contenteditable], .nodo')) return;
    const acciones = {
      ArrowRight: () => { detener(); irAPaso(estado.paso + 1); },
      ArrowLeft: () => { detener(); irAPaso(estado.paso - 1); },
      ' ': alternarReproduccion,
      Home: () => { detener(); irAPaso(0); },
      End: () => { detener(); irAPaso(estado.totalPasos - 1); },
    };
    if (e.key === ' ' && objetivo.closest('button, a, summary')) return; // Espacio ya activa el botón
    if (acciones[e.key]) {
      e.preventDefault();
      acciones[e.key]();
    }
  });

  /* --- Dibujo de un paso (grafo + narración + tabla + resultado) --- */
  function renderPaso() {
    const res = estado.resultado;
    if (!res) return;
    const ultimoIter = res.iteraciones.length - 1;
    const esResultado = estado.paso === estado.totalPasos - 1;
    const k = Math.min(estado.paso, ultimoIter);
    const it = res.iteraciones[k];
    const est = Dijkstra.estadoEn(res, k);

    // 7.1 Datos visuales comunes
    const badges = est.map((e) =>
      e.vigentes.length ? `[${e.dist}, ${e.preds.length ? e.preds.map(N).join('/') : '–'}]` : '');
    const fijos = new Set(est.map((e, v) => (e.fijo ? v : -1)).filter((v) => v >= 0));
    const etiquetados = new Set(est.map((e, v) => (e.vigentes.length ? v : -1)).filter((v) => v >= 0));
    const arbol = est.flatMap((e, v) => e.preds.map((p) => [p, v]));

    // 7.2 Grafo
    if (!esResultado) {
      Grafo.mostrarPaso({
        fijos, etiquetados, badges, arbol,
        actual: it.expandido,
        evaluadas: it.evaluaciones.map((ev) => ({ i: it.expandido, j: ev.v, resultado: ev.resultado })),
      });
    } else {
      const aristasCamino = new Map();
      estado.caminos.forEach((c) => c.slice(1).forEach((v, idx) => aristasCamino.set(`${c[idx]}-${v}`, [c[idx], v])));
      Grafo.mostrarPaso({
        fijos, etiquetados, badges,
        camino: [...aristasCamino.values()],
        enCamino: new Set(estado.caminos.flat()),
        inalcanzables: new Set(est.map((e, v) => (e.vigentes.length ? -1 : v)).filter((v) => v >= 0)),
      });
    }

    // 7.3 Progreso y botones
    dom.progresoTexto.textContent = esResultado ? 'Resultado final' : `Iteración ${k}`;
    dom.progresoContador.textContent = `${estado.paso + 1} / ${estado.totalPasos}`;
    dom.progresoBarra.style.transform = `scaleX(${(estado.paso + 1) / estado.totalPasos})`;
    dom.btnInicio.disabled = dom.btnAnterior.disabled = estado.paso === 0;
    dom.btnSiguiente.disabled = dom.btnFinal.disabled = esResultado;

    // 7.4 Narración, tabla y tarjeta de resultado
    dom.narracion.innerHTML = esResultado ? narrarResultado() : narrarIteracion(it, est);
    renderTabla(k, esResultado);
    if (esResultado) mostrarResultado(); else dom.resultado.hidden = true;
  }

  /* --- Explicación de una iteración (lenguaje del método de etiquetas) --- */
  function narrarIteracion(it, est) {
    const res = estado.resultado;
    const k = it.numero;

    if (k === 0) {
      return `
        <p class="narracion__titulo">Iteración 0 · Vértice origen</p>
        <p>Se etiqueta el vértice origen <span class="v">${N(res.origen)}</span> con ${etiquetaHTML(0, null, 0, 'fija')}
           y queda <strong>fijado</strong>: la distancia de ${N(res.origen)} a sí mismo es 0.</p>
        <p class="elige">En la siguiente iteración se etiquetarán los vértices adyacentes a
           <span class="v">${N(res.origen)}</span> (fila ${N(res.origen)} de la matriz).</p>`;
    }

    const u = it.expandido;
    let html = `<p class="narracion__titulo">Iteración ${k} · Adyacentes a ${N(u)}</p>`;

    if (it.evaluaciones.length === 0) {
      html += `<p><span class="v">${N(u)}</span> (acumulado ${it.base}) no tiene aristas salientes:
               su fila en la matriz está vacía, así que no se etiqueta ningún vértice.</p>`;
    } else {
      const adyacentes = enumerar(it.evaluaciones.map((e) => N(e.v)));
      html += `<p>Desde <span class="v">${N(u)}</span>, con acumulado <strong>${it.base}</strong>,
               se etiquetan sus vértices adyacentes: ${adyacentes}.</p><ul>`;

      it.evaluaciones.forEach((e, idx) => {
        const calculo = `<span class="calc">${it.base} + ${e.peso} = ${e.propuesta}</span>`;
        const anteriores = e.anteriores.map((a) => etiquetaHTML(a.valor, a.pred, a.iter, 'tachada')).join(' ');
        const vigentesPrevias = e.anteriores.map((a) => etiquetaHTML(a.valor, a.pred, a.iter)).join(' ');
        let texto;
        switch (e.resultado) {
          case 'nueva':
            texto = `${calculo} → nueva etiqueta ${etiquetaHTML(e.propuesta, u, k, 'nueva')}`;
            break;
          case 'mejora':
            texto = `${calculo} &lt; ${e.previa} → ${etiquetaHTML(e.propuesta, u, k, 'nueva')} y se tacha ${anteriores}`;
            break;
          case 'empate':
            texto = `${calculo} = ${e.previa} → empate: se conservan ${vigentesPrevias} y
                     ${etiquetaHTML(e.propuesta, u, k, 'nueva')} (hay más de un camino mínimo hasta ${N(e.v)})`;
            break;
          default: // descarta
            texto = `${calculo} &gt; ${e.previa} → ${etiquetaHTML(e.propuesta, u, k, 'tachada')} se tacha
                     ${e.yaFijado ? `(${N(e.v)} ya estaba fijado)` : '(no mejora el acumulado)'}`;
        }
        html += `<li class="li--${e.resultado}"><span class="v">${N(e.v)}:</span> ${texto}</li>`;
      });
      html += '</ul>';
    }

    // Elección del siguiente vértice a fijar
    if (it.elegido !== null) {
      const etiquetasElegido = est[it.elegido].vigentes.map((e) => etiquetaHTML(e.valor, e.pred, e.iter, 'fija')).join(' ');
      html += `<p class="elige">Se fija el vértice no fijado con menor acumulado:
               <span class="v">${N(it.elegido)}</span> ${etiquetasElegido}.`;
      if (it.empates.length) {
        html += ` Empate con ${enumerar(it.empates.map(N))}: también pudo elegirse (se toma el primero en orden alfabético).`;
      }
      if (it.elegido === estado.destino) {
        html += ` <strong>¡El destino ${N(estado.destino)} queda fijado!</strong> Su distancia mínima ya no cambiará.`;
      }
      html += '</p>';
    } else {
      html += `<p class="elige">No quedan vértices etiquetados sin fijar: <strong>el algoritmo termina</strong>.</p>`;
    }
    return html;
  }

  /** Busca la etiqueta vigente de v cuyo predecesor es p (para reconstruir la ruta). */
  function etiquetaDe(v, p) {
    const lista = estado.resultado.etiquetas[v];
    return lista.find((e) => e.pred === p && e.tachada === null) || lista.find((e) => e.pred === p);
  }

  /* --- Explicación del resultado: reconstrucción de la ruta --- */
  function narrarResultado() {
    const res = estado.resultado;
    const o = res.origen;
    const d = estado.destino;
    let html = `<p class="narracion__titulo">Resultado · Reconstrucción de la ruta</p>`;

    if (!estado.caminos.length) {
      return html + `
        <p>El destino <span class="v">${N(d)}</span> nunca recibió una etiqueta:
           <strong>no existe un camino dirigido</strong> de ${N(o)} a ${N(d)}.</p>
        <p class="elige">Revisa la matriz: ninguna secuencia de aristas (respetando su sentido) conecta ambos vértices.
        ${d < o ? `Como el grafo no tiene ciclos y sus aristas avanzan hacia vértices posteriores, conviene elegir un destino posterior a ${N(o)}.` : ''}</p>`;
    }

    html += `<p>Se retrocede desde el destino siguiendo el predecesor de cada etiqueta vigente:</p><ul>`;
    estado.caminos.slice(0, 4).forEach((camino, idx) => {
      const pasos = [];
      for (let t = camino.length - 1; t > 0; t--) {
        const v = camino[t];
        const p = camino[t - 1];
        const e = etiquetaDe(v, p);
        pasos.push(`En <span class="v">${N(v)}</span>: ${etiquetaHTML(e.valor, p, e.iter, 'camino')}`);
      }
      pasos.push(`<span class="v">${N(o)}</span> (origen)`);
      html += `<li class="li--mejora">${pasos.join(' → ')}</li>`;
    });
    html += '</ul>';

    const plural = estado.caminos.length > 1;
    html += `<p class="elige">${plural ? `Existen <strong>${estado.caminos.length} rutas</strong>` : 'La ruta es'}
             de longitud mínima <strong>${res.distancias[d]}</strong>:
             ${estado.caminos.map((c) => `<strong>${c.map(N).join(' → ')}</strong>`).join(' y ')}.
             ${plural ? `${estado.caminos.length === 2 ? 'Ambas' : 'Todas'} cuestan lo mismo, así que <strong>cualquiera de ellas es una respuesta correcta</strong>.` : ''}</p>`;
    return html;
  }

  /* ===================================================================
     8. TABLA DE ETIQUETAS (una columna por iteración)
     =================================================================== */
  function renderTabla(k, esResultado) {
    const res = estado.resultado;
    const n = res.n;
    const enCamino = new Set(esResultado ? estado.caminos.flat() : []);

    // Encabezado
    let thead = '<thead><tr><th scope="col">Vértice</th>';
    for (let c = 0; c <= k; c++) {
      const it = res.iteraciones[c];
      const clases = c === k && !esResultado ? 'col--actual' : '';
      const sub = c === 0 ? 'origen' : `adyacentes a ${N(it.expandido)}`;
      thead += `<th scope="col" class="${clases}">Iteración ${c}<small>${sub}</small></th>`;
    }
    if (esResultado) thead += '<th scope="col" class="col--resultado">Distancia mínima<small>[acumulado, proviene]</small></th>';
    thead += '</tr></thead>';

    // Cuerpo
    let tbody = '<tbody>';
    for (let v = 0; v < n; v++) {
      const clasesFila = [
        v === res.origen ? 'fila--origen' : '',
        v === estado.destino ? 'fila--destino' : '',
        enCamino.has(v) ? 'fila--camino' : '',
      ].join(' ');
      tbody += `<tr class="${clasesFila}"><th scope="row">${N(v)}</th>`;

      for (let c = 0; c <= k; c++) {
        const etiquetas = res.etiquetas[v].filter((e) => e.iter === c);
        const clases = c === k && !esResultado ? 'col--actual' : '';
        const contenido = etiquetas.map((e) => {
          const tachada = e.tachada !== null && e.tachada <= k;
          const fija = e.fija !== null && e.fija <= k;
          const cl = ['etq',
            tachada ? 'etq--tachada' : '',
            fija ? 'etq--fija' : '',
          ].join(' ');
          return `<span class="${cl}">${e.valor}, ${e.pred === null ? '–' : N(e.pred)}</span>`;
        }).join('');
        tbody += `<td class="${clases}">${contenido ? `<div class="celda-etq">${contenido}</div>` : ''}</td>`;
      }

      if (esResultado) {
        const d = res.distancias[v];
        const preds = res.predecesores[v];
        const texto = Number.isFinite(d)
          ? `[${d}, ${preds.length ? preds.map(N).join('/') : '–'}]`
          : '<span class="inf">∞ (sin camino)</span>';
        tbody += `<td class="col--resultado">${texto}</td>`;
      }
      tbody += '</tr>';
    }
    tbody += '</tbody>';

    const caption = dom.tabla.querySelector('caption').outerHTML;
    dom.tabla.innerHTML = caption + thead + tbody;

    // Desplazar para que la última columna quede a la vista
    const sc = dom.tablaScroll;
    if (sc.scrollWidth > sc.clientWidth) {
      sc.scrollTo({ left: sc.scrollWidth });
    }
  }

  /* ===================================================================
     9. TARJETA DEL RESULTADO FINAL
     =================================================================== */
  function mostrarResultado() {
    const res = estado.resultado;
    const d = estado.destino;
    const o = res.origen;
    const flecha = '<svg class="ruta__f" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

    const distancias = res.distancias.map((dist, v) =>
      `<span class="distancias__item ${v === d ? 'distancias__item--destino' : ''}">${N(v)}: ${Number.isFinite(dist) ? dist : '∞'}</span>`
    ).join('');

    if (!estado.caminos.length) {
      dom.resultado.className = 'resultado resultado--sin-camino';
      dom.resultado.innerHTML = `
        <div class="resultado__fila">
          <div class="resultado__costo"><span class="resultado__etq">Costo total</span><span class="resultado__numero">∞</span></div>
          <div class="resultado__rutas"><span class="resultado__etq">Sin camino</span>
            <p>No existe un camino dirigido de <strong>${N(o)}</strong> a <strong>${N(d)}</strong>.</p></div>
        </div>
        <p class="resultado__nota">Distancias mínimas desde ${N(o)}:</p>
        <div class="distancias">${distancias}</div>`;
      dom.resultado.hidden = false;
      return;
    }

    const costo = res.distancias[d];
    const rutas = estado.caminos.map((camino) =>
      `<div class="ruta" aria-label="${camino.map(N).join(' → ')}">` +
      camino.map((v, idx) =>
        (idx ? flecha : '') + `<span class="ruta__v">${N(v)}</span>`
      ).join('') + '</div>'
    ).join('');
    const total = estado.caminos.length;

    dom.resultado.className = 'resultado';
    dom.resultado.innerHTML = `
      <div class="resultado__fila">
        <div class="resultado__costo">
          <span class="resultado__etq">Costo total mínimo</span>
          <span class="resultado__numero">${costo}</span>
        </div>
        <div class="resultado__rutas">
          <span class="resultado__etq">${total > 1 ? `${total} caminos mínimos` : 'Camino mínimo'} de ${N(o)} a ${N(d)}</span>
          ${rutas}
          ${total > 1 ? `<p class="resultado__eleccion">Las ${total} rutas cuestan ${costo}: se puede elegir cualquiera, ${total === 2 ? 'ambas son' : 'todas son'} una respuesta correcta.</p>` : ''}
        </div>
      </div>
      <p class="resultado__nota">Distancias mínimas desde ${N(o)} hacia cada vértice:</p>
      <div class="distancias">${distancias}</div>`;
    dom.resultado.hidden = false;
  }


  /* ===================================================================
     10. CICLOS Y ACTUALIZACIÓN GENERAL
     =================================================================== */
  /**
   * El objetivo del proyecto se limita a grafos dirigidos SIN CICLOS.
   * La generación aleatoria nunca crea ciclos; si el usuario escribe o pega
   * una matriz con un ciclo, se muestra cuál es y no se permite resolver.
   */
  function revisarCiclo() {
    const aviso = $('#matriz-ciclo');
    estado.ciclo = estado.matriz ? Matriz.buscarCiclo(estado.matriz) : null;

    // Caso normal: el usuario escribió un peso que cerraría un ciclo
    if (estado.celdasCiclo.size) {
      const [clave, ciclo] = estado.celdasCiclo.entries().next().value;
      const [i, j] = clave.split('-').map(Number);
      aviso.hidden = false;
      aviso.textContent = `Ingresa otro número en la celda ${N(i)} → ${N(j)}: esa arista cerraría el ciclo ` +
        `${ciclo.map(N).join(' → ')}. Déjala vacía (0) o borra otra arista del ciclo.`;
      return;
    }
    // Respaldo: una matriz que ya contiene un ciclo (no debería ocurrir)
    aviso.hidden = !estado.ciclo;
    if (estado.ciclo) {
      aviso.textContent = `La matriz contiene el ciclo ${estado.ciclo.map(N).join(' → ')}. ` +
        'El proyecto trabaja con grafos dirigidos sin ciclos: elimina alguna de esas aristas para poder resolver.';
    }
  }

  /** Refresca todo lo que depende del estado general. */
  function actualizarTodo() {
    revisarCiclo();
    actualizarInfoMatriz();
    actualizarBotonResolver();
  }

  /* ===================================================================
     11. CASOS PARA PRACTICAR
     Cada tarjeta muestra una vista previa del grafo con su ruta mínima
     resaltada y un botón para cargarlo en la calculadora.
     =================================================================== */
  /** Vista previa SVG (columnas de izquierda a derecha, como el grafo principal) con la ruta mínima resaltada. */
  function vistaPrevia(caso, idx) {
    // Cada vista previa usa ids propios para sus flechas (los ids no pueden repetirse en la página)
    const id = `vp-flecha-${idx}`;
    const n = caso.matriz.length;
    const nombres = Matriz.nombres(n);
    const pos = Grafo.distribucionPorColumnas(n, { ancho: 320, alto: 240, margenX: 24, margenY: 40, ajusteY: 0 });
    const res = Dijkstra.resolver(caso.matriz, caso.origen);
    const enRuta = new Set();
    Dijkstra.caminos(res, caso.destino).forEach((c) => c.slice(1).forEach((v, k) => enRuta.add(`${c[k]}-${v}`)));

    let aristas = '';
    let pesos = '';
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const w = caso.matriz[i][j];
        if (!(w > 0)) continue;
        const p = pos[i];
        const q = pos[j];
        const largo = Math.hypot(q.x - p.x, q.y - p.y);
        const ux = (q.x - p.x) / largo;
        const uy = (q.y - p.y) / largo;
        // Desplazamiento lateral si existe la arista contraria
        const off = caso.matriz[j][i] > 0 ? 5 : 0;
        const x1 = p.x + ux * 15 - uy * off;
        const y1 = p.y + uy * 15 + ux * off;
        const x2 = q.x - ux * 18 - uy * off;
        const y2 = q.y - uy * 18 + ux * off;
        const ruta = enRuta.has(`${i}-${j}`);
        aristas += `<line class="${ruta ? 'vp-ruta' : 'vp-arista'}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#${id}${ruta ? '-ruta' : ''})"/>`;
        pesos += `<text class="vp-peso${ruta ? ' vp-peso--ruta' : ''}" x="${(x1 + x2) / 2 - uy * 9}" y="${(y1 + y2) / 2 + ux * 9}">${w}</text>`;
      }
    }
    const nodos = pos.map((p, v) => {
      const clase = v === caso.origen ? 'vp-nodo vp-nodo--origen'
        : v === caso.destino ? 'vp-nodo vp-nodo--destino'
          : [...enRuta].some((e) => e.endsWith(`-${v}`)) ? 'vp-nodo vp-nodo--ruta' : 'vp-nodo';
      return `<g class="${clase}"><circle cx="${p.x}" cy="${p.y}" r="14"/><text x="${p.x}" y="${p.y}">${nombres[v]}</text></g>`;
    }).join('');

    return `<svg viewBox="0 0 320 240" role="img" aria-label="Vista previa del grafo ${caso.titulo}">
      <defs>
        <marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,1 L9,5 L0,9 z" class="vp-punta"/></marker>
        <marker id="${id}-ruta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,1 L9,5 L0,9 z" class="vp-punta vp-punta--ruta"/></marker>
      </defs>
      ${aristas}${pesos}${nodos}</svg>`;
  }

  function renderCasos() {
    const lista = $('#casos-lista');
    lista.innerHTML = Matriz.CASOS.map((caso, idx) => `
      <article class="bloque caso">
        <div class="caso__vista">${vistaPrevia(caso, idx)}</div>
        <p class="caso__resultado">${caso.resultado}</p>
        <h3>${caso.titulo}</h3>
        <p>${caso.descripcion}</p>
        <p class="caso__meta">${caso.matriz.length} vértices · origen ${Matriz.nombre(caso.origen)} · destino ${Matriz.nombre(caso.destino)}</p>
        <button class="btn btn--primario" type="button" data-caso="${idx}">Cargar en la calculadora</button>
      </article>`).join('');

    lista.addEventListener('click', (e) => {
      const boton = e.target.closest('[data-caso]');
      if (!boton) return;
      cargarCaso(Matriz.CASOS[Number(boton.dataset.caso)]);
      irA($('#programa'));
    });
  }

  /* ===================================================================
     12. INICIO
     =================================================================== */
  Grafo.init(dom.grafoSvg, { onSeleccionar: alSeleccionarVertice });
  activarPestana('auto');
  mostrarN(estado.n);
  pintarRango(dom.densidad);
  dibujarGrafo();
  actualizarTodo();
  renderCasos();
})();

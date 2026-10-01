const Dijkstra = (() => {
  'use strict';

  /* ---------------------------------------------------------------
     1. Ejecución completa del algoritmo
     --------------------------------------------------------------- */

  /**
   * @param {number[][]} matriz matriz ponderada dirigida (0 = sin arista)
   * @param {number} origen     índice del vértice origen
   * @returns {object} resultado con etiquetas, iteraciones y distancias
   *
   * Cada etiqueta guarda su "vida" para poder reconstruir la tabla en
   * cualquier iteración:
   *   { valor, pred, iter, tachada: iteración en que se tachó | null,
   *                        fija:    iteración en que se fijó  | null }
   */
  function resolver(matriz, origen) {
    const n = matriz.length;
    const etiquetas = Array.from({ length: n }, () => []);
    const fijadoEn = Array(n).fill(null);   // iteración en la que se fijó cada vértice
    const iteraciones = [];

    // Etiquetas vigentes (no tachadas) de un vértice
    const vigentes = (v) => etiquetas[v].filter((e) => e.tachada === null);
    // Distancia acumulada actual de un vértice (∞ si no tiene etiqueta)
    const distancia = (v) => {
      const lista = vigentes(v);
      return lista.length ? lista[0].valor : Infinity;
    };

    /* --- Iteración 0: etiquetado y fijación del origen --- */
    etiquetas[origen].push({ valor: 0, pred: null, iter: 0, tachada: null, fija: 0 });
    fijadoEn[origen] = 0;
    iteraciones.push({ numero: 0, expandido: null, base: 0, evaluaciones: [], elegido: origen, empates: [] });

    /* --- Iteraciones 1, 2, ...: etiquetar adyacentes y fijar el menor --- */
    let actual = origen;
    let k = 0;

    while (actual !== null) {
      k++;
      const base = distancia(actual);
      const evaluaciones = [];

      // a) Etiquetar los vértices adyacentes al vértice actual (fila "actual")
      for (let v = 0; v < n; v++) {
        const peso = matriz[actual][v];
        if (v === actual || !(peso > 0)) continue;

        const previa = distancia(v);
        const anteriores = vigentes(v).map((e) => ({ valor: e.valor, pred: e.pred, iter: e.iter }));
        const propuesta = base + peso;
        const nueva = { valor: propuesta, pred: actual, iter: k, tachada: null, fija: null };
        let resultado;

        if (propuesta < previa) {
          // b) Mejora: se tachan las etiquetas anteriores
          vigentes(v).forEach((e) => { e.tachada = k; });
          resultado = previa === Infinity ? 'nueva' : 'mejora';
        } else if (propuesta === previa) {
          // b) Empate: se conservan ambas etiquetas
          resultado = 'empate';
        } else {
          // b) No mejora: la nueva etiqueta se escribe y se tacha
          nueva.tachada = k;
          resultado = 'descarta';
        }

        etiquetas[v].push(nueva);
        evaluaciones.push({
          v, peso, base, propuesta, previa, anteriores, resultado,
          yaFijado: fijadoEn[v] !== null,
        });
      }

      // c) Elegir el vértice NO fijado con menor acumulado
      let menor = Infinity;
      let candidatos = [];
      for (let v = 0; v < n; v++) {
        if (fijadoEn[v] !== null) continue;
        const d = distancia(v);
        if (d < menor) { menor = d; candidatos = [v]; }
        else if (d === menor && d !== Infinity) candidatos.push(v);
      }

      const elegido = candidatos.length ? candidatos[0] : null; // empate → orden alfabético
      if (elegido !== null) {
        fijadoEn[elegido] = k;
        vigentes(elegido).forEach((e) => { e.fija = k; });
      }

      iteraciones.push({ numero: k, expandido: actual, base, evaluaciones, elegido, empates: candidatos.slice(1) });
      actual = elegido;
    }

    /* --- Resultados finales --- */
    const distancias = Array.from({ length: n }, (_, v) => distancia(v));
    const predecesores = Array.from({ length: n }, (_, v) =>
      vigentes(v).map((e) => e.pred).filter((p) => p !== null)
    );

    return { n, origen, etiquetas, fijadoEn, iteraciones, distancias, predecesores };
  }

  /* ---------------------------------------------------------------
     2. Estado de la tabla en una iteración k
        (para la animación paso a paso)
     --------------------------------------------------------------- */

  /**
   * @returns {Array<{visibles, vigentes, dist, fijo, preds}>} un objeto por vértice
   */
  function estadoEn(res, k) {
    return res.etiquetas.map((lista, v) => {
      const visibles = lista.filter((e) => e.iter <= k);
      const vigentes = visibles.filter((e) => e.tachada === null || e.tachada > k);
      return {
        visibles,
        vigentes,
        dist: vigentes.length ? vigentes[0].valor : Infinity,
        fijo: res.fijadoEn[v] !== null && res.fijadoEn[v] <= k,
        preds: vigentes.map((e) => e.pred).filter((p) => p !== null),
      };
    });
  }

  /* ---------------------------------------------------------------
     3. Reconstrucción de TODOS los caminos mínimos
        Se retrocede desde el destino siguiendo los predecesores de las
        etiquetas vigentes ("En H: 8, F → vamos a F...").
     --------------------------------------------------------------- */

  function caminos(res, destino, limite = 24) {
    if (!Number.isFinite(res.distancias[destino])) return [];
    const encontrados = [];

    const retroceder = (v, sufijo) => {
      if (encontrados.length >= limite) return;
      if (v === res.origen) {
        encontrados.push([v, ...sufijo]);
        return;
      }
      for (const p of res.predecesores[v]) retroceder(p, [v, ...sufijo]);
    };

    retroceder(destino, []);
    return encontrados;
  }

  /* ---------------------------------------------------------------
     4. API pública del módulo
     --------------------------------------------------------------- */
  return { resolver, estadoEn, caminos };
})();

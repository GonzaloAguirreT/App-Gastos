/**
 * Anotar: la pantalla del teclado.
 *
 * Es una sola pantalla con varios oficios. Además de anotar un gasto sirve
 * para dar de alta un fijo, corregir un importe ya escrito, poner el plan del
 * mes, el límite de aviso, el objetivo de una meta o cuánto va a esa meta en
 * un reparto. Todos son lo mismo: teclear un número y confirmarlo.
 *
 * Tenerlas juntas no es ahorro de código, es coherencia: el gesto de escribir
 * una cifra tiene que ser idéntico en toda la app, y el teclado es el sitio
 * donde más se nota si no lo es.
 *
 * El teclado es propio y no el del sistema a propósito: teclas de 56 px en la
 * mitad de abajo, sin coma decimal —en pesos no se teclean centavos— y sin que
 * el teclado del móvil tape media pantalla al aparecer.
 */
const ANOTAR = (() => {

  const { h, boton, chip } = VISTA;

  const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '←'];

  let modo = 'movimiento';
  let digitos = '';
  let tipo = 'Gasto';
  let categoria = '';
  let descripcion = '';
  let cada = 1;
  let dia = 10;
  let cuotas = 0;
  let objetivo = null;     // el movimiento, fijo o meta que se está editando
  let disponible = 0;      // tope, solo en el reparto
  let volverA = 'mes';

  const soloTeclado = () => ['plan', 'limite', 'meta', 'reparto'].indexOf(modo) !== -1;
  const esFijo = () => modo === 'fijo' || modo === 'edita-fijo';
  const numero = () => parseInt(digitos || '0', 10);

  /* ------------------------------------------------------------ entradas */

  function abrir(categoriaInicial) {
    const { ajustes, datos } = ESTADO.estado();
    modo = 'movimiento';
    digitos = ''; descripcion = ''; objetivo = null;
    tipo = 'Gasto';
    categoria = categoriaInicial || primeraCategoria('Gasto');
    volverA = 'mes';
    if (!ajustes.persona && datos.personas.length) ESTADO.guardarAjustes({ persona: datos.personas[0].nombre });
    pintar();
    VISTA.ir('anotar');
  }

  function nuevoFijo() {
    modo = 'fijo';
    digitos = ''; descripcion = ''; objetivo = null;
    tipo = 'Gasto';
    categoria = primeraCategoria('Gasto');
    cada = 1; dia = 10; cuotas = 0;
    volverA = 'fijos';
    pintar();
    VISTA.ir('anotar');
    mostrarControlesDelFijo();
  }

  /** Convertir un movimiento en fijo: se abre el alta con lo que ya sabemos de
   *  él, que es casi todo. */
  function desdeMovimiento(m) {
    nuevoFijo();
    tipo = m.tipo;
    categoria = m.categoria;
    digitos = String(Math.round(m.importe));
    dia = Number(m.fecha.slice(8)) || 10;
    pintar();
    mostrarControlesDelFijo();
  }

  function editarMovimiento(m) {
    modo = 'edita-mov';
    objetivo = m;
    digitos = String(Math.round(m.importe));
    tipo = m.tipo;
    categoria = m.categoria;
    descripcion = m.descripcion || '';
    volverA = 'historial';
    pintar();
    VISTA.ir('anotar');
  }

  function editarFijo(f) {
    modo = 'edita-fijo';
    objetivo = f;
    digitos = String(Math.round(f.importe));
    tipo = f.tipo;
    categoria = f.concepto;
    cada = Number(f.cada) || 1;
    dia = Number(f.dia) || 1;
    cuotas = Number(f.cuotas) || 0;
    volverA = 'fijo';
    pintar();
    VISTA.ir('anotar');
    mostrarControlesDelFijo();
  }

  function editarPlan() { soloNumero('plan', ESTADO.estado().datos.config.plan, 'ajustes'); }
  function editarLimite() { soloNumero('limite', ESTADO.estado().datos.config.limite, 'ajustes'); }

  function editarMeta(m) {
    objetivo = m;
    soloNumero('meta', m.objetivo, 'ahorro');
  }

  function asignarReparto(m, tope) {
    objetivo = m;
    disponible = tope;
    soloNumero('reparto', 0, 'reparto');
  }

  function soloNumero(cual, valor, vuelta) {
    modo = cual;
    digitos = '';
    volverA = vuelta;
    pintar();
    VISTA.ir('anotar');
  }

  function primeraCategoria(cual) {
    const lista = ESTADO.categoriasDe(cual);
    return lista[0] || '';
  }

  /* ------------------------------------------------------------- pintar */

  function pintar() {
    const { datos, ajustes } = ESTADO.estado();
    const conChips = !soloTeclado();

    /* La lista sale siempre de las categorías de la hoja, también para los
       fijos: el concepto de un fijo acaba escrito en la columna Categoría. */
    const lista = ESTADO.categoriasDe(tipo);
    if (lista.indexOf(categoria) === -1) categoria = lista[0] || '';

    const cabeza = h('div.cabeza-hoja', [
      boton('salir', { onClick: cancelar }, 'Cancelar'),
      conChips
        ? h('div.chips.apretados', ['Gasto', 'Ingreso'].map(t =>
            chip(t, tipo === t, () => { tipo = t; categoria = primeraCategoria(t); pintar(); }, 'pequeno')))
        : h('span.etiqueta', tituloTeclado())
    ]);

    const importe = h('div.importe-grande', [
      h('span.importe-signo', (tipo === 'Ingreso' && conChips ? '+' : '') + (CONFIG.SIMBOLO || '$')),
      h('span.importe-numero' + (digitos ? '' : '.vacio'), FMT.miles(numero()))
    ]);

    const chipsCategoria = conChips
      ? h('div.chips.margen', { estilo: { padding: '12px 26px 4px' } },
          lista.map(k => chip(k, categoria === k, () => { categoria = k; pintar(); }, 'ancho')))
      : null;

    /* La descripción es una columna aparte en la hoja, no parte de la
       categoría: la categoría siempre sale de la lista porque los SUMIFS
       comparan texto exacto, y la descripción es texto libre. Decirlo aquí
       ahorra la tentación de escribir "Comida - sushi" como categoría. */
    const conNota = conChips && !esFijo() && modo !== 'edita-mov';
    const nota = conNota
      ? h('div.margen', { estilo: { padding: '10px 26px 0' } }, [
          h('div.etiqueta.mini', { estilo: { paddingBottom: '2px' } }, 'Descripción · columna aparte en la hoja'),
          h('input.entrada', {
            valor: descripcion,
            placeholder: (tipo === 'Ingreso' ? 'De dónde viene' : 'Dónde fue') + ' (opcional)',
            onInput: e => { descripcion = e.target.value; }
          })
        ])
      : null;

    const chipsFijo = esFijo()
      ? h('div.margen', {
          estilo: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 26px 0' }
        }, [
          h('div.chips-fila', [
            h('span.etiqueta.mini', 'Cada'),
            h('div.chips.apretados', CONFIG.FRECUENCIAS.map(f =>
              chip(f.etiqueta, cada === f.meses, () => { cada = f.meses; pintar(); }, 'pequeno')))
          ]),
          h('div.chips-fila', [
            h('span.etiqueta.mini', 'Día'),
            h('div.chips.apretados', CONFIG.DIAS.map(d =>
              chip(String(d), dia === d, () => { dia = d; pintar(); }, 'dia')))
          ]),
          h('div.chips-fila', [
            h('span.etiqueta.mini', 'Hasta'),
            h('div.chips.apretados', CONFIG.DURACIONES.map(d =>
              chip(d.etiqueta, cuotas === d.cuotas, () => { cuotas = d.cuotas; pintar(); }, 'pequeno')))
          ])
        ])
      : null;

    const teclado = h('div.bloque-teclado',
      h('div.teclado', TECLAS.map(k => boton('tecla', { onClick: () => teclear(k) }, k))));

    const guardar = boton('boton tinta', { onClick: confirmar }, textoGuardar());
    const botones = conChips
      ? h('div.bloque-guardar.doble', [
          guardar,
          boton('boton contorno' + (esFijo() ? ' encendido' : ''),
                { onClick: alternarFijo }, esFijo() ? 'Es puntual' : 'Es fijo')
        ])
      : h('div.bloque-guardar', guardar);

    /* Lo de en medio va en un bloque que se desliza. El prototipo estaba fijado
       a 390×844 y ahí cabía todo; en un móvil estrecho, con las tres filas de
       chips del fijo, no cabe, y lo que se quedaba fuera era el teclado. El
       teclado no puede quedarse nunca fuera. */
    VISTA.pintar(document.getElementById('pantalla-anotar'), [
      cabeza,
      importe,
      h('div.desliza', [
        chipsCategoria,
        nota,
        chipsFijo,
        boton('pie-anotar', { onClick: cambiarCuenta }, pie(ajustes, datos)),
        h('div', { estilo: { height: '10px' } })
      ]),
      teclado,
      botones
    ]);
  }

  function tituloTeclado() {
    return modo === 'plan' ? 'Plan del mes'
         : modo === 'meta' ? 'Meta de ahorro'
         : modo === 'reparto' ? 'Cuánto a esta meta'
         : 'Límite de aviso';
  }

  function textoGuardar() {
    return modo === 'reparto' ? 'Asignar'
         : modo === 'plan' ? 'Guardar plan'
         : modo === 'meta' ? 'Guardar meta'
         : modo === 'limite' ? 'Guardar límite'
         : (modo === 'edita-mov' || modo === 'edita-fijo') ? 'Guardar cambio'
         : modo === 'fijo' ? 'Guardar fijo'
         : 'Guardar';
  }

  /** El pie dice de dónde sale el dinero y, en los modos de solo teclado, cuál
   *  es el valor de ahora: teclear a ciegas sobre un número que no ves es la
   *  forma más fácil de cambiarlo sin querer. */
  function pie(ajustes, datos) {
    const c = datos.config;
    if (modo === 'plan') return 'Plan actual: ' + FMT.dinero(c.plan) + ' · común para todos. Teclea el nuevo y guarda.';
    if (modo === 'limite') return 'Aviso actual bajo ' + FMT.dinero(c.limite) + '. Teclea el nuevo límite.';
    if (modo === 'meta') return 'Meta «' + (objetivo && objetivo.nombre ? objetivo.nombre : 'sin nombre')
      + '» · ahora ' + FMT.dinero(objetivo ? objetivo.objetivo : 0) + '. Teclea el nuevo objetivo.';
    if (modo === 'reparto') return 'Cuánto va a «' + (objetivo && objetivo.nombre ? objetivo.nombre : 'esta meta')
      + '» · hay ' + FMT.dinero(disponible) + ' disponibles.';
    if (modo === 'edita-fijo') return 'Editando un fijo ya guardado. Teclea el importe correcto.';
    if (modo === 'edita-mov') return 'Editando un movimiento ya anotado. Teclea el importe correcto.';
    if (modo === 'fijo') {
      const term = cuotas
        ? cuotas + ' cuotas, hasta ' + FMT.nombreMesAnio(FMT.mesMas(ESTADO.mesEnCurso(), (cuotas - 1) * cada))
        : 'sin fecha de término';
      return 'Sale el día ' + dia + ' ' + (cada === 1 ? 'de cada mes' : 'cada ' + cada + ' meses')
           + ' · ' + term + ' · ' + (ajustes.cuenta || datos.cuentas[0]);
    }
    const sinRed = !ESTADO.estado().enLinea;
    return (ajustes.cuenta || datos.cuentas[0]) + ' · ' + (ajustes.persona || datos.personas[0].nombre)
         + (sinRed ? ' · se enviará al recuperar conexión' : ' · toca para cambiar de cuenta');
  }

  function cambiarCuenta() {
    const { ajustes, datos } = ESTADO.estado();
    const actual = ajustes.cuenta || datos.cuentas[0];
    const siguiente = datos.cuentas[(datos.cuentas.indexOf(actual) + 1) % datos.cuentas.length];
    ESTADO.guardarAjustes({ cuenta: siguiente });
  }

  /* ------------------------------------------------------------ teclado */

  function teclear(k) {
    if (k === '←') digitos = digitos.slice(0, -1);
    else if (k === 'C') digitos = '';
    // Nueve cifras es más que cualquier importe real y menos que lo que rompe
    // el formato de la hoja.
    else if ((digitos + k).length <= 9) digitos = (digitos === '0' ? '' : digitos) + k;
    VISTA.vibrar(8);
    pintar();
  }

  function alternarFijo() {
    modo = esFijo() ? 'movimiento' : 'fijo';
    objetivo = null;
    categoria = primeraCategoria(tipo);
    pintar();
    if (esFijo()) mostrarControlesDelFijo();
  }

  /**
   * Baja el bloque hasta las tres filas de chips del fijo.
   *
   * Con una lista larga de categorías —y la lista la eliges tú— el Cada/Día/
   * Hasta se queda por debajo del corte, y quien acaba de tocar "Es fijo" ve
   * exactamente lo mismo que antes de tocarlo. El teclado no puede moverse de
   * abajo, así que lo que se mueve es la vista.
   */
  function mostrarControlesDelFijo() {
    const bloque = document.querySelector('#pantalla-anotar .desliza');
    if (bloque) bloque.scrollTop = bloque.scrollHeight;
  }

  function cancelar() {
    digitos = '';
    VISTA.ir(volverA);
  }

  async function confirmar() {
    const n = numero();
    if (!n) return;
    const { ajustes, datos } = ESTADO.estado();
    VISTA.vibrar();

    if (modo === 'plan') { await ESTADO.guardarConfig({ config: { plan: n } }); }
    else if (modo === 'limite') { await ESTADO.guardarConfig({ config: { limite: n } }); }
    else if (modo === 'meta') {
      const metas = datos.metas.map(m => m.nombre === objetivo.nombre
        ? Object.assign({}, m, { objetivo: n }) : m);
      await ESTADO.guardarMetas(metas);
    }
    else if (modo === 'reparto') { AHORRO.asignarA(objetivo.nombre, n); }
    else if (modo === 'edita-mov') {
      await ESTADO.editarMovimiento(objetivo.uuid, { importe: n, categoria, tipo });
    }
    else if (modo === 'edita-fijo') {
      await ESTADO.guardarFijo(Object.assign({}, objetivo, { importe: n, concepto: categoria }));
    }
    else if (modo === 'fijo') {
      /* El concepto de un fijo es una categoría de la lista, no texto libre:
         el día que se cobre, esa palabra se escribe en la columna Categoría de
         Movimientos, y si no existe en Listas el panel la suma en ninguna
         parte. */
      await ESTADO.guardarFijo({
        uuid: ESTADO.uuid(),
        tipo,
        concepto: categoria,
        importe: n,
        dia,
        cada,
        cuotas,
        restantes: cuotas,
        cuenta: ajustes.cuenta || datos.cuentas[0],
        persona: ajustes.persona || datos.personas[0].nombre,
        reparto: ESTADO.repartoDe(categoria),
        activo: true,
        prox: proximoCargo(dia)
      });
    }
    else {
      await ESTADO.anotar({
        tipo,
        categoria,
        descripcion,
        importe: n,
        cuenta: ajustes.cuenta || datos.cuentas[0],
        persona: ajustes.persona || datos.personas[0].nombre
      });
    }

    digitos = '';
    descripcion = '';
    const destino = modo === 'movimiento' ? 'mes' : volverA;
    objetivo = null;
    VISTA.ir(destino);
  }

  /** El primer cargo: este mes si el día aún no ha pasado, el siguiente si ya
   *  pasó. Cobrar hoy algo que se cobró el día 5 sería inventarse un gasto. */
  function proximoCargo(diaElegido) {
    const mes = ESTADO.mesEnCurso();
    const candidato = FMT.diaDelMes(mes, diaElegido);
    return candidato >= ESTADO.hoy() ? candidato : FMT.diaDelMes(FMT.mesMas(mes, 1), diaElegido);
  }

  return {
    abrir, nuevoFijo, desdeMovimiento, editarMovimiento, editarFijo,
    editarPlan, editarLimite, editarMeta, asignarReparto, pintar
  };
})();

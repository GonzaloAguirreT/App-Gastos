/**
 * Orquestador: máquina de estados de los 5 pasos y guardado.
 *
 * El flujo es deliberadamente rígido —importe, tipo, categoría, cuenta,
 * concepto— porque el objetivo no es la flexibilidad sino no tener que pensar:
 * siempre los mismos gestos en los mismos sitios.
 */
(() => {

  const PASOS = ['importe', 'tipo', 'categoria', 'cuenta', 'concepto'];
  const CLAVE_ULTIMA_CUENTA = 'gastos.ultimaCuenta';
  const MS_DESHACER = 5000;

  let indice = 0;
  let movimiento = movimientoVacio();

  // Movimiento guardado a la espera de que pasen los 5 segundos de deshacer.
  // En la fase 3 esto pasará a IndexedDB para que cerrar la app no lo pierda.
  let pendiente = null;
  let temporizadorEnvio = null;

  function movimientoVacio() {
    return {
      fecha: UI.hoyISO(),
      concepto: '',
      importe: '',
      cuenta: '',
      tipo: '',
      categoria: '',
      cuentaDestino: ''   // solo se usa en los traspasos
    };
  }

  /* Un traspaso reutiliza los mismos cinco pasos, pero los dos del medio
     cambian de significado: en vez de categoría y cuenta, preguntan por la
     cuenta de origen y la de destino. Así el gesto sigue siendo el mismo y no
     hay una segunda pantalla que aprender. */
  function esTraspaso() {
    return movimiento.tipo === 'Traspaso';
  }

  /* ------------------------------------------------------------------ pasos */

  function irA(nuevoIndice, atras = false) {
    indice = nuevoIndice;
    const nombre = PASOS[indice];

    if (nombre === 'categoria') pintarCategorias();
    if (nombre === 'cuenta') pintarCuentas();
    if (nombre === 'concepto') UI.pintarResumen(movimiento, CONFIG.MONEDA);

    UI.mostrarPaso(nombre, atras);
    UI.pintarMigas(indice, PASOS.length);

    // El teclado solo se abre si el navegador considera que venimos de un gesto
    // del usuario. En Android es irregular; si no se abre, un toque en el campo
    // lo resuelve. No hay forma fiable de forzarlo desde una PWA.
    if (nombre === 'importe') UI.el.inputImporte.focus();
    if (nombre === 'concepto') UI.el.inputConcepto.focus();
  }

  function siguiente() { if (indice < PASOS.length - 1) irA(indice + 1); }
  function atras() { if (indice > 0) irA(indice - 1, true); }

  function reiniciar() {
    movimiento = movimientoVacio();
    UI.el.inputImporte.value = '';
    UI.el.inputConcepto.value = '';
    UI.el.btnImporteSiguiente.disabled = true;
    UI.pintarFecha(movimiento.fecha);
    irA(0);
  }

  /* ---------------------------------------------------------------- importe */

  /** Acepta "12,5", "12.5" y "12". Devuelve "12.50" o null si no es válido.
   *  Siempre positivo: el signo lo pone la columna Tipo, nunca el importe. */
  function normalizarImporte(texto) {
    const limpio = String(texto).trim().replace(',', '.');
    if (!limpio) return null;
    const numero = Number.parseFloat(limpio);
    if (!Number.isFinite(numero) || numero <= 0) return null;
    return Math.abs(numero).toFixed(2);
  }

  function alEscribirImporte() {
    const campo = UI.el.inputImporte;
    // Filtra en caliente: dígitos y un único separador decimal. Con
    // inputmode="decimal" el teclado de Android sigue ofreciendo otras teclas.
    let valor = campo.value.replace(/[^\d.,]/g, '');
    const partes = valor.split(/[.,]/);
    if (partes.length > 2) valor = partes[0] + ',' + partes.slice(1).join('');
    if (partes.length === 2) valor = partes[0] + ',' + partes[1].slice(0, 2);
    campo.value = valor;

    UI.el.btnImporteSiguiente.disabled = normalizarImporte(valor) === null;
  }

  function confirmarImporte() {
    const importe = normalizarImporte(UI.el.inputImporte.value);
    if (importe === null) return;
    movimiento.importe = importe;
    UI.el.inputImporte.blur(); // cierra el teclado antes de mostrar las rejillas
    siguiente();
  }

  /* --------------------------------------------------- tipo, categoría, cuenta */

  function elegirTipo(tipo) {
    // Al cambiar de tipo, lo elegido después deja de valer: las listas de gasto
    // e ingreso son distintas, y un traspaso ni siquiera usa categorías.
    if (movimiento.tipo !== tipo) {
      movimiento.categoria = '';
      movimiento.cuenta = '';
      movimiento.cuentaDestino = '';
    }
    movimiento.tipo = tipo;
    siguiente();
  }

  /** Paso 3: categoría, o cuenta de origen si es traspaso. */
  function pintarCategorias() {
    if (esTraspaso()) {
      UI.el.preguntaCategoria.textContent = 'Desde qué cuenta';
      UI.pintarOpciones(UI.el.rejillaCategorias, CONFIG.CUENTAS, cuenta => {
        // Cambiar el origen puede dejar el destino igual al origen; se limpia.
        if (movimiento.cuentaDestino === cuenta) movimiento.cuentaDestino = '';
        movimiento.cuenta = cuenta;
        siguiente();
      }, movimiento.cuenta);
      return;
    }

    UI.el.preguntaCategoria.textContent = 'Categoría';
    const lista = movimiento.tipo === 'Ingreso'
      ? CONFIG.CATEGORIAS_INGRESO
      : CONFIG.CATEGORIAS_GASTO;
    UI.pintarOpciones(UI.el.rejillaCategorias, lista, categoria => {
      movimiento.categoria = categoria;
      siguiente();
    }, movimiento.categoria);
  }

  /** Paso 4: cuenta, o cuenta de destino si es traspaso. */
  function pintarCuentas() {
    if (esTraspaso()) {
      UI.el.preguntaCuenta.textContent = 'A qué cuenta';
      // Se quita la de origen: un traspaso a la misma cuenta no significa nada.
      const destinos = CONFIG.CUENTAS.filter(c => c !== movimiento.cuenta);
      UI.pintarOpciones(UI.el.rejillaCuentas, destinos, cuenta => {
        movimiento.cuentaDestino = cuenta;
        siguiente();
      }, movimiento.cuentaDestino);
      return;
    }

    UI.el.preguntaCuenta.textContent = 'Cuenta';
    const ultima = localStorage.getItem(CLAVE_ULTIMA_CUENTA);
    UI.pintarOpciones(UI.el.rejillaCuentas, CONFIG.CUENTAS, cuenta => {
      movimiento.cuenta = cuenta;
      localStorage.setItem(CLAVE_ULTIMA_CUENTA, cuenta);
      siguiente();
    }, movimiento.cuenta || ultima);
  }

  /* --------------------------------------------------------------- guardado */

  /**
   * Convierte lo capturado en las filas que van a la hoja.
   *
   * Un movimiento normal es una fila. Un traspaso son DOS: un Gasto en la
   * cuenta de origen y un Ingreso en la de destino, ambos con la categoría de
   * traspaso. De esa forma el saldo de cada cuenta sale bien y el backend puede
   * descontarlos de los totales del mes, que es donde falseaban las cuentas.
   */
  function filasDe(m) {
    const base = {
      fecha: m.fecha,
      concepto: m.concepto,
      importe: m.importe
    };

    if (m.tipo !== 'Traspaso') {
      return [{ ...base, cuenta: m.cuenta, tipo: m.tipo,
                categoria: m.categoria, uuid: API.uuid() }];
    }

    // Dos UUID distintos: el backend desduplica fila a fila, y las dos filas
    // son movimientos diferentes aunque procedan del mismo gesto.
    return [
      { ...base, cuenta: m.cuenta, tipo: 'Gasto',
        categoria: CONFIG.CATEGORIA_TRASPASO, uuid: API.uuid() },
      { ...base, cuenta: m.cuentaDestino, tipo: 'Ingreso',
        categoria: CONFIG.CATEGORIA_TRASPASO, uuid: API.uuid() }
    ];
  }

  function faltaAlgo() {
    if (!movimiento.importe || !movimiento.tipo) return true;
    if (esTraspaso()) return !movimiento.cuenta || !movimiento.cuentaDestino;
    return !movimiento.categoria || !movimiento.cuenta;
  }

  function guardar() {
    if (faltaAlgo()) {
      UI.toast('Falta algún dato del movimiento');
      return;
    }

    // Si aún había uno esperando su ventana de deshacer, se envía ya: nunca
    // puede haber dos pendientes a la vez.
    confirmarPendiente();

    movimiento.concepto = UI.el.inputConcepto.value.trim();
    pendiente = { origen: { ...movimiento }, filas: filasDe(movimiento) };

    UI.vibrar(20);
    const importeMostrado = UI.formatearImporte(movimiento.importe, CONFIG.MONEDA);
    const texto = esTraspaso()
      ? `Traspaso de ${importeMostrado}`
      : `Guardado ${importeMostrado}`;
    UI.toast(texto, {
      ms: MS_DESHACER,
      alDeshacer: deshacer
    });

    temporizadorEnvio = setTimeout(confirmarPendiente, MS_DESHACER);

    // Vuelta al paso 1 inmediatamente: el movimiento anterior se envía solo por
    // detrás. No hay pantalla intermedia ni confirmación que cerrar.
    reiniciar();
  }

  function deshacer() {
    clearTimeout(temporizadorEnvio);
    const descartado = pendiente;
    pendiente = null;
    if (!descartado) return;

    // Se recupera el movimiento en el paso del concepto para poder corregirlo
    // en vez de tener que teclearlo otra vez.
    movimiento = { ...descartado.origen };
    UI.el.inputImporte.value = movimiento.importe.replace('.', ',');
    UI.el.inputConcepto.value = movimiento.concepto;
    UI.el.btnImporteSiguiente.disabled = false;
    UI.pintarFecha(movimiento.fecha);
    irA(PASOS.indexOf('concepto'), true);
    UI.toast('Movimiento recuperado');
  }

  async function confirmarPendiente() {
    clearTimeout(temporizadorEnvio);
    if (!pendiente) return;

    const aEnviar = pendiente;
    pendiente = null;

    try {
      await API.enviar(aEnviar.filas);
    } catch (error) {
      /* Fase 3: aquí va la cola en IndexedDB y este movimiento se reintentará
         solo. Hasta entonces se pierde, así que el aviso tiene que ser
         inequívoco: si dijéramos "no se pudo enviar" a secas, es fácil
         entender que ya se reintentará y quedarse tan tranquilo. */
      console.error('No se pudo enviar el movimiento:', error);
      UI.toast(`NO se ha guardado (${error.message}). Vuelve a anotarlo.`, { ms: 7000 });
    }
  }

  /* ----------------------------------------------------------------- fecha */

  function abrirSelectorFecha() {
    const campo = UI.el.inputFecha;
    if (typeof campo.showPicker === 'function') {
      try { campo.showPicker(); return; } catch (_) { /* cae al click */ }
    }
    campo.click();
  }

  /* ---------------------------------------------------------------- arranque */

  function conectarEventos() {
    UI.el.inputImporte.addEventListener('input', alEscribirImporte);
    UI.el.inputImporte.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); confirmarImporte(); }
    });
    UI.el.btnImporteSiguiente.addEventListener('click', confirmarImporte);

    document.querySelectorAll('[data-tipo]').forEach(boton => {
      boton.addEventListener('click', () => elegirTipo(boton.dataset.tipo));
    });

    UI.el.inputConcepto.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); guardar(); }
    });
    UI.el.btnGuardar.addEventListener('click', guardar);
    UI.el.btnAtras.addEventListener('click', atras);

    UI.el.btnFecha.addEventListener('click', abrirSelectorFecha);
    UI.el.inputFecha.addEventListener('change', () => {
      // Un input date vacío (cancelar el selector) no debe borrar la fecha.
      if (!UI.el.inputFecha.value) return;
      movimiento.fecha = UI.el.inputFecha.value;
      UI.pintarFecha(movimiento.fecha);
    });

    // Salir de la app durante la ventana de deshacer no puede perder el
    // movimiento: se envía en cuanto la pantalla se oculta.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') confirmarPendiente();
    });
  }

  function iniciar() {
    UI.el.moneda.textContent = CONFIG.MONEDA;
    conectarEventos();
    AJUSTES.iniciar();
    reiniciar();

    if (CONFIG.MODO_PRUEBA) {
      console.info('MODO_PRUEBA activo: nada se envía, todo va a la consola.');
    } else if (!AJUSTES.configurado()) {
      // Sin endpoint ni token no hay dónde escribir. Mejor pedirlos al entrar
      // que dejar que el primer gasto se pierda con un error.
      AJUSTES.abrir();
    }

    if ('serviceWorker' in navigator) {
      // El registro falla y no pasa nada si se sirve desde un origen inseguro
      // (http:// que no sea localhost). Ver README.
      navigator.serviceWorker.register('sw.js').catch(e =>
        console.warn('Service worker no registrado:', e.message));
    }
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();

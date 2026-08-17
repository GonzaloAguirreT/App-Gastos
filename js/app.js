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
      categoria: ''
    };
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
    // Si se cambia el tipo después de haber elegido categoría, la anterior ya
    // no vale: las listas de gasto e ingreso son distintas.
    if (movimiento.tipo !== tipo) movimiento.categoria = '';
    movimiento.tipo = tipo;
    siguiente();
  }

  function pintarCategorias() {
    const lista = movimiento.tipo === 'Ingreso'
      ? CONFIG.CATEGORIAS_INGRESO
      : CONFIG.CATEGORIAS_GASTO;
    UI.pintarOpciones(UI.el.rejillaCategorias, lista, categoria => {
      movimiento.categoria = categoria;
      siguiente();
    }, movimiento.categoria);
  }

  function pintarCuentas() {
    const ultima = localStorage.getItem(CLAVE_ULTIMA_CUENTA);
    UI.pintarOpciones(UI.el.rejillaCuentas, CONFIG.CUENTAS, cuenta => {
      movimiento.cuenta = cuenta;
      localStorage.setItem(CLAVE_ULTIMA_CUENTA, cuenta);
      siguiente();
    }, movimiento.cuenta || ultima);
  }

  /* --------------------------------------------------------------- guardado */

  function guardar() {
    if (!movimiento.importe || !movimiento.tipo ||
        !movimiento.categoria || !movimiento.cuenta) {
      UI.toast('Falta algún dato del movimiento');
      return;
    }

    // Si aún había uno esperando su ventana de deshacer, se envía ya: nunca
    // puede haber dos pendientes a la vez.
    confirmarPendiente();

    movimiento.concepto = UI.el.inputConcepto.value.trim();
    pendiente = { ...movimiento, uuid: API.uuid() };

    UI.vibrar(20);
    const importeMostrado = UI.formatearImporte(pendiente.importe, CONFIG.MONEDA);
    UI.toast(`Guardado ${importeMostrado}`, {
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
    movimiento = {
      fecha: descartado.fecha,
      concepto: descartado.concepto,
      importe: descartado.importe,
      cuenta: descartado.cuenta,
      tipo: descartado.tipo,
      categoria: descartado.categoria
    };
    UI.el.inputImporte.value = descartado.importe.replace('.', ',');
    UI.el.inputConcepto.value = descartado.concepto;
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
      await API.enviar(aEnviar);
    } catch (error) {
      // Fase 3: aquí va la cola en IndexedDB. Hasta entonces, avisar y no
      // fingir que se ha guardado.
      console.error('No se pudo enviar el movimiento:', error);
      UI.toast('No se pudo enviar. Pendiente de la cola (fase 3)');
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
    reiniciar();

    if (CONFIG.MODO_PRUEBA) {
      console.info('MODO_PRUEBA activo: nada se envía, todo va a la consola.');
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

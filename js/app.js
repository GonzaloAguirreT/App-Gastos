/**
 * Orquestador: máquina de estados de los pasos y guardado.
 *
 * El flujo es deliberadamente rígido —importe, tipo, categoría, cuenta,
 * concepto— porque el objetivo no es la flexibilidad sino no tener que pensar:
 * siempre los mismos gestos en los mismos sitios.
 *
 * La única bifurcación está en el primer paso, y es de fondo, no de forma: un
 * PUNTUAL es una fila y se acabó; un FRECUENTE es una regla que seguirá
 * escribiendo filas sola cada mes. Preguntarlo con el importe recién tecleado
 * evita el error caro —anotar el alquiler como gasto suelto y repetirlo doce
 * veces— sin costar ningún toque de más: los dos botones ocupan el sitio del
 * antiguo "Siguiente".
 */
(() => {

  const PASOS_BASE = ['importe', 'tipo', 'categoria', 'cuenta', 'concepto'];
  const CLAVE_ULTIMA_CUENTA = 'gastos.ultimaCuenta';
  const MS_DESHACER = NUCLEO.MS_DESHACER;

  /* Quién usa este teléfono. Se elige UNA vez en Ajustes y se estampa en todos
     los movimientos. No se puede cambiar desde la captura a propósito: la app
     existe para no tener que decidir nada más que el importe, y una decisión
     que se repite en cada gasto es exactamente lo que hay que quitar de en
     medio.

     Se declara ANTES que `movimiento`: movimientoVacio() lo lee, y con `let`
     una variable no existe hasta su línea. Al revés, el módulo entero reventaba
     al cargarse y la app no arrancaba. */
  let usuarioDelTelefono = CONFIG.USUARIOS[0] || '';

  let indice = 0;
  let movimiento = movimientoVacio();

  /* Lo último guardado, solo para poder deshacerlo. El movimiento en sí ya está
     en IndexedDB desde el instante en que pulsas Guardar: esto es una copia
     para repintar la pantalla si te arrepientes, no el dato bueno. Si cierras
     la app durante la ventana de deshacer, esta variable desaparece y el
     movimiento se envía igual, que es justo lo que queremos. */
  let ultimoGuardado = null;
  let temporizadorEnvio = null;

  function movimientoVacio() {
    return {
      fecha: UI.hoyISO(),
      concepto: '',
      importe: '',
      cuenta: '',
      tipo: '',
      categoria: '',
      frecuente: false,   // lo decide el primer paso
      frecuencia: '',     // solo en los frecuentes
      duracion: null,     // {etiqueta, meses}; meses null = indefinida
      usuario: usuarioDelTelefono
    };
  }

  /* Un frecuente no es el movimiento de hoy: es uno que se repetirá. Por eso
     pregunta dos cosas más, y por eso lo que se envía no es una fila sino una
     definición que el backend usa para escribir cada cobro cuando toque. */
  function esFrecuente() {
    return movimiento.frecuente === true;
  }

  /* La lista de pasos no es fija: crece cuando el movimiento lo pide. Las dos
     preguntas del frecuente se intercalan tras la categoría, que es donde ya se
     sabe de qué se trata. */
  function pasos() {
    const lista = PASOS_BASE.slice();
    if (esFrecuente()) lista.splice(3, 0, 'frecuencia', 'duracion');
    return lista;
  }

  /* ------------------------------------------------------------------ pasos */

  function irA(nuevoIndice, atras = false) {
    const lista = pasos();
    indice = nuevoIndice;
    const nombre = lista[indice];

    if (nombre === 'categoria') pintarCategorias();
    if (nombre === 'frecuencia') pintarFrecuencias();
    if (nombre === 'duracion') pintarDuraciones();
    if (nombre === 'cuenta') pintarCuentas();
    if (nombre === 'concepto') UI.pintarResumen(movimiento, CONFIG.MONEDA);

    UI.mostrarPaso(nombre, atras);
    UI.pintarMigas(indice, lista.length);

    // El teclado solo se abre si el navegador considera que venimos de un gesto
    // del usuario. En Android es irregular; si no se abre, un toque en el campo
    // lo resuelve. No hay forma fiable de forzarlo desde una PWA.
    if (nombre === 'importe') UI.el.inputImporte.focus();
    if (nombre === 'concepto') UI.el.inputConcepto.focus();
  }

  function siguiente() { if (indice < pasos().length - 1) irA(indice + 1); }
  function atras() { if (indice > 0) irA(indice - 1, true); }

  function reiniciar() {
    movimiento = movimientoVacio();
    UI.el.inputImporte.value = '';
    UI.el.inputConcepto.value = '';
    UI.habilitarRamas(false);
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

    UI.habilitarRamas(normalizarImporte(valor) !== null);
  }

  /**
   * Los dos botones del primer paso: confirman el importe y eligen la rama.
   *
   * @param {boolean} frecuente true = se repetirá solo; false = solo esta vez.
   */
  function confirmarImporte(frecuente) {
    const importe = normalizarImporte(UI.el.inputImporte.value);
    if (importe === null) return;

    // Cambiar de rama invalida lo contestado: las listas de categorías son
    // distintas y las dos preguntas del frecuente dejan de existir.
    if (movimiento.frecuente !== frecuente) {
      movimiento.categoria = '';
      movimiento.frecuencia = '';
      movimiento.duracion = null;
    }
    movimiento.frecuente = frecuente;
    movimiento.importe = importe;
    UI.el.inputImporte.blur(); // cierra el teclado antes de mostrar las rejillas
    siguiente();
  }

  /* --------------------------------------------------- tipo, categoría, cuenta */

  function elegirTipo(tipo) {
    // Al cambiar de tipo, la categoría elegida deja de valer: las listas de
    // gasto e ingreso no tienen nada que ver.
    if (movimiento.tipo !== tipo) movimiento.categoria = '';
    movimiento.tipo = tipo;
    siguiente();
  }

  /** Paso 3: categoría. Cuatro listas posibles, según rama y tipo. */
  function pintarCategorias() {
    UI.el.preguntaCategoria.textContent = esFrecuente()
      ? (movimiento.tipo === 'Ingreso' ? 'Ingreso frecuente' : 'Gasto frecuente')
      : 'Categoría';

    UI.pintarOpciones(UI.el.rejillaCategorias, categoriasDe(movimiento), categoria => {
      movimiento.categoria = categoria;
      siguiente();
    }, movimiento.categoria);
  }

  function categoriasDe(m) {
    if (m.frecuente) {
      return m.tipo === 'Ingreso'
        ? CONFIG.CATEGORIAS_FRECUENTES_INGRESO
        : CONFIG.CATEGORIAS_FRECUENTES_GASTO;
    }
    return m.tipo === 'Ingreso' ? CONFIG.CATEGORIAS_INGRESO : CONFIG.CATEGORIAS_GASTO;
  }

  function pintarFrecuencias() {
    UI.pintarOpciones(UI.el.rejillaFrecuencias, CONFIG.FRECUENCIAS, frecuencia => {
      movimiento.frecuencia = frecuencia;
      siguiente();
    }, movimiento.frecuencia);
  }

  function pintarDuraciones() {
    const etiquetas = CONFIG.DURACIONES.map(d => d.etiqueta);
    UI.pintarOpciones(UI.el.rejillaDuraciones, etiquetas, etiqueta => {
      movimiento.duracion = CONFIG.DURACIONES.filter(d => d.etiqueta === etiqueta)[0];
      siguiente();
    }, movimiento.duracion ? movimiento.duracion.etiqueta : null);
  }

  /** Paso 4: cuenta. */
  function pintarCuentas() {
    UI.el.preguntaCuenta.textContent = 'Cuenta';
    const ultima = localStorage.getItem(CLAVE_ULTIMA_CUENTA);
    UI.pintarOpciones(UI.el.rejillaCuentas, CONFIG.CUENTAS, cuenta => {
      movimiento.cuenta = cuenta;
      localStorage.setItem(CLAVE_ULTIMA_CUENTA, cuenta);
      siguiente();
    }, movimiento.cuenta || ultima);
  }

  /* --------------------------------------------------------------- guardado */

  /** Convierte lo capturado en la fila que va a la hoja. */
  function filasDe(m) {
    return [{
      fecha: m.fecha,
      concepto: m.concepto,
      importe: m.importe,
      usuario: m.usuario,
      cuenta: m.cuenta,
      tipo: m.tipo,
      categoria: m.categoria,
      uuid: API.uuid()
    }];
  }

  function faltaAlgo() {
    if (!movimiento.importe || !movimiento.tipo) return true;
    if (esFrecuente() && (!movimiento.frecuencia || !movimiento.duracion)) return true;
    return !movimiento.categoria || !movimiento.cuenta;
  }

  /** Lo que se envía de un frecuente: la definición, no un movimiento. El
   *  backend calcula la fecha de fin y escribe cada cobro el día que toca. */
  function suscripcionDe(m) {
    return {
      uuid: API.uuid(),
      concepto: m.concepto,
      importe: m.importe,
      cuenta: m.cuenta,
      categoria: m.categoria,
      usuario: m.usuario,
      // Va el tipo porque un frecuente también puede ser un ingreso —la nómina,
      // un piso alquilado—, y de él depende el signo de cada cobro que escriba
      // el disparador. Sin esto todos entrarían como gasto.
      tipo: m.tipo,
      frecuencia: m.frecuencia,
      inicio: m.fecha,
      duracionMeses: m.duracion ? m.duracion.meses : null
    };
  }

  async function guardar() {
    if (faltaAlgo()) {
      UI.toast('Falta algún dato del movimiento');
      return;
    }

    movimiento.concepto = UI.el.inputConcepto.value.trim();
    const accion = esFrecuente() ? 'suscripcion' : 'movimientos';
    const filas = esFrecuente() ? [suscripcionDe(movimiento)] : filasDe(movimiento);
    const grupo = filas[0].uuid;   // el uuid de la primera fila identifica al lote

    /* A disco ANTES de nada. Este es el punto en el que el movimiento deja de
       poder perderse: aunque se vaya la batería en el segundo siguiente, la
       fila ya está en IndexedDB y saldrá al arrancar la app. Lo que viene
       después —el aviso, el envío, los reintentos— puede fallar sin
       consecuencias. */
    try {
      await NUCLEO.encolar(filas, grupo, accion);
    } catch (error) {
      // Si ni siquiera se puede escribir en disco, hay que decirlo claramente:
      // es el único caso en el que un movimiento se pierde de verdad.
      console.error('No se pudo encolar el movimiento:', error);
      UI.toast(`NO se ha guardado (${error.message}). Vuelve a anotarlo.`, { ms: 7000 });
      return;
    }

    ultimoGuardado = { origen: { ...movimiento }, grupo };
    COLA.pintarIndicador();

    UI.vibrar(20);
    const importeMostrado = UI.formatearImporte(movimiento.importe, CONFIG.MONEDA);
    const CADA = { Mensual: 'al mes', Trimestral: 'cada trimestre', Anual: 'al año' };
    const texto = esFrecuente()
      ? `${movimiento.categoria} de ${importeMostrado} ${CADA[movimiento.frecuencia] || ''}`.trim()
      : `Guardado ${importeMostrado}`;
    UI.toast(texto, { ms: MS_DESHACER, alDeshacer: deshacer });

    // Pasada la ventana de deshacer, se intenta enviar. Si no hay red no pasa
    // nada: sigue en la cola y se reintenta solo.
    clearTimeout(temporizadorEnvio);
    temporizadorEnvio = setTimeout(() => {
      ultimoGuardado = null;
      COLA.procesar();
    }, MS_DESHACER);

    // Vuelta al paso 1 inmediatamente. No hay pantalla intermedia que cerrar.
    reiniciar();
  }

  async function deshacer() {
    clearTimeout(temporizadorEnvio);
    const descartado = ultimoGuardado;
    ultimoGuardado = null;
    if (!descartado) return;

    await NUCLEO.borrarGrupo(descartado.grupo);
    COLA.pintarIndicador();

    // Se recupera el movimiento en el paso del concepto para poder corregirlo
    // en vez de tener que teclearlo otra vez.
    movimiento = { ...descartado.origen };
    UI.el.inputImporte.value = movimiento.importe.replace('.', ',');
    UI.el.inputConcepto.value = movimiento.concepto;
    UI.habilitarRamas(true);
    UI.pintarFecha(movimiento.fecha);
    irA(pasos().indexOf('concepto'), true);
    UI.toast('Movimiento recuperado');
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
    /* Enter en el teclado va por "Puntuales": es la rama de todos los días, y
       la que no tiene consecuencias si te equivocas —una fila suelta, no una
       regla que sigue cobrando sola—. */
    UI.el.inputImporte.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); confirmarImporte(false); }
    });
    UI.el.btnFrecuentes.addEventListener('click', () => confirmarImporte(true));
    UI.el.btnPuntuales.addEventListener('click', () => confirmarImporte(false));

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

    /* Al salir de la app ya no puedes deshacer, así que la espera de cinco
       segundos deja de tener sentido y se envía lo que haya. El movimiento no
       corre peligro en ningún caso —está en disco desde que pulsaste Guardar—,
       pero cuanto antes llegue a la hoja, mejor. */
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        clearTimeout(temporizadorEnvio);
        ultimoGuardado = null;
        COLA.procesar({ ignorarDeshacer: true, ignorarBackoff: true });
      }
    });
  }

  async function iniciar() {
    UI.el.moneda.textContent = CONFIG.MONEDA;
    conectarEventos();
    reiniciar();

    // Primero la migración de ajustes, que puede traer el token de localStorage,
    // y solo después la cola: si no, el primer vaciado creería que no hay
    // configuración y pospondría todo sin motivo.
    await AJUSTES.iniciar();
    usuarioDelTelefono = (await AJUSTES.leer()).usuario || CONFIG.USUARIOS[0] || '';
    movimiento.usuario = usuarioDelTelefono;

    COLA.iniciar();
    RESUMEN.iniciar();

    if (CONFIG.MODO_PRUEBA) {
      console.info('MODO_PRUEBA activo: nada se envía, todo va a la consola.');
    } else if (!await AJUSTES.configurado()) {
      // Sin endpoint ni token no hay dónde escribir. Mejor pedirlos al entrar
      // que dejar que el primer gasto se quede atascado en la cola.
      AJUSTES.abrir();
    }

    if ('serviceWorker' in navigator) {
      // El registro falla y no pasa nada si se sirve desde un origen inseguro
      // (http:// que no sea localhost). Ver README.
      navigator.serviceWorker.register('sw.js').catch(e =>
        console.warn('Service worker no registrado:', e.message));

      vigilarActualizaciones();
    }
  }

  /**
   * Cuando se despliega una versión nueva, el service worker se la descarga por
   * detrás pero la pestaña abierta sigue con la vieja hasta que se recarga.
   * Sin esto hay que cerrar y abrir la app para ver los cambios, y no hay forma
   * de saber que hace falta.
   */
  function vigilarActualizaciones() {
    // En la primera instalación no hay controlador previo, y no hay nada viejo
    // que sustituir: recargar ahí sería un parpadeo gratuito.
    const habiaControlador = Boolean(navigator.serviceWorker.controller);
    let yaRecargando = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!habiaControlador || yaRecargando) return;

      // Recargar a media captura borraría el importe tecleado. Si estás en
      // mitad de algo, se avisa y la versión nueva espera al siguiente arranque.
      const aMedias = indice !== 0 || UI.el.inputImporte.value || ultimoGuardado;
      if (aMedias) {
        UI.toast('Hay una versión nueva. Se aplicará al reabrir la app.', { ms: 5000 });
        return;
      }

      yaRecargando = true;
      location.reload();
    });
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();

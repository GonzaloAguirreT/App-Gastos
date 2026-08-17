/**
 * Lado de la página de la cola: cuándo se intenta enviar y cómo se cuenta.
 *
 * El almacenamiento y el envío están en nucleo.js, que comparte con el service
 * worker. Aquí solo vive lo que necesita una pantalla: el indicador, los
 * temporizadores y los eventos del navegador.
 */
const COLA = (() => {

  /* Un minuto entre reintentos mientras la app está abierta. Cada registro
     lleva además su propio backoff, así que esto no es un martilleo: es el
     latido que despierta a los que ya han cumplido su espera. */
  const MS_REINTENTO = 60000;

  let procesando = false;
  let temporizador = null;

  /** Evita dos vaciados a la vez, que enviarían las mismas filas dos veces.
   *  El backend las desduplicaría por uuid, pero es tráfico y batería tirados. */
  async function procesar(opciones) {
    if (procesando) return null;
    procesando = true;
    try {
      const resultado = await NUCLEO.procesar(opciones);
      await pintarIndicador();
      return resultado;
    } catch (error) {
      console.warn('No se pudo procesar la cola:', error);
      return null;
    } finally {
      procesando = false;
    }
  }

  /** Vaciado a petición del usuario, con respuesta visible. A diferencia del
   *  automático, este ignora los backoff: si lo pides tú, se intenta ya. */
  async function forzar() {
    const antes = await NUCLEO.contar();
    if (!antes) {
      UI.toast('No hay nada pendiente');
      return;
    }

    UI.toast('Enviando…', { ms: 1500 });
    const resultado = await procesar({ ignorarDeshacer: true, ignorarBackoff: true });

    if (!resultado) return;
    if (resultado.quedan === 0) {
      UI.toast(`Enviado${resultado.enviados === 1 ? '' : 's'} ${resultado.enviados}`);
    } else {
      /* Con el motivo delante se distingue en un vistazo lo que antes obligaba
         a ir al registro de Apps Script: sin cobertura, token mal, o el
         despliegue sin actualizar —"Petición sin movimientos" es exactamente
         eso: una versión vieja que no entiende lo que se le manda—. */
      const motivo = await NUCLEO.ultimoError();
      UI.toast(motivo
        ? `Siguen ${resultado.quedan} sin enviar: ${motivo}`
        : `Siguen ${resultado.quedan} sin enviar. ¿Hay conexión?`, { ms: 8000 });
    }
  }

  async function pintarIndicador() {
    const cuantos = await NUCLEO.contar();
    UI.pintarPendientes(cuantos);
    if (cuantos > 0) pedirSyncEnSegundoPlano();
    return cuantos;
  }

  /** Le pide al navegador que despierte al service worker cuando vuelva la red,
   *  aunque la app esté cerrada. Solo existe en Chromium; donde no, se ignora y
   *  la cola se vacía con la app abierta, que es lo mínimo garantizado. */
  async function pedirSyncEnSegundoPlano() {
    if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
    try {
      const registro = await navigator.serviceWorker.ready;
      await registro.sync.register('enviar-cola');
    } catch (_) {
      // Permiso denegado o navegador sin soporte real. No es un problema.
    }
  }

  function iniciar() {
    UI.el.btnPendientes.addEventListener('click', forzar);

    /* Al recuperar la red no se envía en el acto: el evento `online` salta en
       cuanto hay interfaz, que en un móvil saliendo del metro es antes de que
       haya conexión de verdad. Dos segundos evitan un fallo garantizado que
       además dispararía el backoff. */
    window.addEventListener('online', () => {
      // Se ignora el backoff: acaba de volver la red, que es exactamente la
      // condición que estábamos esperando. Respetarlo aquí dejaría movimientos
      // pendientes minutos después de tener conexión de sobra.
      setTimeout(() => procesar({ ignorarBackoff: true }), 2000);
    });

    // Al volver a la app, y al salir de ella.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') procesar();
    });

    clearInterval(temporizador);
    temporizador = setInterval(() => {
      if (navigator.onLine) procesar();
    }, MS_REINTENTO);

    // Al arrancar: lo que quedara de la sesión anterior sale ahora.
    procesar();
  }

  return { iniciar, procesar, forzar, pintarIndicador };
})();

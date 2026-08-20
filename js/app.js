/**
 * Arranque y pegamento.
 *
 * Aquí no hay lógica de negocio: se enciende el service worker, se comprueba
 * que el HTML y el JS sean de la misma versión, se cablean las pestañas y se
 * decide cuándo hablar con la hoja.
 */
const APP = (() => {

  /* Cada pantalla del rediseño tiene su hueco en index.html. Si falta uno, lo
     que hay cargado es un index.html de otra versión: pasa cuando el service
     worker sirve una mezcla, y antes se manifestaba como una app que se moría
     en silencio a mitad de un toque. Mejor decirlo en voz alta. */
  const HUECOS = [
    'pantalla-mes', 'pantalla-historial', 'pantalla-detalle', 'pantalla-fijos',
    'pantalla-fijo', 'pantalla-ahorro', 'pantalla-reparto', 'pantalla-anotar',
    'pantalla-ajustes', 'pantalla-categorias', 'pantalla-cuentas', 'pantalla-atajo',
    'pantalla-conectar', 'pantalla-quienes', 'pantalla-detectados',
    'tabs', 'deshacer', 'deshacer-texto', 'deshacer-boton', 'btn-anotar'
  ];

  function faltan() { return HUECOS.filter(id => !document.getElementById(id)); }

  function avisarDeVersionMezclada(ids) {
    const caja = document.getElementById('averia');
    if (!caja) return;
    caja.hidden = false;
    caja.innerHTML =
      '<h2 class="titulo">La app está a medias entre dos versiones</h2>' +
      '<p class="nota">Cierra la app del todo y vuelve a abrirla. Si sigue igual, ábrela dos ' +
      'veces seguidas: la primera se descarga la versión nueva y la segunda ya la sirve.</p>' +
      '<p class="nota">Faltan: ' + ids.join(', ') + '</p>';
    document.querySelector('.app').style.display = 'none';
  }

  /* -------------------------------------------------------------- pintar */

  let pintando = false;

  /** Repinta todas las pantallas. Es fuerza bruta a propósito: con listas de
   *  decenas de filas cuesta menos que llevar la cuenta de qué cambió, y no se
   *  puede desincronizar, que es el error que de verdad duele. */
  function pintarTodo() {
    if (pintando) return;
    pintando = true;
    try {
      MES.pintar();
      FIJOS.pintar();
      AHORRO.pintar();
      AJUSTES.pintar();
      if (VISTA.actual() === 'anotar') ANOTAR.pintar();
    } finally {
      pintando = false;
    }
  }

  /* ---------------------------------------------------------------- cola */

  /**
   * Intenta vaciar la cola y, si algo salió, vuelve a leer la hoja.
   *
   * Releer no es un capricho: el backend calcula cosas que la app no puede
   * —el próximo cargo de un fijo, las cuotas restantes, lo guardado en cada
   * meta— y hasta que no las devuelve, la pantalla enseña la versión optimista.
   */
  async function vaciarCola({ aMano = false } = {}) {
    const resultado = await NUCLEO.procesar({
      ignorarDeshacer: aMano,
      ignorarBackoff: aMano
    });
    await ESTADO.refrescarPendientes();

    /* Releer solo cuando la cola queda vacía. Con algo aún pendiente, lo que
       devuelve la hoja no incluye ese cambio, y pisar el estado con esa
       respuesta haría desaparecer de la pantalla un gasto que sí se anotó. */
    if (resultado.quedan === 0 && (resultado.enviados || aMano)) {
      await ESTADO.sincronizar({ silencioso: !aMano });
    }
    return resultado;
  }

  /**
   * Programa un vaciado tras encolar algo.
   *
   * Dos intentos y no uno: el primero es inmediato, para lo que sale ya; el
   * segundo espera a que venza la ventana de deshacer, que es la única razón
   * por la que un apunte puede seguir en la cola sin que haya fallado nada.
   * Sin el segundo, un borrado se quedaba esperando hasta que salías de la app.
   */
  let pendienteDeEnviar = null;
  function programarEnvio() {
    clearTimeout(pendienteDeEnviar);
    vaciarCola();
    pendienteDeEnviar = setTimeout(() => vaciarCola(), NUCLEO.MS_DESHACER + 500);
  }

  /* ------------------------------------------------------------ arranque */

  async function iniciar() {
    const ids = faltan();
    if (ids.length) { avisarDeVersionMezclada(ids); return; }

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => VISTA.ir(tab.dataset.tab));
    });
    document.getElementById('btn-anotar').addEventListener('click', () => ANOTAR.abrir());

    ESTADO.suscribir(pintarTodo);
    ESTADO.cuandoSeEncole(programarEnvio);
    await ESTADO.iniciar();
    VISTA.aplicarTema(ESTADO.estado().ajustes.tema);
    pintarTodo();

    // Sin endpoint no hay nada que enseñar: la primera pantalla es la conexión.
    if (!ESTADO.configurada()) {
      AJUSTES.abrirOnboarding();
    } else {
      /* El atajo del manifiesto abre directamente el teclado. Es la promesa de
         la pantalla Atajo: un toque en el icono y ya estás tecleando, sin
         pasar por el mes. */
      if (new URLSearchParams(location.search).get('anotar')) ANOTAR.abrir();
      await ESTADO.sincronizar({ silencioso: true });
      vaciarCola();
    }

    escuchar();
    registrarServiceWorker();
  }

  function escuchar() {
    /* Al volver a la app: vaciar lo pendiente y refrescar. Es el momento en que
       más probable es que haya red y que los números estén viejos. */
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        vaciarCola();
        ESTADO.sincronizar({ silencioso: true });
      }
    });

    window.addEventListener('online', () => {
      ESTADO.marcarConexion(true);
      vaciarCola({ aMano: true });
    });
    window.addEventListener('offline', () => ESTADO.marcarConexion(false));

    /* Al salir se intenta vaciar sin esperar la ventana de deshacer: si ya no
       puedes deshacerlo, no tiene sentido retenerlo. */
    window.addEventListener('pagehide', () => {
      NUCLEO.procesar({ ignorarDeshacer: true, ignorarBackoff: true });
    });

    VISTA.cuandoCambie(nombre => {
      if (nombre === 'anotar') ANOTAR.pintar();
    });
  }

  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(registro => {
      /* Background Sync: el navegador nos despierta cuando vuelve a haber red,
         aunque la app esté cerrada. Es el único camino para que un gasto
         anotado sin cobertura llegue a la hoja sin acordarse de abrir la app. */
      if (registro.sync) registro.sync.register('enviar-cola').catch(() => {});
    }).catch(() => { /* sin service worker la app funciona, solo que sin caché */ });

    /* La versión que sirve el service worker, para poder mirar el móvil y
       saber si tiene la última o una cacheada de hace tres despliegues. Ha
       ahorrado ya varios diagnósticos a ciegas. */
    navigator.serviceWorker.addEventListener('message', evento => {
      if (evento.data && evento.data.version) {
        version = evento.data.version;
        AJUSTES.pintar();
      }
    });
    navigator.serviceWorker.ready.then(registro => {
      if (registro.active) registro.active.postMessage('version');
    });
  }

  let version = '';
  function versionServida() { return version; }

  document.addEventListener('DOMContentLoaded', iniciar);

  return { vaciarCola, pintarTodo, versionServida };
})();

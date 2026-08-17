/**
 * Endpoint y token: lectura, escritura y la pantalla que los pide.
 *
 * Estos dos valores no están en config.js porque config.js va versionado y
 * GitHub Pages lo sirve en abierto. Viven solo en este teléfono.
 *
 * Se guardan en localStorage y no en IndexedDB, al revés que la cola de
 * movimientos de la fase 3. Son dos cadenas cortas que siempre puedes volver a
 * escribir si se pierden, y localStorage es síncrono: la app sabe al arrancar
 * si está configurada, sin esperar a una promesa antes del primer envío.
 */
const AJUSTES = (() => {

  const CLAVE = 'gastos.ajustes';

  const el = {
    pantalla: document.getElementById('pantalla-ajustes'),
    abrir: document.getElementById('btn-ajustes'),
    cerrar: document.getElementById('btn-cerrar-ajustes'),
    endpoint: document.getElementById('input-endpoint'),
    token: document.getElementById('input-token'),
    generar: document.getElementById('btn-generar-token'),
    probar: document.getElementById('btn-probar'),
    guardar: document.getElementById('btn-guardar-ajustes'),
    estado: document.getElementById('estado-ajustes'),
    version: document.getElementById('version-app')
  };

  function leer() {
    let guardados = {};
    try {
      guardados = JSON.parse(localStorage.getItem(CLAVE)) || {};
    } catch (_) {
      // localStorage corrupto o bloqueado: se sigue con lo que haya en config.js
    }
    return {
      endpoint: guardados.endpoint || CONFIG.ENDPOINT || '',
      token: guardados.token || CONFIG.TOKEN || ''
    };
  }

  function escribir(ajustes) {
    localStorage.setItem(CLAVE, JSON.stringify({
      endpoint: (ajustes.endpoint || '').trim(),
      token: (ajustes.token || '').trim()
    }));
  }

  function configurado() {
    const a = leer();
    return Boolean(a.endpoint && a.token);
  }

  /** Genera el token aquí y no en el script para que no tengas que inventarte
   *  una cadena aleatoria a mano. Se pega tal cual en las Propiedades del
   *  Script; es lo único que separa tu hoja de cualquiera que dé con la URL. */
  function generarToken() {
    if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ------------------------------------------------------------- pantalla */

  function abrir() {
    const a = leer();
    el.endpoint.value = a.endpoint;
    el.token.value = a.token;
    estado('');
    mostrarVersion();
    el.pantalla.hidden = false;
  }

  /** Le pregunta al service worker qué versión está sirviendo. Si no contesta
   *  es que no hay ninguno al mando: la app va directa a la red, sin caché. */
  function mostrarVersion() {
    const sw = navigator.serviceWorker;
    if (!sw || !sw.controller) {
      el.version.textContent = 'sin service worker (siempre desde la red)';
      return;
    }
    el.version.textContent = 'consultando…';
    const canal = evento => {
      if (evento.data && evento.data.version) {
        el.version.textContent = evento.data.version;
        sw.removeEventListener('message', canal);
      }
    };
    sw.addEventListener('message', canal);
    sw.controller.postMessage('version');
  }

  function cerrar() {
    el.pantalla.hidden = true;
  }

  function estado(texto, tipo = '') {
    el.estado.textContent = texto;
    el.estado.className = 'estado-ajustes' + (tipo ? ' ' + tipo : '');
  }

  function valores() {
    return { endpoint: el.endpoint.value.trim(), token: el.token.value.trim() };
  }

  /** Lo que impide guardar: sin esto no hay nada que intentar. */
  function problema({ endpoint, token }) {
    if (!endpoint) return 'Falta la URL del Apps Script';
    let url;
    try {
      url = new URL(endpoint);
    } catch (_) {
      return 'Eso no es una URL';
    }
    if (url.protocol !== 'https:') return 'La URL tiene que ser https';
    if (!token) return 'Falta el token';
    return null;
  }

  /** Lo que huele mal pero no bloquea. El error de despliegue más habitual es
   *  copiar la URL del editor, o la que acaba en /dev en vez de /exec. Aviso
   *  en lugar de rechazar: no me consta que la forma de esa URL sea eterna, y
   *  quedarse sin poder guardar una URL válida sería peor. */
  function aviso({ endpoint }) {
    if (/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint)) return null;
    return 'Ojo: esa URL no tiene la forma habitual (…/macros/s/…/exec). Prueba la conexión antes de fiarte.';
  }

  async function probar() {
    const v = valores();
    const bloqueo = problema(v);
    if (bloqueo) return estado(bloqueo, 'error');

    estado('Probando…');
    try {
      const resumen = await API.consultar(v);
      estado(`Conectado. ${resumen.ultimos.length} movimientos en la hoja, ` +
             `${resumen.mes.gastos} de gasto este mes.`, 'ok');
    } catch (error) {
      estado('No conecta: ' + error.message, 'error');
    }
  }

  function guardar() {
    const v = valores();
    const bloqueo = problema(v);
    if (bloqueo) return estado(bloqueo, 'error');

    escribir(v);
    cerrar();

    const sospecha = aviso(v);
    UI.toast(sospecha || 'Ajustes guardados', { ms: sospecha ? 6000 : 2500 });
  }

  function iniciar() {
    el.abrir.addEventListener('click', abrir);
    el.cerrar.addEventListener('click', cerrar);
    el.generar.addEventListener('click', () => {
      el.token.value = generarToken();
      estado('Token nuevo. Pégalo también en las Propiedades del Script.', 'ok');
    });
    el.probar.addEventListener('click', probar);
    el.guardar.addEventListener('click', guardar);
  }

  return { leer, configurado, abrir, iniciar };
})();

/**
 * Endpoint y token: lectura, escritura y la pantalla que los pide.
 *
 * Estos dos valores no están en config.js porque config.js va versionado y
 * GitHub Pages lo sirve en abierto. Viven solo en este teléfono.
 *
 * Se guardan en IndexedDB, no en localStorage. En la fase 2 estaban en
 * localStorage por ser síncrono, pero un service worker no puede leer
 * localStorage: sin esto no podría vaciar la cola con la app cerrada. La
 * lectura pasa a ser asíncrona, que a cambio no molesta a nadie.
 */
const AJUSTES = (() => {

  const CLAVE_VIEJA = 'gastos.ajustes';

  const el = {
    pantalla: document.getElementById('pantalla-ajustes'),
    // No hay botón propio en la cabecera: se entra desde el resumen. Los
    // ajustes se tocan una vez y el hueco de la cabecera vale más para otra cosa.
    cerrar: document.getElementById('btn-cerrar-ajustes'),
    endpoint: document.getElementById('input-endpoint'),
    token: document.getElementById('input-token'),
    generar: document.getElementById('btn-generar-token'),
    probar: document.getElementById('btn-probar'),
    guardar: document.getElementById('btn-guardar-ajustes'),
    usuario: document.getElementById('select-usuario'),
    estado: document.getElementById('estado-ajustes'),
    version: document.getElementById('version-app')
  };

  const leer = NUCLEO.leerAjustes;
  const escribir = NUCLEO.guardarAjustes;

  async function configurado() {
    const a = await leer();
    return Boolean(a.endpoint && a.token);
  }

  /** Los ajustes vivían en localStorage hasta la fase 3. Se traen a IndexedDB
   *  la primera vez para que nadie tenga que volver a teclear su token. */
  async function migrarDesdeLocalStorage() {
    let viejos;
    try {
      viejos = JSON.parse(localStorage.getItem(CLAVE_VIEJA));
    } catch (_) {
      return;
    }
    if (!viejos || !viejos.endpoint) return;

    const actuales = await leer();
    if (!actuales.endpoint) await escribir(viejos);
    localStorage.removeItem(CLAVE_VIEJA);
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

  async function abrir() {
    // La pantalla se muestra ya y los campos se rellenan al llegar de disco:
    // esperar a IndexedDB antes de pintar dejaría un parpadeo en blanco.
    estado('');
    mostrarVersion();
    el.pantalla.hidden = false;

    const a = await leer();
    el.endpoint.value = a.endpoint;
    el.token.value = a.token;
    el.usuario.value = a.usuario;
  }

  function pintarUsuarios() {
    el.usuario.innerHTML = '';
    CONFIG.USUARIOS.forEach(nombre => {
      const opcion = document.createElement('option');
      opcion.value = nombre;
      opcion.textContent = nombre;
      el.usuario.appendChild(opcion);
    });
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
    return {
      endpoint: el.endpoint.value.trim(),
      token: el.token.value.trim(),
      usuario: el.usuario.value
    };
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

  async function guardar() {
    const v = valores();
    const bloqueo = problema(v);
    if (bloqueo) return estado(bloqueo, 'error');

    await escribir(v);
    cerrar();

    const sospecha = aviso(v);
    UI.toast(sospecha || 'Ajustes guardados', { ms: sospecha ? 6000 : 2500 });

    // Si había movimientos esperando por falta de configuración, ya pueden salir.
    COLA.procesar({ ignorarDeshacer: true, ignorarBackoff: true });
  }

  async function iniciar() {
    pintarUsuarios();
    el.cerrar.addEventListener('click', cerrar);
    el.generar.addEventListener('click', () => {
      el.token.value = generarToken();
      estado('Token nuevo. Pégalo también en las Propiedades del Script.', 'ok');
    });
    el.probar.addEventListener('click', probar);
    el.guardar.addEventListener('click', guardar);

    await migrarDesdeLocalStorage();
  }

  return { leer, configurado, abrir, iniciar };
})();

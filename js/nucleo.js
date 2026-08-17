/**
 * Núcleo compartido: IndexedDB y envío al backend.
 *
 * Este archivo lo cargan DOS mundos distintos: la página, con <script>, y el
 * service worker, con importScripts. Por eso no toca el DOM ni usa nada de
 * `window`: si aquí dentro apareciera un document.getElementById, el service
 * worker reventaría al importarlo.
 *
 * Y por eso los ajustes viven en IndexedDB y no en localStorage: un service
 * worker no tiene acceso a localStorage, y sin poder leer el endpoint y el
 * token no podría vaciar la cola con la app cerrada.
 */
const NUCLEO = (() => {

  const BD = 'gastos';
  const VERSION_BD = 1;
  const COLA = 'cola';
  const AJUSTES = 'ajustes';

  const MS_DESHACER = 5000;
  const MAX_ESPERA = 5 * 60 * 1000;   // tope del backoff: 5 minutos

  /* ---------------------------------------------------------- IndexedDB */

  function abrir() {
    return new Promise((resolve, rechazar) => {
      const solicitud = indexedDB.open(BD, VERSION_BD);
      solicitud.onupgradeneeded = () => {
        const bd = solicitud.result;
        // La clave es el uuid del movimiento: reencolar dos veces el mismo
        // sobrescribe en vez de duplicar.
        if (!bd.objectStoreNames.contains(COLA)) bd.createObjectStore(COLA, { keyPath: 'uuid' });
        if (!bd.objectStoreNames.contains(AJUSTES)) bd.createObjectStore(AJUSTES);
      };
      solicitud.onsuccess = () => resolve(solicitud.result);
      solicitud.onerror = () => rechazar(solicitud.error);
    });
  }

  async function conTienda(nombre, modo, trabajo) {
    const bd = await abrir();
    return new Promise((resolve, rechazar) => {
      const tx = bd.transaction(nombre, modo);
      const resultado = trabajo(tx.objectStore(nombre));
      tx.oncomplete = () => {
        bd.close();
        /* Si el trabajo devolvió una IDBRequest, lo interesante es su .result.
           Se comprueba con `in` y no con `!== undefined`, porque una búsqueda
           sin resultado da undefined y devolveríamos el objeto de la petición
           en vez del "no hay nada" que espera quien llama. */
        const esSolicitud = resultado && typeof resultado === 'object' && 'result' in resultado;
        resolve(esSolicitud ? resultado.result : resultado);
      };
      tx.onerror = () => { bd.close(); rechazar(tx.error); };
      tx.onabort = () => { bd.close(); rechazar(tx.error); };
    });
  }

  /* ------------------------------------------------------------ ajustes */

  async function leerAjustes() {
    const guardados = await conTienda(AJUSTES, 'readonly', t => t.get('config'));
    const a = guardados || {};
    return {
      endpoint: a.endpoint || CONFIG.ENDPOINT || '',
      token: a.token || CONFIG.TOKEN || '',
      usuario: usuarioValido(a.usuario)
    };
  }

  /**
   * Devuelve un nombre que exista de verdad en la lista de usuarios.
   *
   * Hace falta porque el nombre guardado sobrevive a los cambios de config.js.
   * Cuando "Gonzalo Aguirre" pasó a ser "Gonzalo", los teléfonos siguieron
   * estampando el nombre viejo: el valor guardado ganaba a la lista nueva, y las
   * filas se escribían con un usuario que ya no existía. En la hoja se veían
   * bien; en el panel, sumaban cero.
   *
   * Se intenta emparejar por el nombre de pila antes de rendirse al primero de
   * la lista, porque es el tipo de cambio más probable.
   */
  function usuarioValido(guardado) {
    const lista = CONFIG.USUARIOS || [];
    const nombre = String(guardado || '').trim();

    if (!nombre) return lista[0] || '';
    if (lista.indexOf(nombre) !== -1) return nombre;

    const pila = nombre.split(' ')[0];
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].split(' ')[0] === pila) return lista[i];
    }
    return lista[0] || '';
  }

  function guardarAjustes(ajustes) {
    return conTienda(AJUSTES, 'readwrite', t => t.put({
      endpoint: (ajustes.endpoint || '').trim(),
      token: (ajustes.token || '').trim(),
      usuario: (ajustes.usuario || '').trim()
    }, 'config'));
  }

  /* El último resumen recibido se guarda para poder enseñar algo sin red. Va en
     la misma tienda que los ajustes porque es lo mismo: un dato suelto que
     sobrevive entre sesiones y no forma parte de la cola. */
  function guardarResumen(datos) {
    return conTienda(AJUSTES, 'readwrite', t => t.put({ datos, recibido: Date.now() }, 'resumen'));
  }

  function leerResumen() {
    return conTienda(AJUSTES, 'readonly', t => t.get('resumen'));
  }

  /* --------------------------------------------------------------- cola */

  /**
   * Mete filas en la cola. Todas las de una misma llamada comparten `grupo`,
   * que es lo que permite deshacer un traspaso entero y enviar sus dos filas
   * en la misma petición.
   *
   * `enviarDespues` es lo que implementa la ventana de deshacer: la fila está
   * a salvo en disco desde el primer instante, pero no sale hasta que pasan los
   * cinco segundos. Si cierras la app en ese rato, el movimiento no se pierde.
   */
  async function encolar(filas, grupo, accion, esperarDeshacer = true) {
    const ahora = Date.now();
    const registros = filas.map(fila => ({
      uuid: fila.uuid,
      fila: fila,
      grupo: grupo,
      /* Qué hay que hacer con esto al enviarlo: escribir movimientos o dar de
         alta una suscripción. Va en cada registro y no en una cola aparte para
         que los reintentos, el backoff y el Background Sync valgan para ambos
         sin duplicar nada. */
      accion: accion || 'movimientos',
      creado: ahora,
      /* Dos esperas distintas y separadas a propósito:
         - listoEn: la ventana de deshacer. Se fija una vez y no se mueve.
         - reintentarEn: el backoff tras un fallo. Cambia con cada intento.
         Estuvieron en un solo campo y fue un error: al volver la red había que
         saltarse el backoff, pero saltárselo también se cargaba la ventana de
         deshacer. Ahora cada una se puede ignorar por su cuenta. */
      listoEn: ahora + (esperarDeshacer ? MS_DESHACER : 0),
      reintentarEn: 0,
      intentos: 0,
      ultimoError: ''
    }));
    await conTienda(COLA, 'readwrite', t => registros.forEach(r => t.put(r)));
    return registros;
  }

  function todos() {
    return conTienda(COLA, 'readonly', t => t.getAll());
  }

  async function contar() {
    const n = await conTienda(COLA, 'readonly', t => t.count());
    return n || 0;
  }

  function borrar(uuid) {
    return conTienda(COLA, 'readwrite', t => t.delete(uuid));
  }

  async function borrarGrupo(grupo) {
    const registros = await todos();
    const suyos = registros.filter(r => r.grupo === grupo);
    await conTienda(COLA, 'readwrite', t => suyos.forEach(r => t.delete(r.uuid)));
    return suyos.length;
  }

  /* -------------------------------------------------------------- envío */

  async function enviar(filas, ajustes, accion) {
    if (CONFIG.MODO_PRUEBA) {
      console.log('[MODO_PRUEBA] no se envía nada. Filas:', filas);
      return { ok: true, prueba: true };
    }

    const config = ajustes || await leerAjustes();
    if (!config.endpoint || !config.token) throw new Error('Falta configurar el endpoint o el token');

    /* text/plain a propósito: Apps Script no contesta al preflight OPTIONS, así
       que la petición tiene que ser "simple". Ver el README. */
    const respuesta = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(accion === 'suscripcion'
        ? { token: config.token, accion: 'suscripcion', suscripcion: filas[0] }
        : { token: config.token, movimientos: filas }),
      redirect: 'follow'
    });

    return interpretar(respuesta);
  }

  async function consultar(ajustes, cuantos = 10) {
    const config = ajustes || await leerAjustes();
    if (!config.endpoint || !config.token) throw new Error('Falta configurar el endpoint o el token');

    // La lectura va por POST igual que la escritura: el doGet muere en la
    // redirección de Apps Script, que se lleva por delante las cabeceras CORS.
    const respuesta = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: config.token, accion: 'resumen', n: cuantos }),
      redirect: 'follow'
    });

    return interpretar(respuesta);
  }

  async function interpretar(respuesta) {
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
    const texto = await respuesta.text();
    let datos;
    try {
      datos = JSON.parse(texto);
    } catch (_) {
      throw new Error('El endpoint no devuelve JSON. Revisa que el despliegue sea "Cualquier persona" y que la URL acabe en /exec');
    }
    if (!datos.ok) throw new Error(datos.error || 'Error desconocido del backend');
    return datos;
  }

  /* ------------------------------------------------------------ vaciado */

  /**
   * Intenta enviar lo que haya en la cola.
   *
   * @param {boolean} ignorarDeshacer saltarse la ventana de cinco segundos. Se
   *        usa al salir de la app: si ya no puedes deshacer, no hay que esperar.
   * @param {boolean} ignorarBackoff saltarse la espera tras un fallo. Se usa
   *        cuando vuelve la red o cuando lo pides tú: el backoff existe para no
   *        machacar la batería sin cobertura, no para retrasar el momento en
   *        que por fin hay conexión.
   * @returns {Promise<{enviados, fallidos, quedan}>}
   */
  async function procesar({ ignorarDeshacer = false, ignorarBackoff = false } = {}) {
    const registros = await todos();
    const ahora = Date.now();

    const listos = registros.filter(r =>
      (ignorarDeshacer || (r.listoEn || 0) <= ahora) &&
      (ignorarBackoff || (r.reintentarEn || 0) <= ahora));
    if (!listos.length) return { enviados: 0, fallidos: 0, quedan: registros.length };

    // Las filas de un traspaso van juntas en la misma petición: media
    // transferencia escrita descuadraría las dos cuentas.
    const grupos = new Map();
    listos.forEach(r => {
      if (!grupos.has(r.grupo)) grupos.set(r.grupo, []);
      grupos.get(r.grupo).push(r);
    });

    let ajustes;
    try {
      ajustes = await leerAjustes();
    } catch (_) {
      return { enviados: 0, fallidos: listos.length, quedan: registros.length };
    }

    let enviados = 0, fallidos = 0;

    for (const registrosDelGrupo of grupos.values()) {
      try {
        await enviar(registrosDelGrupo.map(r => r.fila), ajustes,
                     registrosDelGrupo[0].accion);
        // El backend responde ok también cuando el uuid ya estaba registrado,
        // así que un reintento de algo ya guardado también limpia la cola.
        for (const r of registrosDelGrupo) await borrar(r.uuid);
        enviados += registrosDelGrupo.length;
      } catch (error) {
        fallidos += registrosDelGrupo.length;
        await posponer(registrosDelGrupo, error);
      }
    }

    return { enviados, fallidos, quedan: await contar() };
  }

  /** Backoff exponencial con tope. Sin esto, sin cobertura la app se pasaría el
   *  día reintentando y gastando batería. */
  async function posponer(registros, error) {
    const ahora = Date.now();
    const actualizados = registros.map(r => {
      const intentos = (r.intentos || 0) + 1;
      const espera = Math.min(MS_DESHACER * Math.pow(2, intentos), MAX_ESPERA);
      return { ...r, intentos, ultimoError: String(error.message || error), reintentarEn: ahora + espera };
    });
    await conTienda(COLA, 'readwrite', t => actualizados.forEach(r => t.put(r)));
  }

  return {
    MS_DESHACER,
    leerAjustes, guardarAjustes, guardarResumen, leerResumen,
    encolar, todos, contar, borrar, borrarGrupo,
    enviar, consultar, procesar
  };
})();

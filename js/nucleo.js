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

  const MS_DESHACER = 7000;
  const MAX_ESPERA = 5 * 60 * 1000;   // tope del backoff: 5 minutos

  /* ---------------------------------------------------------- IndexedDB */

  function abrir() {
    return new Promise((resolve, rechazar) => {
      const solicitud = indexedDB.open(BD, VERSION_BD);
      solicitud.onupgradeneeded = () => {
        const bd = solicitud.result;
        // La clave es el uuid del apunte: reencolar dos veces el mismo
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

  /* ------------------------------------------------------------ ajustes

     Aquí solo vive lo que es DE ESTE TELÉFONO: la conexión, quién anota en él,
     su cuenta habitual y el tema. El plan del mes, el límite de aviso y qué
     avisos están activos son de los dos, así que viven en la hoja: si Camila
     sube el plan, Gonzalo tiene que verlo subido. */

  const AJUSTES_POR_DEFECTO = {
    endpoint: '',
    token: '',
    persona: '',
    cuenta: '',
    tema: 'sistema',
    onboarding: false
  };

  async function leerAjustes() {
    const guardados = await conTienda(AJUSTES, 'readonly', t => t.get('config'));
    const a = guardados || {};
    return Object.assign({}, AJUSTES_POR_DEFECTO, a, {
      endpoint: a.endpoint || CONFIG.ENDPOINT || '',
      token: a.token || CONFIG.TOKEN || ''
    });
  }

  /** Guarda solo lo que le pasas, sin pisar el resto. Antes recibía el objeto
   *  entero y cualquier pantalla que se olvidara de un campo lo borraba. */
  async function guardarAjustes(cambios) {
    const actuales = await conTienda(AJUSTES, 'readonly', t => t.get('config')) || {};
    const nuevos = Object.assign({}, actuales, cambios);
    await conTienda(AJUSTES, 'readwrite', t => t.put(nuevos, 'config'));
    return Object.assign({}, AJUSTES_POR_DEFECTO, nuevos);
  }

  /* El último mes recibido se guarda entero para poder pintar la app sin red.
     Va en la misma tienda que los ajustes porque es lo mismo: un dato suelto
     que sobrevive entre sesiones y no forma parte de la cola. */
  function guardarMes(datos) {
    return conTienda(AJUSTES, 'readwrite', t => t.put({ datos, recibido: Date.now() }, 'mes'));
  }

  function leerMes() {
    return conTienda(AJUSTES, 'readonly', t => t.get('mes'));
  }

  /**
   * Deja este teléfono sin datos: se va la copia del mes y se va la cola.
   *
   * La conexión, quién anota aquí y el tema se quedan. Son de este teléfono
   * pero no son datos de gastos, y borrarlos obligaría a volver a pegar la URL
   * y el token para recuperar lo que sigue estando en la hoja.
   *
   * Devuelve lo que había en la cola. La copia del mes se recupera
   * sincronizando —la hoja manda—, pero un apunte sin enviar no está en ningún
   * otro sitio, así que quien llame puede reponerlo.
   */
  async function olvidarDatos() {
    const enCola = await todos();
    await conTienda(COLA, 'readwrite', t => t.clear());
    await conTienda(AJUSTES, 'readwrite', t => t.delete('mes'));
    return enCola;
  }

  /* --------------------------------------------------------------- cola */

  /**
   * Mete apuntes en la cola. Todos los de una misma llamada comparten `grupo`,
   * que es lo que permite deshacer una operación entera y enviar sus filas en
   * la misma petición.
   *
   * `esperarDeshacer` es lo que implementa la ventana de deshacer: el apunte
   * está a salvo en disco desde el primer instante, pero no sale hasta que
   * pasan los siete segundos. Si cierras la app en ese rato, no se pierde.
   */
  async function encolar(filas, grupo, accion, esperarDeshacer = true) {
    const ahora = Date.now();
    const registros = filas.map(fila => ({
      uuid: fila.uuid,
      fila: fila,
      grupo: grupo,
      /* Qué hay que hacer con esto al enviarlo. Va en cada registro y no en una
         cola aparte para que los reintentos, el backoff y el Background Sync
         valgan para todas las acciones sin duplicar nada. */
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

  /**
   * El motivo del último intento fallido.
   *
   * Existe porque "siguen 1 sin enviar" no dice nada: puede ser la red, el
   * token, o un despliegue viejo del Apps Script que no entiende lo que se le
   * manda. El backend contesta con mensajes en claro y aquí se guardaban sin
   * que nadie los mirara, así que había que ir a adivinar al registro de
   * ejecuciones de Google.
   */
  async function ultimoError() {
    const registros = await todos();
    var reciente = null;
    registros.forEach(function (r) {
      if (!r.ultimoError) return;
      if (!reciente || (r.reintentarEn || 0) > (reciente.reintentarEn || 0)) reciente = r;
    });
    return reciente ? reciente.ultimoError : '';
  }

  async function borrarGrupo(grupo) {
    const registros = await todos();
    const suyos = registros.filter(r => r.grupo === grupo);
    await conTienda(COLA, 'readwrite', t => suyos.forEach(r => t.delete(r.uuid)));
    return suyos.length;
  }

  /** Devuelve a la cola unos registros retirados. Es lo que deshace un
   *  "Descartar": lo que se sacó vuelve tal cual, con sus intentos y su
   *  motivo, porque descartar por error no debería costar el apunte. */
  async function reponer(registros) {
    if (!registros || !registros.length) return 0;
    await conTienda(COLA, 'readwrite', t => registros.forEach(r => t.put(r)));
    return registros.length;
  }

  /**
   * Manda UN grupo ahora mismo, saltándose las dos esperas.
   *
   * Es lo que hay detrás del "Enviar ahora" de una fila de la cola. `procesar`
   * manda todo lo que esté listo, que es lo correcto para el botón de abajo;
   * aquí hace falta poder empujar solo el apunte que tienes delante y contar
   * qué ha pasado con ÉL, sin que el resultado se mezcle con el de los demás.
   */
  async function enviarGrupo(grupo) {
    const suyos = (await todos()).filter(r => r.grupo === grupo);
    if (!suyos.length) return { enviados: 0, motivo: '' };
    let ajustes;
    try {
      ajustes = await leerAjustes();
    } catch (error) {
      return { enviados: 0, motivo: motivoEnClaro(error) };
    }
    try {
      await enviar(suyos.map(r => r.fila), ajustes, suyos[0].accion);
      for (const r of suyos) await borrar(r.uuid);
      return { enviados: suyos.length, motivo: '' };
    } catch (error) {
      await posponer(suyos, error);
      return { enviados: 0, motivo: motivoEnClaro(error) };
    }
  }

  /* -------------------------------------------------------------- envío */

  /**
   * Una petición al Apps Script. Todo va por POST, incluida la lectura: el
   * doGet muere en la redirección de Google, que se lleva por delante las
   * cabeceras CORS.
   *
   * Y todo va con Content-Type text/plain, porque Apps Script no contesta al
   * preflight OPTIONS: la petición tiene que ser "simple" para el navegador.
   */
  async function pedir(accion, carga, ajustes) {
    const config = ajustes || await leerAjustes();
    if (!config.endpoint || !config.token) throw new Error('Falta configurar el endpoint o el token');

    const respuesta = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ token: config.token, accion: accion }, carga)),
      redirect: 'follow'
    });

    return interpretar(respuesta);
  }

  /** Envía un grupo de la cola. Cada acción tiene su forma en el cuerpo; el
   *  resto es idéntico, por eso comparten `pedir`. */
  function enviar(filas, ajustes, accion) {
    if (CONFIG.MODO_PRUEBA) {
      console.log('[MODO_PRUEBA] no se envía nada:', accion, filas);
      return Promise.resolve({ ok: true, prueba: true });
    }
    if (accion === 'movimientos') return pedir('movimientos', { movimientos: filas }, ajustes);
    // Las demás acciones mandan un solo apunte por grupo.
    return pedir(accion, { datos: filas[0] }, ajustes);
  }

  /** Lee el mes entero: movimientos, fijos, metas, listas y config. Es la única
   *  lectura de la app; todo lo que se ve sale de aquí. */
  function consultarMes(mes, ajustes) {
    return pedir('mes', mes ? { mes } : {}, ajustes);
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
    if (!datos.ok) {
      /* Marcado a propósito. Un "no" del servidor NO es falta de conexión: la
         petición ha ido y ha vuelto. Sin distinguirlo, la app enseñaba "Sin
         conexión" con cobertura de sobra y mandaba a buscar un problema de red
         que no existía. */
      const fallo = new Error(datos.error || 'Error desconocido del backend');
      fallo.delServidor = true;
      throw fallo;
    }
    return datos;
  }

  /**
   * El motivo de un fallo, en algo que se pueda leer.
   *
   * Cuando la petición no llega a salir, `fetch` lanza «Failed to fetch», y eso
   * es lo que acababa impreso en Ajustes → Pendientes: en inglés y sin decir
   * nada. Distinguir «no hay cobertura» de «la hoja ha contestado que no» es la
   * mitad del valor de esa pantalla —la primera se arregla sola y la segunda
   * casi nunca—, así que el mensaje tiene que decirlo.
   *
   * Un fallo del servidor se deja tal cual: ese texto lo ha escrito el backend
   * para que alguien lo lea.
   */
  function motivoEnClaro(error) {
    if (error && error.delServidor) return String(error.message || error);
    const texto = String((error && error.message) || error || '');
    /* Cada navegador lo dice a su manera: Chrome «Failed to fetch», Firefox
       «NetworkError when attempting to fetch resource», Safari «Load failed». */
    return /failed to fetch|networkerror|load failed|network request failed/i.test(texto)
      ? 'Sin conexión'
      : texto;
  }

  /* ------------------------------------------------------------ vaciado */

  /**
   * Intenta enviar lo que haya en la cola.
   *
   * @param {boolean} ignorarDeshacer saltarse la ventana de deshacer. Se usa al
   *        salir de la app: si ya no puedes deshacer, no hay que esperar.
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

    // Las filas de un mismo grupo van juntas en la misma petición: medio
    // reparto escrito descuadraría el ahorro.
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

    let enviados = 0, fallidos = 0, motivo = '';

    /* El orden importa: los grupos se envían por antigüedad. Editar un
       movimiento antes de haberlo dado de alta dejaría el cambio sin destino. */
    const ordenados = [...grupos.values()].sort((a, b) => (a[0].creado || 0) - (b[0].creado || 0));

    for (const registrosDelGrupo of ordenados) {
      try {
        await enviar(registrosDelGrupo.map(r => r.fila), ajustes,
                     registrosDelGrupo[0].accion);
        // El backend responde ok también cuando el uuid ya estaba registrado,
        // así que un reintento de algo ya guardado también limpia la cola.
        for (const r of registrosDelGrupo) await borrar(r.uuid);
        enviados += registrosDelGrupo.length;
      } catch (error) {
        fallidos += registrosDelGrupo.length;
        motivo = motivoEnClaro(error);
        await posponer(registrosDelGrupo, error);
      }
    }

    return { enviados, fallidos, motivo, quedan: await contar() };
  }

  /** Backoff exponencial con tope. Sin esto, sin cobertura la app se pasaría el
   *  día reintentando y gastando batería. */
  async function posponer(registros, error) {
    const ahora = Date.now();
    const actualizados = registros.map(r => {
      const intentos = (r.intentos || 0) + 1;
      const espera = Math.min(MS_DESHACER * Math.pow(2, intentos), MAX_ESPERA);
      return {
        ...r, intentos,
        ultimoError: motivoEnClaro(error),
        // Cuándo se intentó, no cuándo toca el siguiente: es lo que hay que
        // poder leer en la pantalla de pendientes.
        ultimoIntento: ahora,
        reintentarEn: ahora + espera
      };
    });
    await conTienda(COLA, 'readwrite', t => actualizados.forEach(r => t.put(r)));
  }

  return {
    MS_DESHACER,
    leerAjustes, guardarAjustes, guardarMes, leerMes, olvidarDatos,
    encolar, todos, contar, borrar, borrarGrupo, reponer, ultimoError,
    pedir, enviar, enviarGrupo, consultarMes, procesar
  };
})();
